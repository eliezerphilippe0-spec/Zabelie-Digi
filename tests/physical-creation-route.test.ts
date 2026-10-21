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
      if (query.table === "zabelie_product_variants") return { data: [{ id: "variant-created", position: 0 }], error: null };
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
