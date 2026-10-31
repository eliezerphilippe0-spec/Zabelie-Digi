import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { envoyerSignal, lireClesVapid, type ClesVapid } from "./web-push";
import { autresCommandesDuGroupe } from "./panier-groupe";

/**
 * NOTIFICATION DE VENTE AU VENDEUR, page fermée (niveau 2, 2026-10-31).
 *
 * Appelée par `notifyOrderPaid` — donc par CHAQUE chemin de confirmation de
 * paiement (retour MonCash, webhooks Kobara et Stripe, Zelle, réconciliation).
 * Jamais sur le chemin de l'argent : tout échec est avalé et journalisé.
 *
 * • Une vente, un signal : `zabelie_push_ventes` (0169) garde l'unicité contre
 *   les rejeux de `notifyOrderPaid`.
 * • Seule une commande `paid` ou `delivered` est signalée.
 * • Abonnement refusé par le service (404, 410) → supprimé ; dix échecs de
 *   suite → supprimé aussi (appareil abandonné). Constante technique, pas un
 *   paramètre commercial.
 * • Le journal ne porte que des compteurs : jamais une adresse d'appareil.
 */

export const ECHECS_MAX = 10;

function journal(champs: Record<string, unknown>) {
  console.log("[push-vente]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

type Commande = { status: string; product: { seller_id: string } | { seller_id: string }[] | null };
type Abonnement = { id: string; endpoint: string; echecs: number };

export async function signalerVentePush(
  admin: SupabaseClient,
  orderId: string,
  cles: ClesVapid | null = lireClesVapid(),
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!cles) return; // éteint : les trois clés VAPID ne sont pas posées
  try {
    const { data: commande } = await admin
      .from("orders")
      .select("status, product:products!orders_product_id_fkey(seller_id)")
      .eq("id", orderId)
      .maybeSingle<Commande>();
    const produit = Array.isArray(commande?.product) ? commande?.product[0] : commande?.product;
    if (!commande || !produit?.seller_id || !["paid", "delivered"].includes(commande.status)) return;

    // La première insertion gagne ; un rejeu ne reçoit aucune ligne.
    const { data: reservee, error } = await admin
      .from("zabelie_push_ventes")
      .upsert({ order_id: orderId }, { onConflict: "order_id", ignoreDuplicates: true })
      .select("order_id");
    if (error || !reservee?.length) return;

    const { data: abonnements } = await admin
      .from("zabelie_push_abonnements")
      .select("id, endpoint, echecs")
      .eq("user_id", produit.seller_id);
    let envoyes = 0;
    let retires = 0;
    let echecs = 0;
    for (const a of (abonnements ?? []) as Abonnement[]) {
      const issue = await envoyerSignal(a.endpoint, cles, fetcher);
      if (issue === "envoye") {
        envoyes += 1;
        await admin.from("zabelie_push_abonnements").update({ derniere_reussite: new Date().toISOString(), echecs: 0 }).eq("id", a.id);
      } else if (issue === "expire" || a.echecs + 1 >= ECHECS_MAX) {
        retires += 1;
        await admin.from("zabelie_push_abonnements").delete().eq("id", a.id);
      } else {
        echecs += 1;
        await admin.from("zabelie_push_abonnements").update({ echecs: a.echecs + 1 }).eq("id", a.id);
      }
    }
    await admin.from("zabelie_push_ventes").update({ appareils: envoyes }).eq("order_id", orderId);
    journal({ issue: "signal", appareils: abonnements?.length ?? 0, envoyes, retires, echecs });
  } catch {
    journal({ issue: "erreur" });
  }
}

/**
 * Planifie le signal APRÈS la réponse (`after`), comme les webhooks vendeur :
 * `notifyOrderPaid` est lancé sans `await`, et une fonction serverless gelée
 * juste après la réponse perdrait l'envoi. Couvre chaque commande d'un panier
 * groupé (0128). Hors requête (script, test) : envoi direct.
 */
export function signalerVenteApresReponse(admin: SupabaseClient, orderId: string): void {
  if (!lireClesVapid()) return;
  const tache = async () => {
    for (const id of [orderId, ...(await autresCommandesDuGroupe(admin, orderId))]) {
      await signalerVentePush(admin, id);
    }
  };
  try {
    after(tache);
  } catch {
    void tache().catch(() => undefined);
  }
}
