/**
 * Notifications post-paiement (V-13) : e-mail acheteur (livraison) + e-mail
 * vendeur (🎉 vente). Appelée en fire-and-forget APRÈS confirm_payment aux
 * 4 points de confirmation (retour MonCash, réconciliateur, webhook Stripe,
 * confirmation admin Zelle).
 *
 * Idempotence : un marqueur `notified_at` est posé ATOMIQUEMENT dans
 * payments.raw — un paiement rejoué (webhook doublé, réconciliateur qui
 * repasse) ne déclenche qu'UN envoi. Best-effort intégral : aucune erreur
 * ici ne remonte jamais au flux de paiement.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isEmailEnabled,
  sendEmail,
  buyerPurchaseEmail,
  sellerSaleEmail,
} from "./zabelie-email";

function formatHtg(n: number): string {
  return `${new Intl.NumberFormat("fr-HT").format(n)} HTG`;
}

export async function notifyOrderPaid(
  admin: SupabaseClient,
  orderId: string
): Promise<void> {
  try {
    if (!isEmailEnabled()) return;

    /* Réservation de `0012` — DÉCLASSÉE depuis `0061`, et il faut le dire.
     *
     * Elle ne garde plus la correction : le trigger de `0061` dépose la ligne
     * dans la transaction de l'argent, et `zabelie_outbox_claim` est le seul
     * chemin de sortie, emprunté par l'envoi immédiat comme par le drain. Ce
     * claim-ci n'est plus qu'une sortie anticipée qui épargne quelques
     * requêtes aux quatre routes de confirmation et au réconciliateur.
     *
     * Conséquence à connaître : sur un rejeu, cette ligne fait sortir avant la
     * tentative immédiate, et le reçu part alors au prochain passage du cron.
     * C'est acceptable PARCE QUE la ligne d'outbox existe déjà — avant `0061`,
     * la même sortie perdait le message pour toujours. */
    const { data: claimed } = await admin.rpc("zabelie_claim_notification", {
      p_order_id: orderId,
    });
    if (!claimed) return;

    // `order_ref` (0042) — sélection tolérante : colonne absente tant que la
    // migration n'est pas appliquée, l'email part alors sans numéro.
    type OrderForNotify = {
      id: string;
      order_ref: string | null;
      buyer_id: string;
      amount_htg: number;
      product:
        | { title: string; seller_id: string }
        | { title: string; seller_id: string }[]
        | null;
    };
    let order: OrderForNotify | null;
    ({ data: order } = await admin
      .from("orders")
      .select("id, order_ref, buyer_id, amount_htg, product:products(title, seller_id)")
      .eq("id", orderId)
      .single<OrderForNotify>());
    if (!order) {
      const retry = await admin
        .from("orders")
        .select("id, buyer_id, amount_htg, product:products(title, seller_id)")
        .eq("id", orderId)
        .single();
      if (!retry.data) return;
      order = { ...(retry.data as Omit<OrderForNotify, "order_ref">), order_ref: null };
    }
    if (!order) return;
    const product = (Array.isArray(order.product) ? order.product[0] : order.product) as
      | { title: string; seller_id: string }
      | null;
    if (!product) return;

    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

    // Net vendeur réel = la ligne de crédit écrite par la fonction SQL
    // (jamais recalculé ici — la SQL reste le seul calculateur).
    const { data: credit } = await admin
      .from("wallet_transactions")
      .select("amount_htg")
      .eq("idempotency_key", `order_credit:${orderId}`)
      .maybeSingle();

    const [buyer, seller] = await Promise.all([
      admin.auth.admin.getUserById(order.buyer_id),
      admin.auth.admin.getUserById(product.seller_id),
    ]);

    /* OUTBOX (0061) — DÉPOSER AVANT D'ENVOYER.
     *
     * L'ancien code envoyait puis jetait le résultat (`Promise.allSettled`
     * dont on ne lisait rien) sous un `catch` vide, alors que la réclamation
     * de `0012` était DÉJÀ consommée plus haut. Fournisseur en panne, clé
     * absente, coupure : l'acheteur n'apprenait jamais que son argent était
     * arrivé, et rien nulle part n'en gardait la trace.
     *
     * Désormais chaque message est d'abord POSÉ en base, puis tenté tout de
     * suite. L'envoi immédiat reste — une confirmation de vente qui arrive le
     * lendemain n'est plus une confirmation — mais son échec est maintenant
     * rattrapable par le drain du cron au lieu d'être perdu. */
    const { deposerEtTenter } = await import("@/lib/outbox");

    const buyerEmail = buyer.data.user?.email;
    if (buyerEmail) {
      const m = buyerPurchaseEmail({
        productTitle: product.title,
        amountLabel: formatHtg(order.amount_htg),
        purchasesUrl: `${site}/mes-achats`,
      });
      await deposerEtTenter(admin, orderId, "order_paid_buyer", buyerEmail, () =>
        sendEmail({ to: buyerEmail, ...m })
      );
    }
    const sellerEmail = seller.data.user?.email;
    if (sellerEmail && credit) {
      const m = sellerSaleEmail({
        productTitle: product.title,
        netLabel: formatHtg(credit.amount_htg),
        dashboardUrl: `${site}/tableau-de-bord`,
        orderRef: order.order_ref,
      });
      await deposerEtTenter(admin, orderId, "order_paid_seller", sellerEmail, () =>
        sendEmail({ to: sellerEmail, ...m })
      );
    }
  } catch {
    // best-effort : jamais d'impact sur le money-path. Ce `catch` reste, mais
    // il n'avale plus l'échec d'envoi — celui-ci est désormais INSCRIT en base
    // par `deposerEtTenter` avant de remonter ici.
  }
}

/**
 * REJOUE UN message de vente — appelé par le drain de l'outbox (`0061`).
 *
 * Pourquoi une fonction séparée plutôt qu'un rejeu de `notifyOrderPaid` : la
 * réclamation de `0012` est déjà consommée, donc `notifyOrderPaid` sortirait
 * immédiatement sans rien envoyer. Rejouer, c'est refaire l'ENVOI, pas la
 * décision d'envoyer.
 *
 * Le destinataire vient de l'outbox, jamais d'une relecture du compte : c'est
 * l'adresse au moment de la vente. Un acheteur qui change d'email entre-temps
 * doit recevoir la confirmation de SA commande, à l'adresse qu'il avait.
 */
export async function renvoyerNotificationVente(
  admin: SupabaseClient,
  kind: "order_paid_buyer" | "order_paid_seller",
  destinataire: string,
  orderId: string
): Promise<boolean> {
  if (!isEmailEnabled()) return false;
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  const { data: order } = await admin
    .from("orders")
    .select("id, order_ref, amount_htg, product:products(title)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return false;

  const p = order.product as { title: string } | { title: string }[] | null;
  const titre = (Array.isArray(p) ? p[0]?.title : p?.title) ?? "";

  if (kind === "order_paid_buyer") {
    return sendEmail({
      to: destinataire,
      ...buyerPurchaseEmail({
        productTitle: titre,
        amountLabel: formatHtg(order.amount_htg as number),
        purchasesUrl: `${site}/mes-achats`,
      }),
    });
  }

  // Vendeur : le net est RELU du grand livre, jamais recalculé — une commission
  // qui aurait changé entre-temps ne doit pas réécrire le montant d'une vente
  // déjà créditée.
  const { data: credit } = await admin
    .from("wallet_transactions")
    .select("amount_htg")
    .eq("idempotency_key", `order_credit:${orderId}`)
    .maybeSingle();
  if (!credit) return false;

  return sendEmail({
    to: destinataire,
    ...sellerSaleEmail({
      productTitle: titre,
      netLabel: formatHtg(credit.amount_htg as number),
      dashboardUrl: `${site}/tableau-de-bord`,
      orderRef: (order.order_ref as string | null) ?? null,
    }),
  });
}
