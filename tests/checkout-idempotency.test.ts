import test from "node:test";
import assert from "node:assert/strict";
import { checkoutOrderId, checkoutIntentHash, checkoutStockIsHeld, validCheckoutKey, validCheckoutOrderId, savedCheckoutRedirect } from "../lib/checkout-idempotency";
import { isTrackedStockKind, isProductKind } from "../lib/product-kind";
import { persistPaymentSession, usdCentsFromHtg, formatUsd, zelleMemo } from "../lib/payment-utils";
import { normalizeRecipient } from "../lib/order-recipient";
import { normaliserNumeroHaiti } from "../lib/rechaj";
import { t } from "../lib/i18n";
import { database, loadRoute, type Query } from "./helpers/route-harness";

const KEY = "11111111-1111-4111-8111-111111111111";
const OTHER_KEY = "22222222-2222-4222-8222-222222222222";
const GATEWAY = "https://sandbox.moncashbutton.digicelgroup.com/Moncash-middleware/Payment/Redirect?token=test";
const RECIPIENT = { name: "Destinataire de test", phone: "34123456", locality: "Delmas", note: "", consent: true };

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

function fixture(options: { missingOriginal?: boolean; readError?: boolean; sessionError?: boolean; sessionCommittedError?: boolean; paid?: boolean; operatorError?: boolean; legacySchema?: boolean; groupedOriginal?: boolean;
  firstPaymentFailure?: boolean; firstPaymentCommittedError?: boolean; digital?: boolean; physical?: boolean; stockStatus?: string; expiredStock?: boolean; stockReadError?: boolean; noStock?: boolean; age?: number;
  recharge?: boolean; metadataWriteError?: string; metadataReadError?: boolean; deferFirstPaymentClaim?: boolean; ownProduct?: boolean } = {}) {
  const orders = new Map<string, Record<string, unknown>>();
  const operatorCalls: string[] = [];
  const paymentWrites: string[] = [];
  const sessions = new Map<string, Record<string, unknown>>();
  const payments = new Map<string, Record<string, unknown>>();
  const attestations = new Map<string, Record<string, unknown>>();
  const recipients = new Map<string, Record<string, unknown>>();
  const rechargeTargets = new Map<string, Record<string, unknown>>();
  const stockCalls: string[] = [];
  const accountChecks: { id: string; legalAcceptance: boolean | undefined }[] = [];
  let failedPayment = false;
  let currentPrice = 100;
  let storedSessions = 0;
  let currentAge = options.age ?? 0;
  let currentRecharge = Boolean(options.recharge);
  let paymentClaims = 0;
  let releasePaymentClaim!: () => void;
  let notifyPaymentClaim!: () => void;
  const paymentClaimReleased = new Promise<void>(resolve => { releasePaymentClaim = resolve; });
  const paymentClaimEntered = new Promise<void>(resolve => { notifyPaymentClaim = resolve; });
  function step(query: Query, name: string) { return query.steps.find(([s]) => s === name)?.[1]; }
  const db = database(async query => {
    if (query.table === "products") return { data: { id: "product", seller_id: options.ownProduct ? "buyer" : "seller", kind: options.physical ? "physical" : options.digital ? "fichier" : "service", price_htg: currentPrice, category_id: currentRecharge ? "category" : null, product_assets: [{ count: 1 }] }, error: null };
    if (query.table === "orders" && step(query, "insert")) {
      const input = step(query, "insert")![0] as Record<string, unknown>;
      // Postgres supplies a fresh default id if the application omits it.
      // This makes the fixture expose the original duplicate-order bug.
      const order = { ...input, id: input.id ?? `auto-${orders.size + 1}` } as Record<string, unknown>;
      assert.equal(order.buyer_id, "buyer", "identity comes from auth");
      assert.equal(order.amount_htg, currentPrice, "amount comes from the server");
      if (orders.has(order.id as string)) return { data: null, error: { code: "23505" } };
      orders.set(order.id as string, order);
      return { data: { id: order.id, amount_htg: order.amount_htg }, error: null };
    }
    if (query.table === "orders") {
      assert.equal(step(query, "delete"), undefined, "never delete a concurrent owner's order or immutable snapshot");
      const id = query.steps.find(([s, args]) => s === "eq" && args[0] === "id")![1][1] as string;
      assert.deepEqual(query.steps.filter(([s]) => s === "eq").map(([, args]) => Array.from(args)),
        [["id", id], ["buyer_id", "buyer"]]);
      if (options.legacySchema && String(step(query, "select")?.[0]).includes("group_id")) {
        return { data: null, error: { code: "42703", message: "column orders.group_id does not exist" } };
      }
      return { data: options.missingOriginal ? null : orders.has(id) ? { ...orders.get(id), status: options.paid ? "paid" : "pending", ...(!options.legacySchema ? { group_id: options.groupedOriginal ? "group" : null } : {}) } : null, error: options.readError ? { code: "offline" } : null };
    }
    if (query.table === "payments" && step(query, "insert")) {
      const input = step(query, "insert")![0] as { order_id: string };
      if (options.deferFirstPaymentClaim && paymentClaims++ === 0) { notifyPaymentClaim(); await paymentClaimReleased; }
      if (options.firstPaymentFailure && !failedPayment) { failedPayment = true; return { error: { code: "08006", message: "transient database failure" } }; }
      if (payments.has(input.order_id)) return { error: { code: "23505" } };
      payments.set(input.order_id, input);
      paymentWrites.push(input.order_id);
      if (options.firstPaymentCommittedError && !failedPayment) { failedPayment = true; return { error: { code: "08006", message: "insert response lost after commit" } }; }
      return { error: null };
    }
    if (query.table === "payments" && step(query, "update")) {
      storedSessions++;
      const orderId = query.steps.find(([s]) => s === "eq")![1][1];
      if (!options.sessionError) sessions.set(orderId as string, (step(query, "update")![0] as { raw: Record<string, unknown> }).raw);
      return { data: { order_id: orderId }, error: options.sessionError || options.sessionCommittedError ? { code: "offline" } : null };
    }
    if (query.table === "payments") {
      const orderId = query.steps.find(([s]) => s === "eq")![1][1] as string;
      return { data: payments.has(orderId) ? { ...payments.get(orderId), status: options.paid ? "confirmed" : payments.get(orderId)?.status,
        raw: sessions.get(orderId) ?? payments.get(orderId)?.raw ?? null,
        orders: { buyer_id: "buyer", status: orders.get(orderId)?.status, product_id: "product" } } : null, error: null };
    }
    if (query.table === "zabelie_stock_reservations") return { data: options.noStock ? [] : [{ status: options.stockStatus ?? "held", expires_at: new Date(Date.now() + (options.expiredStock ? -1 : 60_000)).toISOString() }], error: options.stockReadError ? { code: "offline" } : null };
    const metadata = query.table === "zabelie_order_age_attestations" ? attestations
      : query.table === "zabelie_order_recipients" ? recipients : query.table === "zabelie_rechaj_cible" ? rechargeTargets : null;
    if (metadata) {
      if (step(query, "insert")) {
        const input = step(query, "insert")![0] as { order_id: string };
        if (options.metadataWriteError === query.table) return { error: { code: "offline" } };
        if (metadata.has(input.order_id)) return { error: { code: "23505" } };
        metadata.set(input.order_id, input); return { error: null };
      }
      const orderId = query.steps.find(([s]) => s === "eq")![1][1] as string;
      return { data: metadata.get(orderId) ?? null, error: options.metadataReadError ? { code: "offline" } : null };
    }
    throw new Error("Unexpected query " + query.table);
  });
  const route = loadRoute("app/api/checkout/route.ts", {
    "@/lib/i18n": { t },
    "@/lib/checkout-idempotency": { checkoutOrderId, checkoutIntentHash, checkoutStockIsHeld, validCheckoutKey, validCheckoutOrderId, savedCheckoutRedirect },
    "@/lib/order-recipient": { normalizeRecipient },
    "@/lib/rechaj": { normaliserNumeroHaiti },
    "@/lib/product-offers": { recommendationAttribution: () => ({}) },
    "@/lib/product-offers-server": { offerAttribution: () => ({}) },
    "@/lib/seller-pricing-server": { readSellerPricing: async () => null },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "buyer" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ ...db, rpc: async (name: string) => { if (name === "zabelie_est_rechaj") return { data: currentRecharge, error: null }; stockCalls.push(name); return { data: { ok: true }, error: null }; } }) },
    "@/lib/auth": { requireActiveAccount: async (id: string, guard?: { legalAcceptance?: boolean }) => {
      accountChecks.push({ id, legalAcceptance: guard?.legalAcceptance });
      return null;
    } },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/panier-groupe-contexte": { contexteGroupe: () => null },
    "@/lib/product-kind": { isDownloadable: () => Boolean(options.digital), isDigitalKind: () => Boolean(options.digital), isTrackedStockKind, isProductKind },
    "@/lib/digital-file-security": { digitalProductIsClean: async () => true },
    "@/lib/age-minimum": { lireAgeMinimum: async () => ({ ok: true, age: currentAge }), attestationAgeValide: (v: unknown) => v === true },
    "@/lib/purchase-price": { readPurchasePrice: async (_db: unknown, _product: unknown, variant: unknown, quantity: unknown) => {
      const variantId = options.physical ? typeof variant === "string" ? variant : "variant" : null;
      const qty = options.physical && typeof quantity === "number" ? quantity : 1;
      return { ok: true, priceHTG: currentPrice * qty * (variantId === "variant-half" ? 0.5 : 1), quantity: qty, variantId };
    } },
    "@/lib/flash": { offreFlashActive: async () => null },
    "@/lib/payment-utils": { railCap: () => 25000, railCountry: () => "HT", persistPaymentSession, usdCentsFromHtg },
    "@/lib/zelle": { isZelleEnabled: () => true },
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
  }, { USD_HTG_RATE: "132" });
  return {
    orders, payments, sessions, attestations, recipients, rechargeTargets, operatorCalls, paymentWrites, stockCalls, accountChecks, db,
    changePrice: (price: number) => { currentPrice = price; },
    changeAge: (age: number) => { currentAge = age; },
    changeRecharge: (required: boolean) => { currentRecharge = required; },
    paymentClaimEntered, releasePaymentClaim,
    sessionCount: () => storedSessions,
    post: (checkoutKey: unknown = KEY, extra: object = {}) => route.POST(new Request("https://zabelie.test/api/checkout", {
      method: "POST", body: JSON.stringify({ productId: "product", checkoutKey, ...extra }),
    })),
  };
}

test("an own offer is rejected before any order, private metadata, stock or operator", async () => {
  for (const opts of [{}, { digital: true }, { physical: true }]) {
    const f = fixture({ ...opts, ownProduct: true });
    const res = await f.post();
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, "self_purchase");
    assert.equal(f.orders.size, 0); assert.equal(f.payments.size, 0);
    assert.equal(f.attestations.size + f.recipients.size + f.rechargeTargets.size, 0);
    assert.equal(f.stockCalls.length, 0); assert.equal(f.operatorCalls.length, 0);
  }
});

function zellePage(f: ReturnType<typeof fixture>) {
  let instructionsRead = 0;
  const page = loadRoute("app/paiement/zelle/[orderId]/page.tsx", {
    "next/navigation": { notFound: () => { throw new Error("notFound"); }, redirect: (url: string) => { throw new Error(`redirect:${url}`); } },
    "next/link": { default: "Link" },
    "react/jsx-runtime": { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) },
    "@/components/site-nav": { SiteNav: "SiteNav" },
    "@/components/copy-field": { CopyField: "CopyField" },
    "@/components/zelle-reference-form": { ZelleReferenceForm: "ZelleReferenceForm" },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "buyer" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => f.db },
    "@/lib/zelle": { isZelleEnabled: () => true, zelleRecipient: () => { instructionsRead++; return { handle: "zelle-local-test@example.test", name: "Local test" }; } },
    "@/lib/payment-utils": { formatUsd, zelleMemo },
    "@/lib/product-kind": { isProductKind, isTrackedStockKind },
    "@/lib/checkout-idempotency": { checkoutStockIsHeld },
  });
  return { render: () => page.default({ params: Promise.resolve({ orderId: checkoutOrderId("buyer", KEY) }) }), instructionsRead: () => instructionsRead };
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
  assert.ok(data.every(d => d.redirectUrl === GATEWAY || d.redirectUrl?.startsWith("/paiement/en-attente?commande=")));
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
  const retry = await (await f.post()).json();
  assert.equal(retry.checkoutState, "pending");
  assert.match(retry.redirectUrl, /^\/paiement\/en-attente\?commande=/);
  assert.equal(f.operatorCalls.length, 1);
});

test("a missing digital payment is repaired on the same immutable order, once under concurrent retries", async () => {
  const f = fixture({ digital: true, firstPaymentFailure: true, age: 18 });
  assert.equal((await f.post(KEY, { ageAttestation: true })).status, 500);
  const snapshotOrder = f.orders.get(checkoutOrderId("buyer", KEY));
  const checked = await f.post(KEY, { recoveryOnly: true });
  assert.equal(checked.status, 200);
  assert.deepEqual(await checked.json(), { orderId: checkoutOrderId("buyer", KEY), deja: true, checkoutState: "retryable", retryAllowed: true });
  assert.equal(f.operatorCalls.length, 0, "recovery-only does not create its missing payment or operator session");
  assert.equal(f.payments.size, 0);
  const retries = await Promise.all([f.post(KEY, { ageAttestation: true }), f.post(KEY, { ageAttestation: true })]);
  assert.ok(retries.every(r => r.status === 200));
  assert.equal(f.orders.size, 1);
  assert.equal(f.orders.get(checkoutOrderId("buyer", KEY)), snapshotOrder, "same order and immutable acquired snapshot");
  assert.equal(f.payments.size, 1);
  assert.equal(f.operatorCalls.length, 1);
  assert.equal(f.attestations.size, 1, "immutable matching attestation can be reused");
  assert.equal(f.db.queries.some(q => stepForTest(q, "delete")), false);
});

function stepForTest(query: Query, name: string) { return query.steps.find(([s]) => s === name)?.[1]; }

test("a missing-payment repair preserves the original price and refuses a different product", async () => {
  const f = fixture({ digital: true, firstPaymentFailure: true });
  await f.post();
  f.changePrice(120);
  assert.equal((await f.post()).status, 409);
  assert.equal((await f.post(KEY, { productId: "different", recoveryOnly: true })).status, 409);
  assert.equal(f.orders.size, 1);
  assert.equal(f.payments.size, 0);
  assert.equal(f.operatorCalls.length, 0);
});

test("a lost payment-insert response never causes a second provider call or deletes the committed key", async () => {
  const f = fixture({ digital: true, firstPaymentCommittedError: true });
  assert.equal((await f.post()).status, 500);
  assert.equal(f.payments.size, 1);
  assert.equal(f.operatorCalls.length, 0, "provider did not start after an uncertain insert");
  for (const extra of [{}, { recoveryOnly: true }]) {
    const response = await f.post(KEY, extra);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).checkoutState, "pending");
  }
  assert.equal(f.payments.size, 1);
  assert.equal(f.operatorCalls.length, 0);
  assert.equal(f.db.queries.some(q => stepForTest(q, "delete")), false);
});

test("an immutable metadata duplicate with different values cannot authorize payment", async () => {
  const f = fixture({ digital: true, firstPaymentFailure: true, age: 18 });
  await f.post(KEY, { ageAttestation: true });
  f.attestations.set(checkoutOrderId("buyer", KEY), { order_id: checkoutOrderId("buyer", KEY), age_minimum: 21 });
  assert.equal((await f.post(KEY, { ageAttestation: true })).status, 409);
  assert.equal(f.operatorCalls.length, 0);
  assert.equal(f.payments.size, 0);
  assert.equal(f.attestations.get(checkoutOrderId("buyer", KEY))?.age_minimum, 21);
});

test("a historical physical orphan cannot omit or change its gift, variant or quantity", async () => {
  const f = fixture({ physical: true, firstPaymentFailure: true });
  assert.equal((await f.post(KEY, { recipient: RECIPIENT })).status, 500);
  const id = checkoutOrderId("buyer", KEY);
  // The deployed handler wrote this row before its failed payment insert.
  f.recipients.set(id, { order_id: id, ...normalizeRecipient(RECIPIENT)! });
  const before = { ...f.recipients.get(id) };
  for (const extra of [{}, { recipient: null }, { recipient: { ...RECIPIENT, name: "Autre destinataire" } },
    { recipient: RECIPIENT, variantId: "variant-other" }, { recipient: RECIPIENT, variantId: "variant-half", quantity: 2 },
    { recipient: RECIPIENT }]) {
    const response = await f.post(KEY, extra);
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "checkout_attempt_conflict");
  }
  const observed = await (await f.post(KEY, { recoveryOnly: true })).json();
  assert.equal(observed.checkoutState, "review");
  assert.equal(observed.retryAllowed, undefined);
  assert.deepEqual(f.recipients.get(id), before);
  assert.equal(f.paymentWrites.length, 0);
  assert.equal(f.operatorCalls.length, 0);
  assert.equal(f.orders.size, 1);
});

test("normal replays reject gift presence/absence and same-price variant or quantity changes", async () => {
  for (const gift of [true, false]) {
    const f = fixture({ physical: true });
    assert.equal((await f.post(KEY, gift ? { recipient: RECIPIENT } : {})).status, 200);
    const count = f.db.queries.length;
    for (const extra of [gift ? {} : { recipient: RECIPIENT },
      { ...(gift ? { recipient: RECIPIENT } : {}), variantId: "variant-other" },
      { ...(gift ? { recipient: RECIPIENT } : {}), variantId: "variant-half", quantity: 2 }]) {
      assert.equal((await f.post(KEY, extra)).status, 409);
    }
    assert.equal(f.recipients.size, gift ? 1 : 0);
    assert.equal(f.operatorCalls.length, 1);
    assert.ok(f.db.queries.slice(count).every(q => !stepForTest(q, "insert") || q.table === "orders"), "losers cannot write payment or private metadata");
    const recovery = await f.post(KEY, { recoveryOnly: true });
    assert.equal((await recovery.json()).redirectUrl, GATEWAY, "observation resumes the actual stored intention");
  }
});

test("concurrent gift/self submissions leave only the payment owner's private metadata", async () => {
  for (const firstGift of [true, false]) {
    const f = fixture({ physical: true, deferFirstPaymentClaim: true });
    const first = f.post(KEY, firstGift ? { recipient: RECIPIENT } : {});
    await f.paymentClaimEntered;
    assert.equal(f.recipients.size, 0, "no private write before payment ownership");
    const other = await f.post(KEY, firstGift ? {} : { recipient: RECIPIENT });
    assert.equal(other.status, 409);
    assert.equal(f.recipients.size, 0, "non-owner writes no metadata");
    f.releasePaymentClaim();
    assert.equal((await first).status, 200);
    assert.equal(f.recipients.size, firstGift ? 1 : 0);
    assert.equal(f.paymentWrites.length, 1);
    assert.equal(f.operatorCalls.length, 1);
  }
});

test("the concurrent digital payment winner alone fixes target and calls the operator", async () => {
  const f = fixture({ recharge: true, deferFirstPaymentClaim: true });
  const first = f.post(KEY, { rechajNumero: "34123456" });
  await f.paymentClaimEntered;
  assert.equal(f.rechargeTargets.size, 0);
  const winner = await f.post(KEY, { rechajNumero: "40123456" });
  assert.equal(winner.status, 200);
  f.releasePaymentClaim();
  assert.equal((await first).status, 409, "loser cannot replay a different owner's intent");
  assert.equal(f.rechargeTargets.get(checkoutOrderId("buyer", KEY))?.msisdn, "40123456");
  assert.equal(f.rechargeTargets.size, 1);
  assert.equal(f.paymentWrites.length, 1);
  assert.equal(f.operatorCalls.length, 1);
  assert.equal(f.db.queries.filter(q => q.table === "zabelie_rechaj_cible" && stepForTest(q, "insert")).length, 1);
});

test("historical metadata cannot disappear when current age or recharge requirements change", async () => {
  for (const field of ["age", "recharge", "recipient"] as const) {
    const f = fixture({ digital: true, firstPaymentFailure: true });
    assert.equal((await f.post()).status, 500);
    const id = checkoutOrderId("buyer", KEY);
    if (field === "age") f.attestations.set(id, { order_id: id, age_minimum: 18 });
    if (field === "recharge") f.rechargeTargets.set(id, { order_id: id, msisdn: "34123456" });
    if (field === "recipient") f.recipients.set(id, { order_id: id, ...normalizeRecipient(RECIPIENT)! });
    assert.equal((await f.post()).status, 409);
    assert.equal(f.payments.size, 0);
    assert.equal(f.operatorCalls.length, 0);
  }
});

test("metadata write failures after payment ownership never authorize an operator or another writer", async () => {
  for (const [table, options, extra] of [
    ["zabelie_order_recipients", { physical: true }, { recipient: RECIPIENT }],
    ["zabelie_rechaj_cible", { recharge: true }, { rechajNumero: "34123456" }],
    ["zabelie_order_age_attestations", { age: 18 }, { ageAttestation: true }],
  ] as const) {
    const f = fixture({ ...options, metadataWriteError: table });
    assert.ok((await f.post(KEY, extra)).status >= 500);
    assert.equal(f.payments.size, 1, "canonical pending ownership survives private-write failure");
    assert.equal(f.operatorCalls.length, 0);
    const count = f.db.queries.length;
    const replay = await f.post(KEY, extra);
    assert.equal((await replay.json()).checkoutState, "pending");
    assert.equal(f.operatorCalls.length, 0);
    assert.ok(f.db.queries.slice(count).every(q => !stepForTest(q, "insert") || q.table === "orders"));
  }
});

test("Zelle preparation failures cannot expose instructions through checkout recovery or the direct page", async () => {
  for (const [table, options, extra] of [
    ["zabelie_order_recipients", { physical: true }, { recipient: RECIPIENT }],
    ["zabelie_rechaj_cible", { recharge: true }, { rechajNumero: "34123456" }],
    ["zabelie_order_age_attestations", { age: 18 }, { ageAttestation: true }],
  ] as const) {
    const f = fixture({ ...options, metadataWriteError: table });
    assert.ok((await f.post(KEY, { rail: "zelle", ...extra })).status >= 500);
    for (const request of [{ rail: "zelle", ...extra }, { recoveryOnly: true }]) {
      const replay = await (await f.post(KEY, request)).json();
      assert.equal(replay.checkoutState, "review");
      assert.notEqual(replay.redirectUrl, `/paiement/zelle/${checkoutOrderId("buyer", KEY)}`);
    }
    const page = zellePage(f);
    await assert.rejects(page.render(), /^Error: redirect:\/paiement\/en-attente\?commande=/);
    assert.equal(page.instructionsRead(), 0, "no recipient/transfer details rendered");
    assert.equal(f.sessions.size, 0, "no preparation proof after metadata failure");
    assert.equal(f.operatorCalls.length, 0);
  }
});

test("Zelle instructions require durably prepared metadata and the original active stock hold", async () => {
  const f = fixture({ physical: true, age: 18 });
  const result = await f.post(KEY, { rail: "zelle", recipient: RECIPIENT, ageAttestation: true });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).checkoutState, "ready");
  const id = checkoutOrderId("buyer", KEY);
  assert.equal(f.sessions.get(id)?.checkout_prepared, true);
  assert.equal(typeof f.sessions.get(id)?.checkout_intent_hash, "string");
  assert.equal(f.recipients.size, 1);
  assert.equal(f.attestations.size, 1);
  assert.deepEqual(f.stockCalls, ["zabelie_reserve_stock"]);
  const prepared = f.db.queries.findIndex(q => q.table === "payments" && stepForTest(q, "update"));
  assert.ok(f.db.queries.findIndex(q => q.table === "zabelie_order_age_attestations" && stepForTest(q, "insert")) < prepared);
  const page = zellePage(f);
  assert.ok(await page.render());
  assert.equal(page.instructionsRead(), 1);
  assert.equal((await (await f.post(KEY, { recoveryOnly: true })).json()).checkoutState, "ready");
  assert.equal(f.operatorCalls.length, 0, "Zelle has no operator API");

  for (const options of [{ stockStatus: "released" }, { expiredStock: true }, { noStock: true }, { stockReadError: true }]) {
    const expired = fixture({ physical: true, ...options });
    await expired.post(KEY, { rail: "zelle" });
    const direct = zellePage(expired);
    await assert.rejects(direct.render(), /^Error: redirect:\/paiement\/en-attente\?commande=/);
    assert.equal(direct.instructionsRead(), 0);
    assert.notEqual((await (await expired.post(KEY, { recoveryOnly: true })).json()).checkoutState, "ready");
  }
});

test("Zelle legacy or failed proof persistence stays in review without revealing transfer instructions", async () => {
  for (const failure of [false, true]) {
    const f = fixture({ sessionError: failure });
    const result = await f.post(KEY, { rail: "zelle" });
    assert.equal(result.status, failure ? 502 : 200);
    if (!failure) f.sessions.set(checkoutOrderId("buyer", KEY), {}); // legacy raw without the proof
    const replay = await (await f.post(KEY, { recoveryOnly: true })).json();
    assert.equal(replay.checkoutState, "review");
    const page = zellePage(f);
    await assert.rejects(page.render(), /^Error: redirect:\/paiement\/en-attente\?commande=/);
    assert.equal(page.instructionsRead(), 0);
    assert.equal(f.operatorCalls.length, 0);
  }
});

test("recovery-only resumes by the owned order id and ignores mutable checkout fields", async () => {
  const f = fixture();
  await f.post();
  const queriesBefore = f.db.queries.length;
  const response = await f.post(null, { orderId: checkoutOrderId("buyer", KEY), recoveryOnly: true, ageAttestation: false, couponCode: "expired", rail: "moncash" });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.checkoutState, "ready");
  assert.equal(body.redirectUrl, GATEWAY);
  assert.equal(f.operatorCalls.length, 1);
  assert.ok(f.db.queries.slice(queriesBefore).every(q => !stepForTest(q, "insert") && !stepForTest(q, "update") && !stepForTest(q, "delete")), "observation only");
  const missing = await f.post(OTHER_KEY, { recoveryOnly: true });
  assert.equal(missing.status, 404);
  assert.equal(f.orders.size, 1);
});

test("ambiguous persistence does not release stock or start a second operator session", async () => {
  const f = fixture({ physical: true, sessionCommittedError: true });
  assert.equal((await f.post()).status, 502);
  assert.deepEqual(f.stockCalls, ["zabelie_reserve_stock"]);
  const response = await f.post(KEY, { recoveryOnly: true });
  assert.equal((await response.json()).redirectUrl, GATEWAY);
  assert.equal(f.operatorCalls.length, 1);
  assert.deepEqual(f.stockCalls, ["zabelie_reserve_stock"]);
});

test("legacy physical sessions are withheld if their reservation is released, expired, absent or unreadable", async () => {
  for (const options of [{ stockStatus: "released" }, { expiredStock: true }, { noStock: true }, { stockReadError: true }]) {
    const f = fixture({ physical: true, ...options });
    await f.post();
    for (const extra of [{}, { recoveryOnly: true }]) {
      const response = await f.post(KEY, extra);
      assert.equal(response.status, options.stockReadError ? 503 : 200);
      const body = await response.json();
      assert.notEqual(body.redirectUrl, GATEWAY);
      if (!options.stockReadError) assert.equal(body.checkoutState, "review");
    }
    assert.equal(f.operatorCalls.length, 1);
    assert.deepEqual(f.stockCalls, ["zabelie_reserve_stock"], "readiness check never silently reacquires another unit");
  }
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


test("legal receipts are required for a new purchase, never for owned recoveryOnly observation", async () => {
  const f = fixture({ paid: true });
  assert.equal((await f.post()).status, 200);
  assert.deepEqual(f.accountChecks[0], { id: "buyer", legalAcceptance: true });
  const before = f.operatorCalls.length;
  f.accountChecks.length = 0;
  const response = await f.post(KEY, { recoveryOnly: true });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checkoutState, "complete");
  assert.deepEqual(f.accountChecks, [{ id: "buyer", legalAcceptance: false }]);
  assert.equal(f.operatorCalls.length, before, "observing an old payment cannot start a new payment");
});
