import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { retrieveStripeSession } from "./stripe";

export type StripePending = { order_id: string; idempotency_key: string; raw: Record<string, unknown> | null };
export type StripeReconcileDeps = {
  listPending: () => Promise<StripePending[]>;
  retrieve: (sessionId: string) => Promise<Stripe.Checkout.Session>;
  confirm: (order: StripePending, session: Stripe.Checkout.Session) => Promise<{ status?: string; error?: string }>;
  expire: (order: StripePending, session: Stripe.Checkout.Session) => Promise<{ status?: string; error?: string }>;
  now?: () => number;
  budgetMs?: number;
};
export async function reconcileStripe(deps: StripeReconcileDeps) {
  const now=deps.now??Date.now; const started=now();
  const result = { deferred: 0, scanned: 0, confirmed: 0, pending: 0, expired: 0, missingSession: 0, errors: [] as string[] };
  const orders=await deps.listPending();
  for (const order of orders) {
    if(now()-started >= (deps.budgetMs??60000)){result.deferred=orders.length-result.scanned;break;}
    result.scanned++;
    try {
      const id = order.raw?.stripe_session_id;
      if (typeof id !== "string" || !id) { result.missingSession++; continue; }
      const session = await deps.retrieve(id);
      const reference = session.metadata?.order_id ?? session.client_reference_id;
      if (session.id !== id || reference !== order.order_id || session.mode !== "payment" ||
          session.currency !== "usd" || !Number.isSafeInteger(session.amount_total) || (session.amount_total ?? -1) < 0) {
        throw new Error("stripe_session_mismatch");
      }
      if (session.payment_status === "paid") {
        const out = await deps.confirm(order, session);
        if (out.error || out.status !== "confirmed") throw new Error("stripe_confirmation_failed");
        result.confirmed++;
      } else if (session.status === "expired" && session.payment_status === "unpaid") {
        // Only a formal provider expiry permits cancellation. Age/network errors do not.
        const out = await deps.expire(order, session);
        if (out.error) throw new Error("stripe_expiry_failed");
        if(out.status==="confirmed") result.confirmed++;
        else if(out.status==="failed") result.expired++;
        else throw new Error("stripe_expiry_unconfirmed");
      } else result.pending++;
    } catch { result.errors.push(order.order_id); }
  }
  return result;
}
export function liveStripeDeps(admin: SupabaseClient): StripeReconcileDeps {
  return {
    listPending: async () => {
      const { data, error } = await admin.rpc("zabelie_claim_pending_payments", { p_rail: "stripe" });
      if (error) throw new Error("stripe_queue_unavailable");
      return (data ?? []) as StripePending[];
    },
    retrieve: retrieveStripeSession,
    confirm: async (order, session) => {
      const { data, error } = await admin.rpc("confirm_payment", {
        p_idempotency_key: order.idempotency_key,
        p_provider_ref: typeof session.payment_intent === "string" ? session.payment_intent : session.id,
        p_usd_cents: session.amount_total,
        p_raw: { stripe_session_id: session.id, reconciliation: true, amount_total: session.amount_total, currency: session.currency },
      });
      if (error) return { error: "confirmation_unavailable" };
      if (data?.status === "confirmed") {
        const { ouvrirSuiviLivraison } = await import("./fulfillment");
        await ouvrirSuiviLivraison(admin, order.order_id, "reconcile/stripe");
        const { notifyOrderPaid } = await import("./zabelie-notify");
        notifyOrderPaid(admin, order.order_id).catch(() => undefined);
      }
      return { status: data?.status };
    },
    expire: async (order, session) => {
      const { data, error } = await admin.rpc("zabelie_stripe_payment_failed", {
        p_order_id: order.order_id, p_session_id: session.id, p_event_id: "reconcile_expired:" + session.id,
      });
      return error ? { error: "expiry_unavailable" } : {status:data};
    },
  };
}
