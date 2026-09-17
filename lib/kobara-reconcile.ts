import type { SupabaseClient } from "@supabase/supabase-js";
import {
  kobaraEstPaye,
  redactKobaraPayment,
  retrieveKobaraPayment,
  type KobaraPayment,
} from "@/lib/kobara";

/**
 * RÉCONCILIATION DU RAIL KOBARA — l'invariant (c) de `docs/03` appliqué à la
 * passerelle : aucun paiement orphelin.
 *
 * ⚠️ POURQUOI CE FICHIER EXISTE ALORS QUE LE WEBHOOK EST SIGNÉ. L'étape 5 de
 * la checklist `docs/03` §9 est explicite : « un rail S2S non branché =
 * paiements orphelins silencieux ». Un webhook peut ne jamais arriver — DNS,
 * déploiement en cours, 500 de notre côté pendant la fenêtre de réessai de la
 * passerelle, ou simplement une URL de rappel mal recopiée. Sans cette passe,
 * l'acheteur aurait payé et la commande resterait `pending` pour toujours,
 * sans que rien ne le signale : le paiement est chez le prestataire, pas chez
 * nous, et c'est exactement le trou que le réconciliateur MonCash a été écrit
 * pour fermer.
 *
 * Stripe est confirmé par webhook signé ET N'EST PAS réconcilié — c'est
 * assumé et justifié dans `app/api/reconcile/route.ts` : Stripe rejoue ses
 * événements pendant 72 h. La documentation de Kobara lue le 2026-08-24
 * n'annonce **aucune politique de rejeu**. En l'absence de cette garantie, on
 * ne peut pas emprunter la justification de Stripe : on interroge.
 *
 * ⚠️ NON ÉPROUVÉ CONTRE L'HÔTE RÉEL. Aucun appel n'a jamais été émis vers
 * `api.kobara.app` (EGRESS_BLOCKED, aucun compte). Les tests de ce module
 * utilisent des doublures : ils prouvent l'ORCHESTRATION, jamais le contrat
 * de la passerelle.
 */

export type PendingKobara = {
  idempotency_key: string;
  order_id: string;
  created_at: string;
  raw: Record<string, unknown> | null;
};

export type KobaraReconcileDeps = {
  listPending: () => Promise<PendingKobara[]>;
  retrieve: (paymentId: string) => Promise<KobaraPayment | null>;
  confirm: (input: {
    idempotencyKey: string;
    providerRef: string;
    amount: number;
    raw: KobaraPayment;
  }) => Promise<{ status?: string; error?: string }>;
  expire: (idempotencyKey: string, reason: string) => Promise<{ error?: string }>;
  now?: () => number;
};

export type KobaraReconcileResult = {
  scanned: number;
  confirmed: number;
  stillPending: number;
  expired: number;
  sansIdentifiant: number;
  errors: string[];
};

/** Au-delà, un `pending` n'aboutira plus : même seuil que MonCash (BL-101). */
export const AGE_ABANDON_MS = 48 * 60 * 60 * 1000;

export async function reconcileKobara(
  deps: KobaraReconcileDeps
): Promise<KobaraReconcileResult> {
  const pendings = await deps.listPending();
  const now = deps.now ? deps.now() : Date.now();
  const res: KobaraReconcileResult = {
    scanned: pendings.length,
    confirmed: 0,
    stillPending: 0,
    expired: 0,
    sansIdentifiant: 0,
    errors: [],
  };

  for (const p of pendings) {
    try {
      const id = p.raw?.kobara_payment_id;
      const paymentId = typeof id === "string" && id ? id : null;

      /* ⚠️ PAS D'IDENTIFIANT DE SESSION : on ne peut RIEN demander à la
       * passerelle. Ce cas n'est pas théorique — il se produit si le processus
       * meurt entre l'insertion du paiement et la mise à jour de `raw`. On le
       * COMPTE plutôt que de l'ignorer : sans ce compteur, « aucun paiement à
       * réconcilier » et « trois paiements qu'on ne sait pas interroger »
       * rendent le même zéro. */
      if (!paymentId) {
        res.sansIdentifiant++;
        if (now - new Date(p.created_at).getTime() > AGE_ABANDON_MS) {
          const { error } = await deps.expire(p.idempotency_key, "kobara_sans_identifiant_48h");
          if (error) res.errors.push(`${p.idempotency_key}: ${error}`);
          else res.expired++;
        }
        continue;
      }

      const paiement = await deps.retrieve(paymentId);

      if (kobaraEstPaye(paiement) && paiement) {
        /* Le montant transmis est celui rapporté par la passerelle, et c'est
         * `confirm_payment` qui le compare à `orders.amount_htg` EN BASE. On
         * ne fait pas cette comparaison ici : un contrôle dans le code d'appel
         * peut être contourné par un autre appelant, un contrôle en base ne
         * peut pas l'être. */
        const { status, error } = await deps.confirm({
          idempotencyKey: p.idempotency_key,
          providerRef: paiement.providerRef ?? paiement.id,
          amount: Math.round(paiement.amount),
          raw: paiement,
        });
        if (error) res.errors.push(`${p.idempotency_key}: ${error}`);
        else if (status === "confirmed") res.confirmed++;
        else res.stillPending++;
        continue;
      }

      // Ni payé, ni introuvable : trop vieux → état terminal, sinon on attend.
      if (now - new Date(p.created_at).getTime() > AGE_ABANDON_MS) {
        const raison = paiement === null ? "kobara_introuvable_48h" : `kobara_${paiement.status}_48h`;
        const { error } = await deps.expire(p.idempotency_key, raison);
        if (error) res.errors.push(`${p.idempotency_key}: ${error}`);
        else res.expired++;
      } else {
        res.stillPending++;
      }
    } catch (e) {
      res.errors.push(`${p.idempotency_key}: ${e instanceof Error ? e.message : "erreur"}`);
    }
  }

  return res;
}

/** Branchement réel sur Supabase — la logique testable vit au-dessus. */
export function liveKobaraDeps(admin: SupabaseClient): KobaraReconcileDeps {
  return {
    listPending: async () => {
      const { data, error } = await admin
        .from("payments")
        .select("idempotency_key, order_id, created_at, raw")
        .eq("status", "pending")
        .eq("rail", "kobara")
        .order("created_at", { ascending: true })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []) as PendingKobara[];
    },
    retrieve: (paymentId) => retrieveKobaraPayment(paymentId),
    expire: async (idempotencyKey, reason) => {
      const { error } = await admin.rpc("zabelie_expire_stale_payment", {
        p_idempotency_key: idempotencyKey,
        p_reason: reason,
      });
      return error ? { error: error.message } : {};
    },
    confirm: async ({ idempotencyKey, providerRef, amount, raw }) => {
      const { data, error } = await admin.rpc("confirm_payment", {
        p_idempotency_key: idempotencyKey,
        p_provider_ref: providerRef,
        p_raw: redactKobaraPayment(raw),
        p_amount: amount,
      });
      if (error) return { error: error.message };
      if (data?.status === "confirmed") {
        // Suivi de remise d'abord (l'escrow doit être gelé), e-mails ensuite.
        const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
        await ouvrirSuiviLivraison(admin, idempotencyKey, "reconcile/kobara");
        const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
        notifyOrderPaid(admin, idempotencyKey).catch(() => undefined);
      }
      return { status: data?.status };
    },
  };
}
