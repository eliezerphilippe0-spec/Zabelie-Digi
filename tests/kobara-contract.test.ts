import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createKobaraPayment, retrieveKobaraPayment } from "../lib/kobara";
import { readKobaraWebhook } from "../lib/kobara-webhook";
import { reconcileKobara } from "../lib/kobara-reconcile";
import { getKobaraAvailability, getNatCashAvailabilityKey, getMonCashAvailability } from "../lib/payment-availability";

function environment(t: TestContext, overrides: Record<string, string> = {}) {
  const env = { KOBARA_MODE: "live", KOBARA_SECRET_KEY: "kbr_sk_live_fixture", KOBARA_WEBHOOK_SECRET: "fixture-webhook", KOBARA_API_BASE: "https://api.kobara.app", NEXT_PUBLIC_SITE_URL: "https://zabelie.com", ...overrides };
  const before = Object.fromEntries(Object.keys(env).map(k => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}
const data = { id: "pay_contract", checkout_url: "https://pay.kobara.app/checkout/pay_contract", status: "pending", environment: "live" };
const input = { orderId: "order_contract", amountHtg: 500, provider: "natcash" as const, description: "Fixture" };
const event = { event_type: "payment.succeeded", environment: "live", data: {
  id: "pay_contract", reference: "KOB123", amount: 500, currency: "HTG", status: "succeeded", environment: "live", provider: "natcash",
} };

test("documented v1 request and enveloped response work for both operators", async t => {
  environment(t);
  for (const provider of ["natcash", "moncash"] as const) {
    const result = await createKobaraPayment({ ...input, provider, fetchFn: async (url, init) => {
      assert.equal(url, "https://api.kobara.app/v1/payments");
      assert.equal(init?.method, "POST");
      assert.equal(new Headers(init?.headers).get("Idempotency-Key"), input.orderId);
      const body = JSON.parse(String(init?.body));
      assert.equal(body.provider, provider);
      assert.equal(body.amount, 500);
      assert.deepEqual(body.metadata, { order_id: input.orderId });
      assert.equal(body.success_url, "https://zabelie.com/mes-achats?commande=order_contract");
      assert.equal(body.cancel_url, "https://zabelie.com/panier");
      assert.equal(body.return_url, undefined);
      return Response.json({ status: "success", data });
    } });
    assert.equal(result.id, data.id);
    assert.equal(result.mode, "live");
  }
});

test("malformed, cross-environment and off-domain checkout responses are rejected", async t => {
  environment(t);
  for (const response of [data, { data: { ...data, environment: "test" } }, { data: { ...data, checkout_url: "https://evil.example/" } }, { data: { ...data, checkout_url: "http://pay.kobara.app/" } }]) {
    await assert.rejects(createKobaraPayment({ ...input, fetchFn: async () => Response.json(response) }));
  }
});

test("sandbox keys cannot silently reach the live public API", async t => {
  environment(t, { KOBARA_MODE: "test", KOBARA_SECRET_KEY: "kbr_sk_test_fixture" });
  let called = false;
  await assert.rejects(createKobaraPayment({ ...input, fetchFn: async () => { called = true; return Response.json({data}); } }));
  assert.equal(called, false);
});

test("documented webhook uses event_type and never confuses provider reference with order ID", () => {
  const parsed = readKobaraWebhook(event, "live", "live");
  assert.ok(parsed.ok);
  assert.equal(parsed.payment.id, "pay_contract");
  assert.equal(parsed.payment.orderId, null);
  assert.equal(parsed.payment.amount, 500);
  const withMeta = readKobaraWebhook({ ...event, data: { ...event.data, metadata: { order_id: "order_contract" } } }, "live", "live");
  assert.ok(withMeta.ok);
  assert.equal(withMeta.payment.orderId, "order_contract");
});

test("webhooks reject missing or mismatched environments, currencies, amounts and status", () => {
  for (const malformed of [null, [], {}, { ...event, environment: "test" },
    ...[{ environment: "test" }, { currency: "USD" }, { currency: undefined }, { amount: 500.1 }, { amount: "500" }, { amount: -5 }, { amount: null }, { id: "" }, { status: "pending" }].map(change => ({ ...event, data: { ...event.data, ...change } }))]) {
    assert.equal(readKobaraWebhook(malformed, "live", "live").ok, false);
  }
  assert.equal(readKobaraWebhook(event, "test", "live").ok, false);
  assert.equal(readKobaraWebhook(event, null, "live").ok, false);
  assert.equal(readKobaraWebhook(event, "live", "test").ok, false);
  assert.deepEqual(readKobaraWebhook({ ...event, event_type: "payment.failed" }, "live", "live"), { ok: false, code: "evenement_ignore", ignored: true });
});

test("an undocumented GET returning 404 never expires a possibly paid order", async t => {
  environment(t);
  let expired = false;
  const result = await reconcileKobara({
    listPending: async () => [{ idempotency_key: "o", order_id: "o", created_at: "2020-01-01", raw: { kobara_payment_id: "pay_contract" } }],
    retrieve: id => retrieveKobaraPayment(id, async () => new Response(null, { status: 404 })),
    confirm: async () => { throw new Error("must not confirm"); },
    expire: async () => { expired = true; return {}; },
  });
  assert.equal(expired, false);
  assert.equal(result.errors.length, 1);
});

test("reconciliation rejects wrong identity, currency and fractional amount", async () => {
  for (const change of [{ id: "other" }, { currency: "USD" }, { amount: 500.1 }]) {
    let confirmed = false;
    const result = await reconcileKobara({
      listPending: async () => [{ idempotency_key: "o", order_id: "o", created_at: new Date().toISOString(), raw: { kobara_payment_id: "pay_contract" } }],
      retrieve: async () => ({ id: "pay_contract", status: "succeeded", amount: 500, currency: "HTG", reference: "KOB123", provider: "natcash", providerRef: null, ...change }),
      confirm: async () => { confirmed = true; return {}; }, expire: async () => ({}),
    });
    assert.equal(confirmed, false);
    assert.equal(result.errors.length, 1);
  }
});

test("public availability follows configuration, including MonCash via Kobara", () => {
  const configured = { NODE_ENV: "test" as const, KOBARA_MODE: "live", KOBARA_SECRET_KEY: "kbr_sk_live_fixture", KOBARA_WEBHOOK_SECRET: "fixture" };
  assert.equal(getKobaraAvailability(configured), "production");
  assert.equal(getNatCashAvailabilityKey(configured), "availability.natcash.production");
  assert.equal(getMonCashAvailability({ ...configured, KOBARA_MONCASH: "true" }), "production");
  for (const change of [{ KOBARA_WEBHOOK_SECRET: "" }, { KOBARA_MODE: "test" }, { KOBARA_SECRET_KEY: "kbr_sk_test_fixture" }, { KOBARA_MODE: "LIVE" }]) {
    assert.equal(getKobaraAvailability({ ...configured, ...change }), "unavailable");
    assert.equal(getNatCashAvailabilityKey({ ...configured, ...change }), "footer.natcash");
  }
});
