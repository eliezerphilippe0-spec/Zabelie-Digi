import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * OUTBOX DES NOTIFICATIONS DE VENTE (migration `0061`).
 *
 * Pattern repris d'Izikit, calqué sur un mécanisme qui existe déjà ICI et qui
 * marche : `zabelie_fulfillment_notices` (0043). On n'a rien remplacé — on a
 * étendu à l'endroit qui en était dépourvu.
 *
 * Le trou, mesuré : `notifyOrderPaid` consommait la réclamation de `0012`,
 * puis envoyait sous `Promise.allSettled` dont personne ne lisait le résultat,
 * le tout sous un `catch` vide. Un échec d'envoi ne laissait AUCUNE trace —
 * sur le message qui, sur ce marché, tient lieu de reçu.
 */

export type KindOutbox = "order_paid_buyer" | "order_paid_seller";

/** Borne dure de tentatives. Au-delà, le message est abandonné et sa dernière
 *  erreur reste lisible en base — un abandon silencieux serait le défaut
 *  qu'on vient de corriger, à un cran de plus. */
export const MAX_TENTATIVES = 5;

export type ResultatDepot = {
  /** L'envoi immédiat a-t-il réussi ? */
  envoye: boolean;
  /** Le message est-il inscrit en base pour reprise ? */
  inscrit: boolean;
};

/**
 * Dépose le message PUIS tente l'envoi tout de suite.
 *
 * L'ordre compte et c'est tout l'objet : déposer d'abord garantit qu'un
 * échec — panne du fournisseur, clé absente, coupure — laisse une ligne
 * rattrapable. Tenter tout de suite garantit qu'une confirmation de vente
 * arrive en secondes et non au prochain passage de cron : un reçu qui arrive
 * le lendemain n'est plus un reçu.
 *
 * ⚠️ SCHÉMA EN RETARD. Si `0061` n'est pas appliquée, on tente quand même
 * l'envoi — exactement le comportement d'avant, ni meilleur ni pire — et on
 * le journalise. Refuser d'envoyer parce que la table de reprise manque
 * priverait l'acheteur de sa confirmation pour protéger une reprise qui
 * n'existe pas encore.
 */
export async function deposerEtTenter(
  admin: SupabaseClient,
  orderId: string,
  kind: KindOutbox,
  destinataire: string,
  envoi: () => Promise<boolean>
): Promise<ResultatDepot> {
  const journal = (champs: Record<string, unknown>) =>
    console.log("[outbox]", JSON.stringify({ at: new Date().toISOString(), kind, orderId, ...champs }));

  const { data: id, error } = await admin.rpc("zabelie_outbox_enqueue", {
    p_order_id: orderId,
    p_kind: kind,
    p_destinataire: destinataire,
  });

  if (error || !id) {
    journal({ issue: "depot_impossible", message: error?.message ?? "aucun identifiant" });
    // Fail-open : on tente quand même, comme avant `0061`.
    try {
      const ok = await envoi();
      return { envoye: ok, inscrit: false };
    } catch {
      return { envoye: false, inscrit: false };
    }
  }

  try {
    const ok = await envoi();
    if (ok) {
      await admin.rpc("zabelie_outbox_mark_sent", { p_id: id });
      return { envoye: true, inscrit: true };
    }
    // `sendEmail` rend `false` sans lever quand le fournisseur refuse : c'est
    // un échec, et il doit être compté comme tel. Le confondre avec un succès
    // était précisément ce que faisait `allSettled`.
    await admin.rpc("zabelie_outbox_mark_failed", { p_id: id, p_erreur: "envoi refusé" });
    journal({ issue: "envoi_refuse" });
    return { envoye: false, inscrit: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "erreur inconnue";
    await admin.rpc("zabelie_outbox_mark_failed", { p_id: id, p_erreur: message });
    journal({ issue: "envoi_echoue", message });
    return { envoye: false, inscrit: true };
  }
}

export type CompteursDrain = {
  dus: number;
  envoyes: number;
  echecs: number;
  abandonnes: number;
};

/**
 * Rejoue les messages échus. Appelé par le cron de balayage.
 *
 * Ne réclame RIEN si le fournisseur d'e-mail est absent : incrémenter
 * `attempts` sans avoir rien tenté épuiserait la borne de tentatives sur des
 * envois qui n'ont jamais eu lieu. C'est la même règle que
 * `lib/fulfillment-notices.ts`, et elle vient du même raisonnement.
 */
export async function drainerOutbox(
  admin: SupabaseClient,
  envoyer: (kind: KindOutbox, destinataire: string, orderId: string) => Promise<boolean>,
  emailActif: boolean
): Promise<CompteursDrain> {
  const c: CompteursDrain = { dus: 0, envoyes: 0, echecs: 0, abandonnes: 0 };
  if (!emailActif) return c;

  const { data, error } = await admin
    .from("zabelie_outbox")
    .select("id, kind, order_id, destinataire, attempts")
    .is("sent_at", null)
    .lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(50);

  if (error || !data) return c;

  for (const m of data as { id: string; kind: KindOutbox; order_id: string; destinataire: string; attempts: number }[]) {
    c.dus += 1;
    if (m.attempts >= MAX_TENTATIVES) {
      c.abandonnes += 1;
      continue;
    }
    try {
      const ok = await envoyer(m.kind, m.destinataire, m.order_id);
      if (ok) {
        await admin.rpc("zabelie_outbox_mark_sent", { p_id: m.id });
        c.envoyes += 1;
      } else {
        await admin.rpc("zabelie_outbox_mark_failed", { p_id: m.id, p_erreur: "envoi refusé" });
        c.echecs += 1;
      }
    } catch (e) {
      await admin.rpc("zabelie_outbox_mark_failed", {
        p_id: m.id,
        p_erreur: e instanceof Error ? e.message : "erreur inconnue",
      });
      c.echecs += 1;
    }
  }
  return c;
}
