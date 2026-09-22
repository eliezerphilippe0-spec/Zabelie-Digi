import { getAdminUser } from "@/lib/auth";
import { exigerTraceAdmin } from "@/lib/admin-audit";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveOrderPayment, redactPayment } from "@/lib/moncash";
import { reconcilePayments, type ReconcileDeps } from "@/lib/reconcile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Réconciliateur : pour chaque paiement encore 'pending', interroge MonCash
 * (serveur-à-serveur) et applique confirm_payment() si le paiement a réussi.
 * Garantit qu'AUCUN paiement n'est orphelin et rattrape le cas « redirect coupé ».
 *
 * Déclenchement :
 *   - GET  → cron Vercel (en-tête Authorization: Bearer $CRON_SECRET).
 *   - POST → appel manuel (Authorization: Bearer $RECONCILE_SECRET ou
 *            en-tête x-reconcile-secret).
 *
 * La logique d'orchestration vit dans lib/reconcile.ts (testée unitairement).
 */

async function authorize(req: Request): Promise<boolean> {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cronSecret = process.env.CRON_SECRET;
  const reconcileSecret = process.env.RECONCILE_SECRET;

  if (cronSecret && bearer === cronSecret) return true;
  if (reconcileSecret) {
    if (bearer === reconcileSecret) return true;
    if (req.headers.get("x-reconcile-secret") === reconcileSecret) return true;
  }
  if (req.method === "POST" && req.headers.get("content-type")?.startsWith("application/json")) {
    const user = await getAdminUser();
    if (user?.role === "admin") return exigerTraceAdmin(createAdminClient(), {
      actorId:user.id,action:"payments.reconcile",targetType:"payments",
    });
  }
  return false;
}

function liveDeps(): ReconcileDeps {
  const admin = createAdminClient();
  return {
    listPending: async () => {
      const { data, error } = await admin.rpc("zabelie_claim_pending_payments", { p_rail: "moncash" });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    retrieve: (orderId) => retrieveOrderPayment(orderId),
    // BL-101 : état terminal pour les pending abandonnés (>48 h, MonCash 404
    // ou non confirmé) — la fonction SQL re-vérifie âge et statut en base.
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
        p_raw: redactPayment(raw),
        p_amount: amount,
      });
      if (error) return { error: error.message };
      if (data?.status === "confirmed") {
        // idempotency_key = order.id. Suivi de remise d'abord (attendu :
        // l'escrow doit être gelé), e-mails ensuite (best-effort, une fois).
        const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
        await ouvrirSuiviLivraison(admin, idempotencyKey, "reconcile");
        const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
        notifyOrderPaid(admin, idempotencyKey).catch(() => undefined);
      }
      return { status: data?.status };
    },
  };
}

/**
 * Journal d'exécution — émis à CHAQUE passage, y compris quand il n'y a rien
 * à réconcilier.
 *
 * ⚠️ AJOUTÉ LE 2026-08-20. Relevé du tableau de bord : les huit crons sont
 * enregistrés et actifs, mais leur EXÉCUTION est inobservable — la rétention
 * Hobby efface les journaux avant qu'on puisse les relire, et cette route-ci
 * n'émettait **rien du tout**. C'est la plus grave des trois muettes : elle
 * porte l'invariant (c) de `docs/03` — « réconciliation totale, aucun paiement
 * orphelin ». Sans une ligne par passage, « la réconciliation n'a pas tourné »
 * et « elle a tourné, rien à rattraper » produisaient le même silence.
 *
 * `secretConfigure` sur le refus distingue « quelqu'un a frappé sans jeton »
 * de « CRON_SECRET n'est pas posée » — deux 401 identiques, deux gestes
 * différents.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[reconcile]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function handle(req: Request) {
  const debut = Date.now();
  if (!(await authorize(req))) {
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    /* BAIL D'EXÉCUTION (`0060`) — un seul porteur à la fois.
     *
     * ⚠️ Ajouté le 2026-08-20. `lib/cron-lease.ts` a été écrit pour que « le
     * huitième cron en hérite sans y penser » — et il ne servait qu'à UNE
     * route sur huit. Le plan Hobby annonce par ailleurs une « flexible time
     * window » d'une heure : deux créneaux espacés de 30 minutes peuvent donc
     * se chevaucher, ou s'inverser.
     *
     * Fail-open si `0060` manque (voir `lib/cron-lease.ts`) : un bail est une
     * garantie ADDITIONNELLE, jamais une condition de correction. */
    const { avecBail } = await import("@/lib/cron-lease");
    const { bail, resultat } = await avecBail(
      admin,
      "reconcile",
      `reconcile-${debut}`,
      async () => {
        const result = await reconcilePayments(liveDeps()).catch(() => ({ errors: ["moncash_queue_unavailable"] }));
        // Recharges téléphoniques (V-11) — même cron (Hobby = 2 crons max).
        const { reconcileTopups } = await import("@/lib/zabelie-topup/reconcile");
        const topup = await reconcileTopups(admin).catch((e) => ({
          error: e instanceof Error ? e.message : "Erreur topup",
        }));
        /* Rail Kobara (0106) — passe SÉPARÉE, et non un élargissement du
         * `listPending` ci-dessus.
         *
         * `reconcilePayments` est typé sur `MonCashPayment` de bout en bout et
         * porte le chemin d'argent le plus éprouvé du dépôt. Le généraliser
         * pour accueillir un second rail toucherait le code qui confirme les
         * paiements MonCash réels — un risque pris pour un rail qui n'a
         * jamais encaissé une gourde. La passe Kobara vit donc à côté, comme
         * `reconcileTopups`, selon le même motif.
         *
         * ⚠️ N'est appelée que si le rail est configuré : sans secrets,
         * `retrieveKobaraPayment` lèverait à chaque passage et noierait le
         * journal du réconciliateur d'erreurs pour un rail que personne
         * n'utilise. `scanned: 0` serait par ailleurs trompeur — c'est
         * « rail éteint », pas « rien à réconcilier ». */
        const { isKobaraEnabled } = await import("@/lib/kobara");
        let kobara: unknown = { ignore: "rail_non_configure" };
        if (isKobaraEnabled()) {
          const { reconcileKobara, liveKobaraDeps } = await import("@/lib/kobara-reconcile");
          kobara = await reconcileKobara(liveKobaraDeps(admin)).catch((e) => ({
            error: e instanceof Error ? e.message : "Erreur kobara",
          }));
        }
        const { isStripeEnabled } = await import("@/lib/stripe-config");
        let stripe: unknown = { ignore: "rail_non_configure" };
        if (isStripeEnabled()) {
          const { reconcileStripe, liveStripeDeps } = await import("@/lib/stripe-reconcile");
          stripe = await reconcileStripe(liveStripeDeps(admin)).catch(() => ({ error: "stripe_reconcile_unavailable" }));
        }
        return { result, topup, kobara, stripe };
      },
      { journal: (champs) => journal({ issue: "bail", ...champs }) }
    );
    if (!bail.autorise) {
      journal({ issue: "ignore_bail_tenu", dureeMs: Date.now() - debut });
      return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
    }
    const { result, topup, kobara, stripe } = resultat!;
    journal({
      issue: "termine",
      ...result,
      topupErreur: (topup as { error?: string }).error ?? null,
      kobara, stripe,
      dureeMs: Date.now() - debut,
    });
    return NextResponse.json({ ...result, topup, kobara, stripe });
  } catch (e) {
    journal({ issue: "exception", message: e instanceof Error ? e.message : "Erreur", dureeMs: Date.now() - debut });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
