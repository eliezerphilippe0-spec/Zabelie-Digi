import test from "node:test";
import assert from "node:assert/strict";
import { database, loadRoute } from "./helpers/route-harness";

function fixture(options: {
  type?: string; paid?: boolean; currency?: string; rail?: string; storedSession?: string;
  readError?: boolean; rpcError?: boolean; signatureError?: boolean; amount?: number;
} = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const deliveries: string[] = [];
  const db = database(() => ({ data: { rail: options.rail ?? "stripe", raw: { stripe_session_id: options.storedSession ?? "cs_test" } }, error: options.readError ? {} : null }));
  const route = loadRoute("app/api/stripe/webhook/route.ts", {
    "@/lib/stripe": { verifyStripeWebhook: () => {
      if (options.signatureError) throw new Error("bad signature");
      return { id: "evt_test", type: options.type ?? "checkout.session.async_payment_succeeded", data: { object: {
        id: "cs_test", mode: "payment", metadata: { order_id: "order" }, payment_intent: "pi_test",
        payment_status: options.paid === false ? "unpaid" : "paid", amount_total: options.amount ?? 1250, currency: options.currency ?? "usd",
      } } };
    } },
    "@/lib/supabase/admin": { createAdminClient: () => ({ ...db, rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return { data: name === "confirm_payment" ? { status: "confirmed" } : "failed", error: options.rpcError ? {} : null };
    } }) },
    "@/lib/fulfillment": { ouvrirSuiviLivraison: async (_db: unknown, order: string) => { deliveries.push(order); } },
    "@/lib/zabelie-notify": { notifyOrderPaid: async () => undefined },
  });
  return { calls, deliveries, post: () => route.POST(new Request("https://example.test/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "signed-fixture" }, body: "{}",
  })) };
}

for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
  test(type + " settles the exact signed USD amount and starts fulfillment", async () => {
    const f = fixture({ type });
    assert.equal((await f.post()).status, 200);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].name, "confirm_payment");
    assert.equal(f.calls[0].args.p_usd_cents, 1250);
    assert.equal(f.calls[0].args.p_idempotency_key, "order");
    assert.deepEqual(f.deliveries, ["order"]);
  });
}

test("completed-but-unpaid session waits; unrelated events do not settle", async () => {
  for (const options of [{ type: "checkout.session.completed", paid: false }, { type: "customer.created" }]) {
    const f = fixture(options);
    assert.equal((await f.post()).status, 200);
    assert.equal(f.calls.length, 0);
  }
});

test("delayed failure uses the locked failure RPC without fulfillment", async () => {
  const f = fixture({ type: "checkout.session.async_payment_failed", paid: false });
  assert.equal((await f.post()).status, 200);
  assert.equal(f.calls[0].name, "zabelie_stripe_payment_failed");
  assert.equal(f.calls[0].args.p_session_id, "cs_test");
  assert.equal(f.deliveries.length, 0);
});

test("invalid signatures, currency, rail, session and amounts cannot settle", async () => {
  for (const [options, status] of [
    [{ signatureError: true }, 400], [{ currency: "eur" }, 400], [{ rail: "moncash" }, 409],
    [{ storedSession: "cs_other" }, 409], [{ amount: 12.5 }, 400], [{ amount: -1 }, 400],
  ] as const) {
    const f = fixture(options);
    assert.equal((await f.post()).status, status);
    assert.equal(f.calls.length, 0);
  }
});

test("storage failures return retryable HTTP errors and never deliver", async () => {
  for (const options of [{ readError: true }, { rpcError: true }]) {
    const f = fixture(options);
    assert.equal((await f.post()).status, 503);
    assert.equal(f.deliveries.length, 0);
  }
});
