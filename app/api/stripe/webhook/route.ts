import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeWebhook } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Signed Checkout events only. Settlement remains idempotent in Postgres. */
export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Signature absente" }, { status: 400 });
  const payload = await req.text();
  let event;
  try { event = verifyStripeWebhook(payload, signature); }
  catch { return NextResponse.json({ error: "Signature invalide" }, { status: 400 }); }

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
  }
  return NextResponse.json({ received: true, status: data?.status });
}
