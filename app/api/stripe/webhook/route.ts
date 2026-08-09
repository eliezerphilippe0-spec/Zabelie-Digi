import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhook } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/stripe/webhook — confirmation serveur-à-serveur du rail Stripe.
 * Seule la notification SIGNÉE fait foi (INVARIANT 2) ; le retour navigateur
 * n'accorde jamais la livraison. confirm_payment est idempotent en base :
 * Stripe peut rejouer l'événement sans double crédit (INVARIANT 1), et le
 * montant reçu (amount_total) est comparé à expected_usd_cents EN BASE —
 * mismatch → payment failed + order disputed (INVARIANT montant).
 */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  }

  // Corps BRUT obligatoire pour la vérification de signature.
  const payload = await req.text();

  let event;
  try {
    event = verifyStripeWebhook(payload, signature);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Signature invalide" },
      { status: 400 }
    );
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId) {
    return NextResponse.json(
      { error: "order_id absent des metadata" },
      { status: 400 }
    );
  }
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: session.payment_status });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("confirm_payment", {
    p_idempotency_key: orderId, // = order.id (clé unique du paiement)
    p_provider_ref:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.id,
    p_raw: {
      stripe_event_id: event.id,
      stripe_session_id: session.id,
      amount_total: session.amount_total,
      currency: session.currency,
    },
    p_usd_cents: session.amount_total ?? -1, // null improbable → force le rejet
  });

  if (error) {
    // 500 → Stripe réessaiera ; confirm_payment est idempotent, c'est sûr.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data?.status === "confirmed") {
    // Suivi de remise d'abord (attendu : l'escrow doit être gelé avant qu'on
    // rende 200 à Stripe), e-mails ensuite.
    const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
    await ouvrirSuiviLivraison(admin, orderId, "stripe/webhook");
    const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
    notifyOrderPaid(admin, orderId).catch(() => undefined);
  }
  return NextResponse.json({ received: true, status: data?.status });
}
