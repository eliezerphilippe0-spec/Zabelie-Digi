import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoriserWebhookKobara, isKobaraEnabled, resolveKobaraMode } from "@/lib/kobara";

import { readKobaraWebhook } from "@/lib/kobara-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/kobara/webhook — confirmation serveur-à-serveur du rail Kobara.
 *
 * Seule la notification SIGNÉE fait foi (INVARIANT 2) ; le retour navigateur
 * n'accorde jamais la livraison. `confirm_payment` est idempotent en base : la
 * passerelle peut rejouer l'événement sans double crédit (INVARIANT 1), et le
 * montant reçu est comparé à `orders.amount_htg` EN BASE — un écart lève, la
 * commande passe en litige. Aucun crédit direct n'est écrit ici.
 *
 * ⚠️ MONTANT BRUT, et c'est volontaire. Ce qu'on transmet à `confirm_payment`
 * est ce que l'ACHETEUR a payé, pas ce que la passerelle reversera. Les frais
 * (4 % / 2,9 % selon le plan) sont prélevés au RÈGLEMENT du solde marchand,
 * pas à l'encaissement : les déduire ici ferait échouer le contrôle d'égalité
 * en base sur chaque paiement, et surtout ferait porter au VENDEUR un coût
 * qu'il n'a pas choisi. Qui absorbe ces frais — marge plateforme ou net
 * vendeur — est un paramètre commercial (règle dure n°3) : il se décide en
 * table de config, au moment du règlement, et il n'a pas de valeur par défaut
 * acceptable. Il n'est donc PAS encodé ici.
 *
 * ⚠️ LES REFUS RENDENT UN `code`, PAS UNE PHRASE. Ce point d'entrée n'est lu
 * que par une machine : la passerelle décide de réessayer sur le STATUT HTTP,
 * jamais sur la prose. Un message français ici ne serait lu par personne, et
 * `tests/i18n-api-cliquet.test.ts` le compterait — à juste titre — comme une
 * dette de traduction de plus. Un code stable est à la fois plus utile au
 * destinataire réel et honnête vis-à-vis du cliquet.
 */
export async function POST(req: Request) {
  // Rail non configuré : la route n'existe pas fonctionnellement. On ne
  // révèle rien de plus qu'un 404 ordinaire.
  if (!isKobaraEnabled()) {
    return NextResponse.json({ code: "rail_absent" }, { status: 404 });
  }

  // Corps BRUT obligatoire : la signature porte sur les octets reçus. Un
  // `JSON.stringify(await req.json())` réordonnerait les clés et ferait échouer
  // des charges authentiques.
  const corpsBrut = await req.text();
  const verdict = autoriserWebhookKobara(corpsBrut, req.headers.get("kobara-signature"));
  if (!verdict.ok) {
    /* Le motif reste dans les journaux serveur et ne part JAMAIS au client :
     * dire « horodatage hors fenêtre » à un appelant non authentifié lui
     * apprend comment s'y prendre. Mais ne rien journaliser du tout rendrait
     * « personne ne nous appelle » et « on refuse tout le monde depuis trois
     * jours » indistinguables — c'est le corollaire d'observabilité. */
    console.error(
      "[kobara/webhook] refus",
      JSON.stringify({ at: new Date().toISOString(), motif: verdict.motif })
    );
    return NextResponse.json({ code: "signature_invalide" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(corpsBrut);
  } catch {
    return NextResponse.json({ code: "corps_illisible" }, { status: 400 });
  }

  const parsed = readKobaraWebhook(event, req.headers.get("kobara-environment"), resolveKobaraMode(process.env.KOBARA_MODE).mode);
  if (!parsed.ok) {
    return NextResponse.json({ code: parsed.code }, { status: parsed.ignored ? 200 : 400 });
  }
  const paiement = parsed.payment;
  const admin = createAdminClient();
  // The provider reference belongs to Kobara, not to our order namespace.
  // Match the payment ID saved by checkout, even when metadata is omitted.
  const { data: stored, error: lookupError } = await admin.from("payments")
    .select("order_id, idempotency_key, raw")
    .eq("rail", "kobara")
    .eq("raw->>kobara_payment_id", paiement.id)
    .maybeSingle();
  if (lookupError || !stored) {
    // May race checkout's persistence: return a retryable response.
    return NextResponse.json({ code: "paiement_non_rapproche" }, { status: 503 });
  }
  const orderId = stored.order_id;
  if ((paiement.orderId && paiement.orderId !== orderId) ||
      stored.raw?.kobara_mode !== paiement.environment) {
    return NextResponse.json({ code: "paiement_incompatible" }, { status: 400 });
  }

  const { data, error } = await admin.rpc("confirm_payment", {
    p_idempotency_key: stored.idempotency_key,
    p_provider_ref: paiement.providerRef,
    p_raw: {
      kobara_payment_id: paiement.id,
      kobara_provider: paiement.provider,
      kobara_mode: paiement.environment,
      status: "succeeded",
      amount: paiement.amount,
      currency: paiement.currency,
    },
    p_amount: paiement.amount,
  });

  if (error) {
    // 500 → la passerelle réessaiera ; `confirm_payment` est idempotent, c'est sûr.
    return NextResponse.json({ code: "confirmation_echouee" }, { status: 500 });
  }
  if (data?.status === "confirmed") {
    // Suivi de remise d'abord (l'escrow doit être gelé avant qu'on rende 200),
    // e-mails ensuite, best-effort.
    const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
    await ouvrirSuiviLivraison(admin, orderId, "kobara/webhook");
    const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
    notifyOrderPaid(admin, orderId).catch(() => undefined);
  }
  return NextResponse.json({ received: true, status: data?.status });
}
