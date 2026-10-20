import { NextResponse } from "next/server";
import { repartirApresReponse } from "@/lib/webhooks-apres";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhook } from "@/lib/stripe";
import { erreurTraduite } from "@/lib/api-erreur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed events only. Settlement and dispute receipts remain atomic in Postgres. */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  const payload = await req.text();
  let event;
  try { event = verifyStripeWebhook(payload, signature); }
  catch { return NextResponse.json({ error: "Signature invalide" }, { status: 400 }); }

  if (event.type === "charge.dispute.created" || event.type === "charge.dispute.updated" ||
      event.type === "charge.dispute.closed" || event.type === "charge.dispute.funds_withdrawn" ||
      event.type === "charge.dispute.funds_reinstated") {
    const dispute = event.data.object;
    if (!dispute || typeof dispute !== "object") {
      return erreurTraduite("api.params.invalid", 400);
    }
    const paymentIntent = typeof dispute.payment_intent === "string" ? dispute.payment_intent : dispute.payment_intent?.id ?? null;
    const charge = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
    if (!/^evt_[A-Za-z0-9_]{1,200}$/.test(event.id) || !/^(du|dp)_[A-Za-z0-9_]{1,200}$/.test(dispute.id) ||
        (dispute.payment_intent !== null && (!paymentIntent || !/^pi_[A-Za-z0-9_]{1,200}$/.test(paymentIntent))) ||
        !charge || !/^ch_[A-Za-z0-9_]{1,200}$/.test(charge) || typeof event.livemode !== "boolean" ||
        !Number.isSafeInteger(dispute.amount) || dispute.amount <= 0 ||
        typeof dispute.currency !== "string" || !/^[a-z]{3}$/.test(dispute.currency) ||
        typeof dispute.status !== "string" || !/^[a-z_]{1,64}$/.test(dispute.status)) {
      return erreurTraduite("api.params.invalid", 400);
    }
    try {
      // No metadata chooses an order, no raw evidence is retained, no Stripe
      // network call or refund is made. SQL records even unmatched receipts.
      const { data, error } = await createAdminClient().rpc("zabelie_record_stripe_dispute", {
        p_event_id: event.id, p_event_type: event.type, p_dispute_id: dispute.id,
        p_payment_intent_id: paymentIntent, p_charge_id: charge, p_status: dispute.status,
        p_amount_usd_cents: dispute.amount, p_currency: dispute.currency, p_livemode: event.livemode,
      });
      if (error || data?.event_id !== event.id || data?.ok !== true) {
        return erreurTraduite("api.unavailable", !error && data?.event_id === event.id && data?.retryable === false ? 409 : 503);
      }
      return NextResponse.json({ received: true, status: data.reason, duplicate: data.duplicate === true });
    } catch {
      // A lost reply is ambiguous: retry the same immutable event ID.
      return erreurTraduite("api.unavailable", 503);
    }
  }

  if (event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded" &&
      event.type !== "checkout.session.async_payment_failed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }
  const session = event.data.object;
  const orderId = session.metadata?.order_id ?? session.client_reference_id;
  if (!orderId || session.mode !== "payment" || session.currency !== "usd") {
    return NextResponse.json({ error: "Session incompatible" }, { status: 400 });
  }
  const failed = event.type === "checkout.session.async_payment_failed";
  if (!failed && session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: session.payment_status });
  }
  if (!Number.isSafeInteger(session.amount_total) || (session.amount_total ?? -1) < 0) {
    return NextResponse.json({ error: "Montant invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: payment, error: readError } = await admin.from("payments")
    .select("rail,raw").eq("order_id", orderId).maybeSingle();
  if (readError || !payment) return NextResponse.json({ error: "Paiement indisponible" }, { status: 503 });
  if (payment.rail !== "stripe" ||
      (payment.raw?.stripe_session_id && payment.raw.stripe_session_id !== session.id)) {
    return NextResponse.json({ error: "Session incompatible" }, { status: 409 });
  }
  if (failed) {
    const { data, error } = await admin.rpc("zabelie_stripe_payment_failed", {
      p_order_id: orderId, p_session_id: session.id, p_event_id: event.id,
    });
    if (error) return NextResponse.json({ error: "Traitement indisponible" }, { status: 503 });
    return NextResponse.json({ received: true, status: data });
  }

  const { data, error } = await admin.rpc("confirm_payment", {
    p_idempotency_key: orderId,
    p_provider_ref: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
    p_raw: {
      stripe_event_id: event.id,
      stripe_session_id: session.id,
      stripe_livemode: event.livemode,
      amount_total: session.amount_total,
      currency: session.currency,
    },
    p_usd_cents: session.amount_total ?? -1,
  });
  if (error) return NextResponse.json({ error: "Traitement indisponible" }, { status: 503 });
  if (data?.status === "confirmed") {
    const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
    await ouvrirSuiviLivraison(admin, orderId, "stripe/webhook");
    const { notifyOrderPaid } = await import("@/lib/zabelie-notify");
    notifyOrderPaid(admin, orderId).catch(() => undefined);
    repartirApresReponse(admin); // webhooks vendeur (0122) — après la réponse
  }
  return NextResponse.json({ received: true, status: data?.status });
}
