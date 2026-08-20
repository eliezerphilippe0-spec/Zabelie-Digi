import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { siteOrigin } from "@/lib/site-origin";
import {
  retrieveTransactionPayment,
  isSuccessful,
  redactPayment,
} from "@/lib/moncash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/moncash/return?transactionId=...
 * Retour navigateur après paiement. On NE fait PAS confiance à ce retour : on
 * vérifie l'état réel côté MonCash (serveur-à-serveur) avant de confirmer.
 * Si le retour est coupé, le réconciliateur rattrapera (cf. /api/reconcile).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const transactionId = url.searchParams.get("transactionId");
  /* Même raison qu'au callback : un acheteur qui revient de MonCash sur
     www.<domaine> ne doit pas être renvoyé sur l'apex — il y arriverait
     déconnecté, devant une page de paiement qui ne le reconnaît plus.
     → lib/site-origin.ts */
  const site = siteOrigin(url, process.env.NEXT_PUBLIC_SITE_URL);

  if (!transactionId) {
    return NextResponse.redirect(`${site}/paiement/echec?raison=transaction_absente`);
  }

  // BL-122 (C-4b) : endpoint public — chaque hit coûte 2 appels MonCash
  // (token + retrieve). Borne par IP pour couper l'amplification.
  const admin = createAdminClient();
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
  if (!(await rateLimit(admin, `mcreturn:${ip}`, 20))) {
    return NextResponse.redirect(`${site}/paiement/en-attente`);
  }

  let payment;
  try {
    payment = await retrieveTransactionPayment(transactionId);
  } catch {
    // Vérification impossible maintenant → le réconciliateur reprendra la main.
    return NextResponse.redirect(`${site}/paiement/en-attente`);
  }

  if (!isSuccessful(payment) || !payment) {
    // BL-111 (Stripe « Try again ») : si la référence est une commande
    // marketplace, on passe le slug produit pour un CTA « Réessayer » direct.
    const ref = payment?.reference ?? "";
    let produit = "";
    if (ref && !ref.startsWith("biz:")) {
      const { data: o } = await admin
        .from("orders")
        .select("products(slug)")
        .eq("id", ref)
        .maybeSingle();
      const prod = o?.products as unknown as { slug?: string } | { slug?: string }[] | null;
      const slug = Array.isArray(prod) ? prod[0]?.slug : prod?.slug;
      if (slug) produit = `&produit=${encodeURIComponent(slug)}`;
    }
    return NextResponse.redirect(
      `${site}/paiement/echec?raison=non_confirme${produit}`
    );
  }

  // payment.reference = notre order.id = idempotency_key du paiement.
  const orderId = payment.reference;

  // Facture Zabelie Business (V-13) ? Référence `biz:<invoiceId>:<nonce>`.
  // Traité EN PREMIER : cette référence n'est pas un UUID, donc elle ne doit
  // pas atteindre les requêtes qui filtrent des colonnes id de type uuid.
  // Crédit IMMÉDIAT du pro (sans escrow), idempotent sur la référence complète.
  if (orderId.startsWith("biz:")) {
    const invoiceId = orderId.split(":")[1] ?? "";
    const { data: bizPay, error: bizErr } = await admin.rpc(
      "zabelie_biz_confirm_invoice_payment",
      {
        p_invoice: invoiceId,
        p_provider: "moncash",
        p_provider_ref: payment.transactionId,
        p_amount: Math.round(payment.cost),
        p_idempotency: orderId,
      }
    );
    // Token pour rediriger le client vers le portail de SA facture.
    const { data: inv } = await admin
      .from("zabelie_biz_invoices")
      .select("public_token")
      .eq("id", invoiceId)
      .maybeSingle();
    const back = inv?.public_token
      ? `${site}/facture/${inv.public_token}`
      : `${site}/paiement/en-attente`;
    if (bizErr || !bizPay) {
      // Erreur transitoire ou montant refusé → le réconciliateur reprendra.
      return NextResponse.redirect(back);
    }
    return NextResponse.redirect(`${back}?paye=1`);
  }

  // Recharge téléphonique (V-11) ? Même vérité serveur-à-serveur, pipeline
  // dédié : confirmation idempotente puis fulfillment immédiat.
  const { data: topupOrder } = await admin
    .from("zabelie_topup_orders")
    .select("id")
    .eq("id", orderId)
    .maybeSingle();
  if (topupOrder) {
    const { data: confirmed, error: topupErr } = await admin.rpc(
      "zabelie_topup_confirm_payment",
      {
        p_order_id: orderId,
        p_payment_ref: payment.transactionId,
        p_raw: redactPayment(payment), // BL-115 : minimisation (n° payeur retiré)
        p_amount: Math.round(payment.cost),
      }
    );
    if (topupErr) {
      return NextResponse.redirect(`${site}/rechaj/${orderId}`);
    }
    if (confirmed?.status === "paid") {
      // BL-135 (C-10) : 1 seule tentative ICI (0s de backoff sur une commande
      // fraîchement payée) — jusqu'à 3 au total, le reste repris par le
      // réconciliateur (même clé d'idempotence). Évite jusqu'à ~6s de sleeps
      // synchrones dans ce handler serverless (retour navigateur 3G).
      const { fulfillTopupOrder } = await import("@/lib/zabelie-topup/fulfill");
      await fulfillTopupOrder(admin, orderId, undefined, 1).catch(() => undefined);
    }
    return NextResponse.redirect(`${site}/rechaj/${orderId}`);
  }

  const { data, error } = await admin.rpc("confirm_payment", {
    p_idempotency_key: orderId,
    p_provider_ref: payment.transactionId,
    p_raw: redactPayment(payment),
    p_amount: Math.round(payment.cost),
  });

  if (error) {
    // Erreur transitoire → le réconciliateur reprendra la main. BL-132 :
    // orderId connu ici → la page en attente peut poller au lieu de rester
    // statique (pattern /rechaj).
    return NextResponse.redirect(`${site}/paiement/en-attente?commande=${orderId}`);
  }
  if (data?.status === "failed") {
    // Montant incohérent : paiement rejeté, aucune livraison.
    const { data: o } = await admin
      .from("orders")
      .select("products(slug)")
      .eq("id", orderId)
      .maybeSingle();
    const prod = o?.products as unknown as { slug?: string } | { slug?: string }[] | null;
    const slug = Array.isArray(prod) ? prod[0]?.slug : prod?.slug;
    const produit = slug ? `&produit=${encodeURIComponent(slug)}` : "";
    return NextResponse.redirect(`${site}/paiement/echec?raison=montant${produit}`);
  }

  // Produit physique : on gèle l'escrow AVANT de rendre la main. Attendu, pas
  // en fire-and-forget — c'est de l'argent qui cesse de mûrir au chronomètre.
  // L'échec ne casse rien : le filet du balayage quotidien reprend la commande
  // (0043 §6 bis). Voir lib/fulfillment.ts pour l'ordre obligatoire.
  const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
  await ouvrirSuiviLivraison(admin, orderId, "moncash/return");

  // E-mails livraison acheteur + 🎉 vendeur (best-effort, idempotent en base).
  const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
  /* PAS d'`await` — et depuis `0061`, c'est un CHOIX DE LATENCE, plus un bug.
   *
   * Il y a deux commits, cette ligne était un défaut : le dépôt en outbox
   * vivait dans `notifyOrderPaid`, donc la fonction serverless pouvait rendre
   * la main et se faire geler avant l'INSERT — le reçu était perdu, et la
   * réclamation de `0012` déjà consommée empêchait toute reprise.
   *
   * Le trigger de `0061` a déplacé le dépôt DANS la transaction de
   * `confirm_payment` : la ligne existe avant que cette instruction ne soit
   * atteinte. Ce que le fire-and-forget peut encore perdre, c'est la TENTATIVE
   * IMMÉDIATE — et le drain du cron la reprend. Dégradation propre par
   * construction : le reçu arrive plus tard, jamais jamais. */
  notifyOrderPaid(admin, orderId).catch(() => undefined);

  return NextResponse.redirect(`${site}/paiement/succes?commande=${orderId}`);
}
