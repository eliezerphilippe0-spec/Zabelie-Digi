import test from "node:test";
import assert from "node:assert/strict";
import { checkoutOrderId, validCheckoutKey, savedCheckoutRedirect } from "../lib/checkout-idempotency";
import { persistPaymentSession } from "../lib/payment-utils";
import { t } from "../lib/i18n";
import { database, loadRoute, type Query } from "./helpers/route-harness";

const KEY = "11111111-1111-4111-8111-111111111111";
const OTHER_KEY = "22222222-2222-4222-8222-222222222222";
const GATEWAY = "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=test";

test("attempt identity is stable, scoped to the verified buyer and bounded", () => {
  assert.equal(checkoutOrderId("buyer", KEY), checkoutOrderId("buyer", KEY.toUpperCase()));
  assert.notEqual(checkoutOrderId("buyer", KEY), checkoutOrderId("other-buyer", KEY));
  assert.notEqual(checkoutOrderId("buyer", KEY), checkoutOrderId("buyer", OTHER_KEY));
  assert.match(checkoutOrderId("buyer", KEY), /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const bad of [null, 123, "", "order-id", `${KEY}extra`, "11111111-1111-1111-1111-111111111111"]) {
    assert.equal(validCheckoutKey(bad), false);
    assert.throws(() => checkoutOrderId("buyer", bad as string));
  }
});

function fixture(options: { missingOriginal?: boolean; readError?: boolean; sessionError?: boolean; paid?: boolean; operatorError?: boolean; legacySchema?: boolean; groupedOriginal?: boolean } = {}) {
  const orders = new Map<string, Record<string, unknown>>();
  const operatorCalls: string[] = [];
  const paymentWrites: string[] = [];
  const sessions = new Map<string, Record<string, unknown>>();
  let storedSessions = 0;
  function step(query: Query, name: string) { return query.steps.find(([s]) => s === name)?.[1]; }
  const db = database(query => {
    if (query.table === "products") return { data: { id: "product", seller_id: "seller", kind: "service", price_htg: 100, category_id: null }, error: null };
    if (query.table === "orders" && step(query, "insert")) {
      const input = step(query, "insert")![0] as Record<string, unknown>;
      // Postgres supplies a fresh default id if the application omits it.
      // This makes the fixture expose the original duplicate-order bug.
      const order = { ...input, id: input.id ?? `auto-${orders.size + 1}` } as Record<string, unknown>;
      assert.equal(order.buyer_id, "buyer", "identity comes from auth");
      assert.equal(order.amount_htg, 100, "amount comes from the server");
      if (orders.has(order.id as string)) return { data: null, error: { code: "23505" } };
      orders.set(order.id as string, order);
      return { data: { id: order.id, amount_htg: order.amount_htg }, error: null };
    }
    if (query.table === "orders") {
      assert.deepEqual(query.steps.filter(([s]) => s === "eq").map(([, args]) => Array.from(args)),
        [["id", checkoutOrderId("buyer", KEY)], ["buyer_id", "buyer"]]);
      if (options.legacySchema && String(step(query, "select")?.[0]).includes("group_id")) {
        return { data: null, error: { code: "42703", message: "column orders.group_id does not exist" } };
      }
      return { data: options.missingOriginal ? null : { id: checkoutOrderId("buyer", KEY), status: options.paid ? "paid" : "pending", ...(!options.legacySchema ? { group_id: options.groupedOriginal ? "group" : null } : {}) }, error: options.readError ? { code: "offline" } : null };
    }
    if (query.table === "payments" && step(query, "insert")) {
      paymentWrites.push((step(query, "insert")![0] as { order_id: string }).order_id);
      return { error: null };
    }
    if (query.table === "payments" && step(query, "update")) {
      storedSessions++;
      const orderId = query.steps.find(([s]) => s === "eq")![1][1];
      if (!options.sessionError) sessions.set(orderId as string, (step(query, "update")![0] as { raw: Record<string, unknown> }).raw);
      return { data: { order_id: orderId }, error: options.sessionError ? { code: "offline" } : null };
    }
    if (query.table === "payments") {
      const orderId = query.steps.find(([s]) => s === "eq")![1][1] as string;
      return { data: { status: options.paid ? "confirmed" : "pending", rail: "moncash", raw: sessions.get(orderId) ?? null }, error: null };
    }
    throw new Error("Unexpected query " + query.table);
  });
  const route = loadRoute("app/api/checkout/route.ts", {
    "@/lib/i18n": { t },
    "@/lib/checkout-idempotency": { checkoutOrderId, validCheckoutKey, savedCheckoutRedirect },
    "@/lib/product-offers": { recommendationAttribution: () => ({}) },
    "@/lib/product-offers-server": { offerAttribution: () => ({}) },
    "@/lib/seller-pricing-server": { readSellerPricing: async () => null },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "buyer" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/panier-groupe-contexte": { contexteGroupe: () => null },
    "@/lib/product-kind": { isDownloadable: () => false, isDigitalKind: () => false },
    "@/lib/age-minimum": { lireAgeMinimum: async () => ({ ok: true, age: 0 }) },
    "@/lib/purchase-price": { readPurchasePrice: async () => ({ ok: true, priceHTG: 100, quantity: 1, variantId: null }) },
    "@/lib/flash": { offreFlashActive: async () => null },
    "@/lib/payment-utils": { railCap: () => 25000, railCountry: () => "HT", persistPaymentSession },
    "@/lib/geo/country-backfill": { backfillCountry: async () => {}, countryFromRequest: () => "HT" },
    "@/lib/affiliation": { attribuerCommande: async () => {} },
    "@/lib/moncash": {
      resolveMonCashMode: () => ({ mode: "sandbox" }),
      createPayment: async (id: string) => {
        operatorCalls.push(id);
        if (options.operatorError) throw new Error("Operator response lost");
        return { redirectUrl: GATEWAY, paymentToken: "test", mode: "sandbox", gatewayHost: "sandbox.moncashbutton.digicelgroup.com" };
      },
    },
  });
  return {
    orders, operatorCalls, paymentWrites,
    sessionCount: () => storedSessions,
    post: (checkoutKey: unknown = KEY, extra: object = {}) => route.POST(new Request("https://zabelie.test/api/checkout", {
      method: "POST", body: JSON.stringify({ productId: "product", checkoutKey, ...extra }),
    })),
  };
}

test("simultaneous retries create one order, one payment and one operator session", async () => {
  const f = fixture();
  const responses = await Promise.all([f.post(), f.post()]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const data = await Promise.all(responses.map(r => r.json()));
  assert.equal(f.orders.size, 1);
  assert.equal(f.paymentWrites.length, 1);
  assert.equal(f.operatorCalls.length, 1);
  assert.equal(f.sessionCount(), 1);
  assert.equal(data[0].orderId, data[1].orderId);
  assert.equal(data.filter(d => d.deja).length, 1);
  assert.ok(data.every(d => ["/mes-achats", GATEWAY].includes(d.redirectUrl)));
});

test("a replay never accepts another buyer or amount from the client", async () => {
  const f = fixture();
  await f.post();
  const replay = await f.post(KEY, { buyer_id: "other-buyer", amount_htg: 1, rail: "moncash", quantity: 2 });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).redirectUrl, GATEWAY);
  assert.equal(f.orders.size, 1);
  assert.equal(f.operatorCalls.length, 1);
});

test("a missing/invalid attempt key cannot create an order or call an operator", async () => {
  for (const key of [null, "bad", ""]) {
    const f = fixture();
    const response = await f.post(key);
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, "checkout_key_required");
    assert.match(body.error, /Actualisez/);
    assert.equal(f.orders.size, 0);
    assert.equal(f.operatorCalls.length, 0);
  }
});

test("a duplicate whose original cannot be read fails closed", async () => {
  for (const options of [{ missingOriginal: true }, { readError: true }]) {
    const f = fixture(options);
    await f.post();
    assert.equal((await f.post()).status, 503);
    assert.equal(f.orders.size, 1);
    assert.equal(f.operatorCalls.length, 1);
  }
});

test("a new purchase attempt can create a separate order", async () => {
  const f = fixture();
  assert.equal((await f.post()).status, 200);
  assert.equal((await f.post(OTHER_KEY)).status, 200);
  assert.equal(f.orders.size, 2);
  assert.equal(f.operatorCalls.length, 2);
});

test("session persistence failure exposes no payment link and retry starts no second session", async () => {
  const f = fixture({ sessionError: true });
  const response = await f.post();
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.equal(data.code, "provider_unavailable");
  assert.equal(data.redirectUrl, undefined);
  assert.equal((await f.post()).status, 200);
  assert.equal(f.orders.size, 1);
  assert.equal(f.operatorCalls.length, 1);
});

test("a lost browser response resumes the original stored session", async () => {
  const f = fixture();
  await f.post();
  const replay = await f.post();
  assert.equal((await replay.json()).redirectUrl, GATEWAY);
  assert.equal(f.operatorCalls.length, 1);
});

test("a retry resumes without the group migration and still blocks grouped sessions when present", async () => {
  for (const options of [{ legacySchema: true }, { groupedOriginal: true }]) {
    const f = fixture(options);
    await f.post();
    const replay = await f.post();
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).redirectUrl, options.legacySchema ? GATEWAY : "/mes-achats");
    assert.equal(f.operatorCalls.length, 1);
  }
});

test("an unknown operator outcome requires review rather than another operator call", async () => {
  const f = fixture({ operatorError: true });
  assert.equal((await f.post()).status, 502);
  assert.equal((await (await f.post()).json()).redirectUrl, "/mes-achats");
  assert.equal(f.operatorCalls.length, 1);
});

test("confirmed purchases and untrusted destinations never reopen a payment session", async () => {
  const f = fixture({ paid: true });
  await f.post();
  assert.equal((await (await f.post()).json()).redirectUrl, "/mes-achats");
  const pending = { status: "pending", group_id: null };
  const payment = { status: "pending", rail: "moncash", raw: { checkout_redirect_url: GATEWAY } };
  assert.equal(savedCheckoutRedirect(pending, payment), GATEWAY);
  for (const order of [{ status: "paid" }, { status: "cancelled" }, { status: "pending", group_id: "group" }]) {
    assert.equal(savedCheckoutRedirect(order, payment), null);
  }
  for (const url of ["http://sandbox.moncashbutton.digicelgroup.com", "javascript:alert(1)", "https://evil.test/pay", "https://checkout.stripe.com@evil.test/pay", "https://sandbox.moncashbutton.digicelgroup.com:8443/pay"]) {
    assert.equal(savedCheckoutRedirect(pending, { ...payment, raw: { checkout_redirect_url: url } }), null);
  }
  for (const [rail, url] of [["stripe", "https://checkout.stripe.com/pay/cs_saved"], ["kobara", "https://checkout.kobara.app/pay/test"]]) {
    assert.equal(savedCheckoutRedirect(pending, { ...payment, rail, raw: { checkout_redirect_url: url } }), url);
  }
  assert.equal(savedCheckoutRedirect(pending, { ...payment, status: "confirmed" }), null);
});
