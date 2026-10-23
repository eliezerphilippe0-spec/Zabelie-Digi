import test from "node:test";
import assert from "node:assert/strict";
import { database, loadRoute, type Query } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { KIND_PHYSICAL } from "../lib/product-kind";
import { POLICY_VERSION } from "../lib/policy";

const ACTOR = "11300000-0000-4000-8000-000000000001";
const OTHER = "11300000-0000-4000-8000-000000000002";
const PRODUCT = "11300000-0000-4000-8000-000000000010";
const CATEGORY = "11300000-0000-4000-8000-000000000020";
const MODEL = "11300000-0000-4000-8000-000000000030";
const BODY = { title: "Pièce de rechange", priceHTG: 1500, quantity: 3, categorySlug: "pieces", policyAccepted: true };
type Options = {
  authenticated?: boolean; actorId?: string;
  accountRefusal?: { status: number; code: string };
  rate?: boolean; policyError?: boolean; category?: boolean; modelCount?: number;
  fitmentError?: string; deleteError?: boolean; physicalError?: boolean;
};
const argument = (query: Query, method: string) => query.steps.find(([name]) => name === method)?.[1][0];
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function fixture(options: Options = {}) {
  const events: string[] = [];
  const accounts: { id: string; options: unknown }[] = [];
  const policyCalls: Record<string, unknown>[] = [];
  const products = new Map<string, unknown>();
  const db = database(query => {
    const insert = argument(query, "insert");
    if (insert !== undefined) {
      events.push("insert:" + query.table);
      if (query.table === "products") {
        products.set(PRODUCT, plain(insert));
        return { data: { id: PRODUCT, slug: "piece-de-rechange-1234" }, error: null };
      }
      if (query.table === "zabelie_physical_products" && options.physicalError) return { data: null, error: { code: "08006" } };
      if (query.table === "zabelie_product_variants") return { data: (insert as unknown[]).map((_, position) => ({ id: position === 0 ? "variant-created" : `variant-created-${position}`, position })), error: null };
      if (query.table === "zabelie_product_fitment" && options.fitmentError) return { data: null, error: { code: options.fitmentError } };
      return { data: null, error: null };
    }
    if (query.steps.some(([method]) => method === "delete")) {
      events.push("delete:" + query.table);
      if (options.deleteError) return { data: null, error: { code: "08006" } };
      products.delete(PRODUCT);
      return { data: null, error: null };
    }
    events.push("read:" + query.table);
    if (query.table === "zabelie_categories") return { data: options.category === false ? null : { id: CATEGORY, level: 2, active: true, label_fr: "Pièces", parent_id: null }, error: null };
    if (query.table === "zabelie_vehicle_models") return { data: null, count: options.modelCount ?? 1, error: null };
    throw new Error("Unexpected query: " + query.table);
  });
  const admin = { ...db, rpc: async (name: string, args: Record<string, unknown>) => {
    events.push("rpc:" + name);policyCalls.push(plain(args));
    return { data: null, error: options.policyError ? { code: "08006" } : null };
  } };
  const api = loadRoute("app/api/products/physical/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      events.push("auth");return { data: { user: options.authenticated === false ? null : { id: options.actorId ?? ACTOR } } };
    } } }) },
    "@/lib/auth": { requireActiveAccount: async (id: string, checks: unknown) => {
      events.push("account");accounts.push({ id, options: plain(checks) });
      return options.accountRefusal ? Response.json({ code: options.accountRefusal.code }, { status: options.accountRefusal.status }) : null;
    } },
    "@/lib/supabase/admin": { createAdminClient: () => { events.push("admin");return admin; } },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => { events.push("rate");return options.rate !== false; } },
    "@/lib/payment-utils": { slugify: () => "piece-de-rechange" },
    "@/lib/product-kind": { KIND_PHYSICAL },
    "@/lib/policy": { POLICY_VERSION },
    "@/lib/pg-errors": { isMissingFunction: () => false },
    "@/lib/products-physical": { specsEtenduesDisponibles: async () => true },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: (error: string, status: number) => Response.json({ error }, { status }) },
  }, {}, { console: { ...console, error() {} } });
  const sendRaw = (body: string) => api.POST(new Request("https://example.test/api/products/physical", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
  return { events, accounts, policyCalls, products, queries: db.queries, sendRaw, send: (body: unknown = BODY) => sendRaw(JSON.stringify(body)) };
}

test("physical creation refuses an old form account before every creation effect", async () => {
  const f = fixture({ actorId: OTHER });
  assert.equal((await f.send({ ...BODY, expectedActorId: ACTOR })).status, 403);
  assert.deepEqual(f.events, ["auth", "account"]);
  assert.deepEqual(f.accounts, [{ id: OTHER, options: { legalAcceptance: true } }]);
  assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
});

test("matching and omitted identities preserve session ownership, amounts and creation order", async () => {
  for (const identity of [{ expectedActorId: OTHER }, {}]) {
    const f = fixture({ actorId: OTHER });
    const response = await f.send({ ...BODY, ...identity, actorId: ACTOR, seller_id: ACTOR });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, productId: PRODUCT, slug: "piece-de-rechange-1234" });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock"]);
    assert.deepEqual(f.policyCalls, [{ p_user_id: OTHER, p_version: POLICY_VERSION }]);
    const product = f.products.get(PRODUCT) as Record<string, unknown>;
    assert.equal(product.seller_id, OTHER);assert.equal(product.price_htg, 1500);
    assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);
    assert.equal(product.category_id, CATEGORY);
    const variants = plain(argument(f.queries.find(q => q.table === "zabelie_product_variants")!, "insert")) as Record<string, unknown>[];
    const stock = plain(argument(f.queries.find(q => q.table === "zabelie_stock")!, "insert"));
    assert.equal(variants[0].price_htg, 1500);
    assert.deepEqual(stock, [{ variant_id: "variant-created", quantity_available: 3 }]);
  }
});

test("malformed optional physical form identities fail before creation effects", async () => {
  for (const expectedActorId of ["", "not-a-uuid", null, false, 12, [], {}]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, expectedActorId })).status, 400);
    assert.deepEqual(f.events, ["auth", "account"]);assert.equal(f.queries.length, 0);
  }
});

test("physical authentication remains prior to JSON, identity and account checks", async () => {
  for (const body of ["{", JSON.stringify({ ...BODY, expectedActorId: OTHER })]) {
    const f = fixture({ authenticated: false });
    assert.equal((await f.sendRaw(body)).status, 401);
    assert.deepEqual(f.events, ["auth"]);assert.equal(f.queries.length, 0);
  }
});

test("suspension, legal acceptance and account outage remain prior to parsing and identity", async () => {
  for (const refusal of [{ status: 403, code: "suspended" }, { status: 403, code: "legal_acceptance_required" }, { status: 503, code: "account_status_unavailable" }]) {
    for (const body of ["{", JSON.stringify({ ...BODY, expectedActorId: OTHER })]) {
      const f = fixture({ accountRefusal: refusal });
      const response = await f.sendRaw(body);
      assert.equal(response.status, refusal.status);assert.deepEqual(await response.json(), { code: refusal.code });
      assert.deepEqual(f.events, ["auth", "account"]);assert.equal(f.queries.length, 0);
    }
  }
});

test("invalid JSON and non-object physical bodies cannot reach creation effects", async () => {
  for (const body of ["{", "null", "[]", "false", "17", '"text"']) {
    const f = fixture();assert.equal((await f.sendRaw(body)).status, 400);
    assert.deepEqual(f.events, ["auth", "account"]);assert.equal(f.queries.length, 0);
  }
});

test("a matching identity cannot bypass cadence or attestation failure", async () => {
  const limited = fixture({ rate: false });
  assert.equal((await limited.send({ ...BODY, expectedActorId: ACTOR })).status, 429);
  assert.deepEqual(limited.events, ["auth", "account", "admin", "rate"]);
  const refused = fixture({ policyError: true });
  assert.equal((await refused.send({ ...BODY, expectedActorId: ACTOR })).status, 503);
  assert.equal(refused.queries.length, 0);assert.equal(refused.products.size, 0);
});

test("physical validation can return 422 before any product INSERT", async () => {
  for (const [options, body] of [
    [{ category: false }, BODY],
    [{}, { ...BODY, weightGrams: 0 }],
    [{}, { ...BODY, widthMm: 10001 }],
    [{}, { ...BODY, variants: [{ label: "Petit", priceHTG: 0, quantity: 1 }] }],
    [{ modelCount: 0 }, { ...BODY, fitment: [{ modelId: MODEL, yearStart: 2000 }] }],
  ] as [Options, unknown][]) {
    const f = fixture(options);assert.equal((await f.send(body)).status, 422);
    assert.equal(f.products.size, 0);assert.equal(f.events.some(event => event.startsWith("insert:")), false);
  }
});

test("a late fitment 422 can leave a created product when best-effort compensation fails", async () => {
  const f = fixture({ fitmentError: "23505", deleteError: true });
  const fitment = [{ modelId: MODEL, yearStart: 2000 }, { modelId: MODEL, yearStart: 2000 }];
  const response = await f.send({ ...BODY, expectedActorId: ACTOR, fitment });
  assert.equal(response.status, 422);
  assert.match((await response.json()).error, /compatibilité identiques/);
  assert.deepEqual(f.events.slice(-6), ["insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock", "insert:zabelie_product_fitment", "delete:products"]);
  assert.equal((argument(f.queries.find(query => query.table === "zabelie_product_fitment")!, "insert") as unknown[]).length, 2);
  assert.equal(f.products.size, 1, "422 alone cannot authorize an automatic retry: the product may still exist");
});

test("the existing cascade compensation still removes the product after an extension failure", async () => {
  const f = fixture({ physicalError: true });
  assert.equal((await f.send({ ...BODY, expectedActorId: ACTOR })).status, 500);
  assert.deepEqual(f.events.slice(-3), ["insert:products", "insert:zabelie_physical_products", "delete:products"]);
  assert.equal(f.products.size, 0);
});

test("physical product prices reject coercible JSON types before attestation or product writes", async () => {
  for (const priceHTG of [true, [1], [[1]], "1", "1500", "1e3", "0x10"]) {
    const f = fixture();
    const response = await f.send({ ...BODY, priceHTG });
    assert.equal(response.status, 400, JSON.stringify(priceHTG));
    assert.deepEqual(await response.json(), { error: "Prix entier en gourdes requis (≥ 1 HTG)." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate"]);
    assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
  }
});

test("physical product prices preserve existing missing, empty, zero, negative and fractional refusals", async () => {
  for (const priceHTG of [undefined, null, false, [], "", " ", {}, 0, -1, 1.5]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, priceHTG })).status, 400);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate"]);
    assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
  }
});

test("physical integer prices preserve product, default variant and stock values", async () => {
  for (const priceHTG of [1, 1500, 2147483647]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, priceHTG })).status, 200);
    const product = f.products.get(PRODUCT) as Record<string, unknown>;
    assert.equal(product.price_htg, priceHTG);assert.equal(product.seller_id, ACTOR);
    assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);
    assert.equal(product.category_id, CATEGORY);
    const variants = plain(argument(f.queries.find(q => q.table === "zabelie_product_variants")!, "insert")) as Record<string, unknown>[];
    assert.equal(variants.length, 1);assert.equal(variants[0].price_htg, priceHTG);
    assert.deepEqual(variants[0].options, {});
    assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_stock")!, "insert")), [{ variant_id: "variant-created", quantity_available: BODY.quantity }]);
    assert.equal(f.policyCalls.length, 1);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock"]);
  }
});

test("physical variant prices reject coercible JSON types before any product writes", async () => {
  for (const priceHTG of [true, [1], [[1]], "1", "1500", "1e3", "0x10"]) {
    const f = fixture();
    const response = await f.send({ ...BODY, variants: [{ label: "Petit", priceHTG, quantity: 2 }] });
    assert.equal(response.status, 422, JSON.stringify(priceHTG));
    assert.deepEqual(await response.json(), { error: "Variante « Petit » : prix entier ≥ 1 HTG requis." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(f.queries.map(q => q.table), ["zabelie_categories"]);
    assert.equal(f.policyCalls.length, 1);assert.equal(f.products.size, 0);
  }
});

test("an invalid later physical variant cannot leave partially created rows", async () => {
  const f = fixture();
  assert.equal((await f.send({ ...BODY, variants: [{ label: "Petit", priceHTG: 1500, quantity: 2 }, { label: "Grand", priceHTG: true, quantity: 3 }] })).status, 422);
  assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
  assert.deepEqual(f.queries.map(q => q.table), ["zabelie_categories"]);
  assert.equal(f.policyCalls.length, 1);assert.equal(f.products.size, 0);
});

test("physical variant prices preserve existing missing, empty, zero, negative and fractional refusals", async () => {
  for (const priceHTG of [undefined, null, false, [], "", " ", {}, 0, -1, 1.5]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, variants: [{ label: "Petit", priceHTG, quantity: 2 }] })).status, 422);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(f.queries.map(q => q.table), ["zabelie_categories"]);
    assert.equal(f.policyCalls.length, 1);assert.equal(f.products.size, 0);
  }
});

test("physical integer variant prices preserve every price, position and stock quantity", async () => {
  const variantsIn = [{ label: "Petit", priceHTG: 1, quantity: 0 }, { label: "Moyen", priceHTG: 1500, quantity: 3 }, { label: "Grand", priceHTG: 2147483647, quantity: 100000 }];
  const f = fixture();
  assert.equal((await f.send({ ...BODY, variants: variantsIn })).status, 200);
  const product = f.products.get(PRODUCT) as Record<string, unknown>;
  assert.equal(product.price_htg, BODY.priceHTG);assert.equal(product.seller_id, ACTOR);assert.equal(product.status, "draft");
  const variants = plain(argument(f.queries.find(q => q.table === "zabelie_product_variants")!, "insert")) as Record<string, unknown>[];
  assert.deepEqual(variants, variantsIn.map((v, position) => ({ product_id: PRODUCT, sku: "Z-11300000-" + (position + 1), options: { variante: v.label }, price_htg: v.priceHTG, position })));
  assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_stock")!, "insert")), variantsIn.map((v, position) => ({ variant_id: position === 0 ? "variant-created" : `variant-created-${position}`, quantity_available: v.quantity })));
  assert.equal(f.policyCalls.length, 1);
});

test("authentication, account, form identity and cadence remain prior to invalid physical prices", async () => {
  const anonymous = fixture({ authenticated: false });
  assert.equal((await anonymous.send({ ...BODY, priceHTG: true })).status, 401);assert.deepEqual(anonymous.events, ["auth"]);
  const account = fixture({ accountRefusal: { status: 403, code: "suspended" } });
  assert.equal((await account.send({ ...BODY, priceHTG: true })).status, 403);assert.deepEqual(account.events, ["auth", "account"]);
  const identity = fixture({ actorId: OTHER });
  assert.equal((await identity.send({ ...BODY, priceHTG: true, expectedActorId: ACTOR })).status, 403);assert.deepEqual(identity.events, ["auth", "account"]);
  const limited = fixture({ rate: false });
  assert.equal((await limited.send({ ...BODY, priceHTG: true })).status, 429);assert.deepEqual(limited.events, ["auth", "account", "admin", "rate"]);
  for (const f of [anonymous, account, identity, limited]) { assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0); }
});

test("physical product quantities reject non-number JSON before attestation or product writes", async () => {
  for (const quantity of [true, false, null, undefined, "", " ", "0", "1", "100000", "1e3", "0x10", [], [0], [1], [[1]], {}]) {
    const f = fixture();
    const response = await f.send({ ...BODY, quantity });
    assert.equal(response.status, 400, JSON.stringify({ quantity, stocks: f.queries.filter(q => q.table === "zabelie_stock").map(q => argument(q, "insert")) }));
    assert.deepEqual(await response.json(), { error: "Quantité en stock requise (0 à 100 000)." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate"]);
    assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
  }
});

test("physical product quantities preserve negative, fractional and above-limit refusals", async () => {
  for (const quantity of [-1, 0.5, 100001, Number.MAX_SAFE_INTEGER]) {
    const f = fixture();
    const response = await f.send({ ...BODY, quantity });
    assert.equal(response.status, 400, String(quantity));
    assert.deepEqual(await response.json(), { error: "Quantité en stock requise (0 à 100 000)." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate"]);
    assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
  }
});

test("physical numeric stock boundaries preserve the default variant and draft product", async () => {
  for (const quantity of [0, 1, 100000]) {
    const f = fixture();
    const response = await f.send({ ...BODY, quantity });
    assert.equal(response.status, 200, String(quantity));
    assert.deepEqual(await response.json(), { ok: true, productId: PRODUCT, slug: "piece-de-rechange-1234" });
    const product = f.products.get(PRODUCT) as Record<string, unknown>;
    assert.equal(product.seller_id, ACTOR);assert.equal(product.price_htg, BODY.priceHTG);
    assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);assert.equal(product.category_id, CATEGORY);
    assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_product_variants")!, "insert")), [
      { product_id: PRODUCT, sku: "Z-11300000", options: {}, price_htg: BODY.priceHTG, position: 0 },
    ]);
    assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_stock")!, "insert")), [
      { variant_id: "variant-created", quantity_available: quantity },
    ]);
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock"]);
  }
});

test("a non-number quantity in a later physical variant cannot leave any created row", async () => {
  for (const quantity of [true, false, null, undefined, "", " ", "0", "1", "100000", "1e3", "0x10", [], [0], [1], [[1]], {}]) {
    const f = fixture();
    const response = await f.send({ ...BODY, variants: [
      { label: "Petit", priceHTG: 1, quantity: 2 },
      { label: "Grand", priceHTG: 1500, quantity },
    ] });
    assert.equal(response.status, 422, JSON.stringify({ quantity, stocks: f.queries.filter(q => q.table === "zabelie_stock").map(q => argument(q, "insert")) }));
    assert.deepEqual(await response.json(), { error: "Variante « Grand » : quantité invalide." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(f.queries.map(q => q.table), ["zabelie_categories"]);
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);assert.equal(f.products.size, 0);
  }
});

test("physical variant quantities preserve negative, fractional and above-limit refusals", async () => {
  for (const quantity of [-1, 0.5, 100001, Number.MAX_SAFE_INTEGER]) {
    const f = fixture();
    const response = await f.send({ ...BODY, variants: [{ label: "Petit", priceHTG: 1500, quantity }] });
    assert.equal(response.status, 422, String(quantity));
    assert.deepEqual(await response.json(), { error: "Variante « Petit » : quantité invalide." });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(f.queries.map(q => q.table), ["zabelie_categories"]);
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);assert.equal(f.products.size, 0);
  }
});

test("physical numeric variant quantities keep every stock ID, price, option and position", async () => {
  const variantsIn = [
    { label: "Petit", priceHTG: 1, quantity: 100000 },
    { label: "Moyen", priceHTG: 1500, quantity: 0 },
    { label: "Grand", priceHTG: 2147483647, quantity: 1 },
  ];
  for (const quantity of [0, 1, 100000]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, quantity, variants: variantsIn })).status, 200);
    const product = f.products.get(PRODUCT) as Record<string, unknown>;
    assert.equal(product.seller_id, ACTOR);assert.equal(product.price_htg, BODY.priceHTG);
    assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);assert.equal(product.category_id, CATEGORY);
    assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_product_variants")!, "insert")),
      variantsIn.map((variant, position) => ({
        product_id: PRODUCT, sku: "Z-11300000-" + (position + 1), options: { variante: variant.label },
        price_htg: variant.priceHTG, position,
      })));
    assert.deepEqual(plain(argument(f.queries.find(q => q.table === "zabelie_stock")!, "insert")),
      variantsIn.map((variant, position) => ({
        variant_id: position === 0 ? "variant-created" : `variant-created-${position}`, quantity_available: variant.quantity,
      })));
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock"]);
  }
});

test("physical quantity refusals preserve authentication, cadence, attestation and category order", async () => {
  const invalidVariant = { ...BODY, variants: [{ label: "Petit", priceHTG: 1500, quantity: true }] };
  for (const body of [{ ...BODY, quantity: true }, invalidVariant]) {
    const anonymous = fixture({ authenticated: false });
    assert.equal((await anonymous.send(body)).status, 401);assert.deepEqual(anonymous.events, ["auth"]);
    const account = fixture({ accountRefusal: { status: 403, code: "suspended" } });
    assert.equal((await account.send(body)).status, 403);assert.deepEqual(account.events, ["auth", "account"]);
    const identity = fixture({ actorId: OTHER });
    assert.equal((await identity.send({ ...body, expectedActorId: ACTOR })).status, 403);assert.deepEqual(identity.events, ["auth", "account"]);
    const limited = fixture({ rate: false });
    assert.equal((await limited.send(body)).status, 429);assert.deepEqual(limited.events, ["auth", "account", "admin", "rate"]);
    for (const f of [anonymous, account, identity, limited]) {
      assert.equal(f.queries.length, 0);assert.equal(f.policyCalls.length, 0);assert.equal(f.products.size, 0);
    }
  }
  const baseFirst = fixture();
  const invalidBase = await baseFirst.send({ ...BODY, quantity: true, policyAccepted: false });
  assert.equal(invalidBase.status, 400);
  assert.deepEqual(await invalidBase.json(), { error: "Quantité en stock requise (0 à 100 000)." });
  assert.deepEqual(baseFirst.events, ["auth", "account", "admin", "rate"]);assert.equal(baseFirst.queries.length, 0);
  const attestation = fixture();
  const missingPolicy = await attestation.send({ ...invalidVariant, policyAccepted: false });
  assert.equal(missingPolicy.status, 400);
  assert.deepEqual(await missingPolicy.json(), { error: "Vous devez accepter les règles de vente.", code: "policy_required" });
  assert.deepEqual(attestation.events, ["auth", "account", "admin", "rate"]);assert.equal(attestation.queries.length, 0);
  const outage = fixture({ policyError: true });
  const unavailable = await outage.send(invalidVariant);
  assert.equal(unavailable.status, 503);assert.equal((await unavailable.json()).code, "policy_unavailable");
  assert.deepEqual(outage.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance"]);assert.equal(outage.queries.length, 0);
  const category = fixture({ category: false });
  const unknownCategory = await category.send(invalidVariant);
  assert.equal(unknownCategory.status, 422);
  assert.deepEqual(await unknownCategory.json(), { error: "Catégorie inconnue ou non ouverte à la vente." });
  assert.deepEqual(category.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
  assert.deepEqual(category.queries.map(q => q.table), ["zabelie_categories"]);
  for (const f of [baseFirst, attestation, outage, category]) {
    assert.equal(f.products.size, 0);assert.equal(f.events.some(event => event.startsWith("insert:")), false);
  }
});

test("physical variant entries reject malformed JSON records before any product write", async () => {
  const valid = { label: "Petit", priceHTG: 1500, quantity: 2 };
  for (const entry of [null, {}, false, 0, 12, "texte", [], [{}]]) {
    for (const variants of [[entry], [valid, entry]]) {
      const f = fixture();
      const response = await f.send({ ...BODY, variants });
      assert.equal(response.status, 422, JSON.stringify({ variants }));
      assert.deepEqual(await response.json(), { error: "Chaque variante doit avoir un libellé." });
      assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
      assert.deepEqual(f.queries.map(query => query.table), ["zabelie_categories"]);
      assert.equal(f.queries.some(query => query.steps.some(([method]) => method === "insert" || method === "delete")), false);
      assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
      assert.equal(f.products.size, 0);
    }
  }
});

test("physical fitment entries reject malformed JSON records before model reads or product writes", async () => {
  const valid = { modelId: MODEL, yearStart: 2000 };
  for (const entry of [null, {}, false, 0, 12, "texte", [], [{}]]) {
    for (const fitment of [[entry], [valid, entry]]) {
      const f = fixture();
      const response = await f.send({ ...BODY, fitment });
      assert.equal(response.status, 422, JSON.stringify({ fitment }));
      assert.deepEqual(await response.json(), { error: "Compatibilité : modèle et année de début requis." });
      assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
      assert.deepEqual(f.queries.map(query => query.table), ["zabelie_categories"]);
      assert.equal(f.queries.some(query => query.steps.some(([method]) => method === "insert" || method === "delete")), false);
      assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
      assert.equal(f.products.size, 0);
    }
  }
});

test("physical list size limits remain prior to malformed entries", async () => {
  const variants = Array.from({ length: 20 }, () => ({ label: "Petit", priceHTG: 1500, quantity: 2 }));
  const fitment = Array.from({ length: 40 }, () => ({ modelId: MODEL, yearStart: 2000 }));
  for (const [body, error] of [
    [{ ...BODY, variants: [null, ...variants] }, "Maximum 20 variantes."],
    [{ ...BODY, variants: [...variants, null] }, "Maximum 20 variantes."],
    [{ ...BODY, fitment: [null, ...fitment] }, "Maximum 40 compatibilités."],
    [{ ...BODY, fitment: [...fitment, null] }, "Maximum 40 compatibilités."],
  ] as [unknown, string][]) {
    const f = fixture();
    const response = await f.send(body);
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(f.queries.map(query => query.table), ["zabelie_categories"]);
    assert.equal(f.queries.some(query => query.steps.some(([method]) => method === "insert" || method === "delete")), false);
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.equal(f.products.size, 0);
  }
});

test("physical malformed entries preserve authentication, account, identity and validation priority", async () => {
  for (const body of [{ ...BODY, variants: [null] }, { ...BODY, fitment: [null] }]) {
    const anonymous = fixture({ authenticated: false });
    const anonymousResponse = await anonymous.send(body);
    assert.equal(anonymousResponse.status, 401);
    assert.deepEqual(await anonymousResponse.json(), { error: "Authentification requise" });
    assert.deepEqual(anonymous.events, ["auth"]);
    assert.equal(anonymous.queries.length, 0);assert.equal(anonymous.policyCalls.length, 0);assert.equal(anonymous.products.size, 0);

    for (const refusal of [
      { status: 403, code: "suspended" },
      { status: 403, code: "legal_acceptance_required" },
      { status: 503, code: "account_status_unavailable" },
    ]) {
      const account = fixture({ accountRefusal: refusal });
      const response = await account.send(body);
      assert.equal(response.status, refusal.status);
      assert.deepEqual(await response.json(), { code: refusal.code });
      assert.deepEqual(account.events, ["auth", "account"]);
      assert.deepEqual(account.accounts, [{ id: ACTOR, options: { legalAcceptance: true } }]);
      assert.equal(account.queries.length, 0);assert.equal(account.policyCalls.length, 0);assert.equal(account.products.size, 0);
    }

    const identity = fixture({ actorId: OTHER });
    const identityResponse = await identity.send({ ...body, expectedActorId: ACTOR });
    assert.equal(identityResponse.status, 403);
    assert.deepEqual(await identityResponse.json(), { error: "api.auth.required" });
    assert.deepEqual(identity.events, ["auth", "account"]);
    assert.deepEqual(identity.accounts, [{ id: OTHER, options: { legalAcceptance: true } }]);
    assert.equal(identity.queries.length, 0);assert.equal(identity.policyCalls.length, 0);assert.equal(identity.products.size, 0);

    const limited = fixture({ rate: false });
    const limitedResponse = await limited.send(body);
    assert.equal(limitedResponse.status, 429);
    assert.deepEqual(await limitedResponse.json(), { error: "Trop de créations. Réessayez dans une minute." });
    assert.deepEqual(limited.events, ["auth", "account", "admin", "rate"]);
    assert.equal(limited.queries.length, 0);assert.equal(limited.policyCalls.length, 0);assert.equal(limited.products.size, 0);

    const attestation = fixture();
    const policyResponse = await attestation.send({ ...body, policyAccepted: false });
    assert.equal(policyResponse.status, 400);
    assert.deepEqual(await policyResponse.json(), { error: "Vous devez accepter les règles de vente.", code: "policy_required" });
    assert.deepEqual(attestation.events, ["auth", "account", "admin", "rate"]);
    assert.equal(attestation.queries.length, 0);assert.equal(attestation.policyCalls.length, 0);assert.equal(attestation.products.size, 0);

    const outage = fixture({ policyError: true });
    const outageResponse = await outage.send(body);
    assert.equal(outageResponse.status, 503);
    assert.deepEqual(await outageResponse.json(), {
      error: "La publication n'a pas abouti. Rien n'a été enregistré — réessayez dans un instant.",
      code: "policy_unavailable",
    });
    assert.deepEqual(outage.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance"]);
    assert.deepEqual(outage.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.equal(outage.queries.length, 0);assert.equal(outage.products.size, 0);

    const category = fixture({ category: false });
    const categoryResponse = await category.send(body);
    assert.equal(categoryResponse.status, 422);
    assert.deepEqual(await categoryResponse.json(), { error: "Catégorie inconnue ou non ouverte à la vente." });
    assert.deepEqual(category.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories"]);
    assert.deepEqual(category.queries.map(query => query.table), ["zabelie_categories"]);
    assert.equal(category.queries.some(query => query.steps.some(([method]) => method === "insert" || method === "delete")), false);
    assert.deepEqual(category.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.equal(category.products.size, 0);
  }
});

test("physical valid variant and fitment records preserve draft, IDs, prices, stocks and years", async () => {
  const otherModel = "11300000-0000-4000-8000-000000000031";
  const variants = [
    { label: "Petit", priceHTG: 1, quantity: 0 },
    { label: "Moyen", priceHTG: 1500, quantity: 3 },
    { label: "Grand", priceHTG: 2147483647, quantity: 100000 },
  ];
  const f = fixture({ modelCount: 2 });
  const response = await f.send({ ...BODY, expectedActorId: ACTOR, quantity: 0, variants, fitment: [
    { modelId: MODEL, yearStart: 2000 },
    { modelId: otherModel, yearStart: 2010, yearEnd: 2020 },
  ] });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, productId: PRODUCT, slug: "piece-de-rechange-1234" });
  assert.deepEqual([...f.products.keys()], [PRODUCT]);
  const product = f.products.get(PRODUCT) as Record<string, unknown>;
  assert.equal(product.seller_id, ACTOR);assert.equal(product.price_htg, BODY.priceHTG);assert.equal(product.title, BODY.title);
  assert.equal(product.description, null);assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);
  assert.equal(product.category_id, CATEGORY);assert.equal(product.category, "Pièces");
  assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_physical_products")!, "insert")), {
    product_id: PRODUCT, category_id: CATEGORY, weight_grams: 500, fragile: false,
  });
  assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_product_variants")!, "insert")),
    variants.map((variant, position) => ({ product_id: PRODUCT, sku: "Z-11300000-" + (position + 1),
      options: { variante: variant.label }, price_htg: variant.priceHTG, position })));
  assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_stock")!, "insert")),
    variants.map((variant, position) => ({ variant_id: position === 0 ? "variant-created" : `variant-created-${position}`,
      quantity_available: variant.quantity })));
  assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_product_fitment")!, "insert")), [
    { product_id: PRODUCT, vehicle_model_id: MODEL, year_start: 2000, year_end: null },
    { product_id: PRODUCT, vehicle_model_id: otherModel, year_start: 2010, year_end: 2020 },
  ]);
  assert.deepEqual(plain(f.queries.find(query => query.table === "zabelie_vehicle_models")!.steps), [
    ["select", ["id", { count: "exact", head: true }]],
    ["in", ["id", [MODEL, otherModel]]],
    ["eq", ["active", true]],
  ]);
  assert.deepEqual(f.queries.map(query => query.table), ["zabelie_categories", "zabelie_vehicle_models", "products", "zabelie_physical_products", "zabelie_product_variants", "zabelie_stock", "zabelie_product_fitment"]);
  assert.equal(f.queries.some(query => query.steps.some(([method]) => method === "delete")), false);
  assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
  assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "read:zabelie_vehicle_models", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock", "insert:zabelie_product_fitment"]);
});

test("physical omitted, empty and non-array optional lists preserve the default variant", async () => {
  for (const lists of [
    {}, { variants: [], fitment: [] },
    ...[null, {}, false, 0, 12, "texte"].map(value => ({ variants: value, fitment: value })),
  ]) {
    const f = fixture();
    const response = await f.send({ ...BODY, ...lists });
    assert.equal(response.status, 200, JSON.stringify(lists));
    assert.deepEqual(await response.json(), { ok: true, productId: PRODUCT, slug: "piece-de-rechange-1234" });
    assert.deepEqual([...f.products.keys()], [PRODUCT]);
    const product = f.products.get(PRODUCT) as Record<string, unknown>;
    assert.equal(product.seller_id, ACTOR);assert.equal(product.price_htg, BODY.priceHTG);
    assert.equal(product.status, "draft");assert.equal(product.kind, KIND_PHYSICAL);assert.equal(product.category_id, CATEGORY);
    assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_product_variants")!, "insert")), [
      { product_id: PRODUCT, sku: "Z-11300000", options: {}, price_htg: BODY.priceHTG, position: 0 },
    ]);
    assert.deepEqual(plain(argument(f.queries.find(query => query.table === "zabelie_stock")!, "insert")), [
      { variant_id: "variant-created", quantity_available: BODY.quantity },
    ]);
    assert.deepEqual(f.queries.map(query => query.table), ["zabelie_categories", "products", "zabelie_physical_products", "zabelie_product_variants", "zabelie_stock"]);
    assert.equal(f.queries.some(query => query.steps.some(([method]) => method === "delete")), false);
    assert.deepEqual(f.policyCalls, [{ p_user_id: ACTOR, p_version: POLICY_VERSION }]);
    assert.deepEqual(f.events, ["auth", "account", "admin", "rate", "rpc:zabelie_record_policy_acceptance", "read:zabelie_categories", "insert:products", "insert:zabelie_physical_products", "insert:zabelie_product_variants", "insert:zabelie_stock"]);
  }
});
