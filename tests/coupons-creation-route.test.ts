import test from "node:test";
import assert from "node:assert/strict";
import { database, loadRoute } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";
import { couponApplies, normalizeCouponCode, type CouponRow } from "../lib/zabelie-coupons";

const A = "11300000-0000-4000-8000-000000000051";
const B = "11300000-0000-4000-8000-000000000052";
const PRODUCT = "11300000-0000-4000-8000-000000000053";
const COUPON = "11300000-0000-4000-8000-000000000054";
type Options = { actor?: string | null; lang?: Lang; error?: string };

/** The actual handler and coupon helpers; only Auth/PostgREST I/O is replaced.
 * Real RLS is not exercised here; existing SQL tests cover consumption. */
function fixture(options: Options = {}) {
  const actor = options.actor === undefined ? A : options.actor;
  const events: string[] = [];
  const rows: Record<string, unknown>[] = [];
  const db = database(query => {
    const insert = query.steps.find(([name]) => name === "insert");
    if (options.error) return { data: null, error: { message: options.error } };
    if (insert) {
      const row: Record<string, unknown> = { id: COUPON, active: true, uses: 0, ...insert[1][0] as Record<string, unknown> };
      rows.push(JSON.parse(JSON.stringify(row)));
      return { data: { id: COUPON, code: row.code, percent: row.percent }, error: null };
    }
    return { data: [], error: null };
  });
  const route = loadRoute("app/api/coupons/route.ts", {
    "@/lib/supabase/server": { createClient: async () => {
      events.push("client");
      return { auth: { getUser: async () => {
        events.push("auth");
        return { data: { user: actor ? { id: actor } : null }, error: null };
      } }, from: (table: string) => { events.push("query"); return db.from(table); } };
    } },
    "@/lib/zabelie-coupons": { normalizeCouponCode },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number) =>
      Response.json({ error: t(options.lang ?? "fr", key) }, { status }) },
  });
  const sendRaw = (body: string, method = "POST") => route[method](new Request("https://example.test/api/coupons", {
    method, headers: { "Content-Type": "application/json" }, body,
  }));
  return { events, rows, get queries() { return JSON.parse(JSON.stringify(db.queries)); }, route, sendRaw,
    send: (body: unknown, method = "POST") => sendRaw(JSON.stringify(body), method) };
}
function untouched(f: ReturnType<typeof fixture>) {
  assert.deepEqual(f.events, ["client", "auth"]);
  assert.deepEqual(f.queries, []);
  assert.deepEqual(f.rows, []);
}

for (const lang of LANGS) {
  test(`coupons: stale A cannot create an active store-wide discount for session B (${lang})`, async () => {
    const f = fixture({ actor: B, lang });
    const response = await f.send({ expectedActorId: A, code: "PROMO50", percent: 50 });
    assert.equal(response.status, 403, JSON.stringify({ renderedActor: A, session: B, rows: f.rows }));
    assert.deepEqual(await response.json(), { error: t(lang, "api.auth.required") });
    untouched(f);
  });

  test(`coupons: missing or malformed form identity fails before PostgREST (${lang})`, async () => {
    for (const expectedActorId of [undefined, null, "", "invalid", 12, false, [], {}, [A], ` ${A} `]) {
      const f = fixture({ lang });
      const response = await f.send({ expectedActorId, code: "PROMO50", percent: 50 });
      assert.equal(response.status, 422, JSON.stringify({ expectedActorId, rows: f.rows }));
      assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });
      untouched(f);
    }
  });
}

test("coupons: matching A/A and B/B preserve normalization, boundaries and verified ownership", async () => {
  for (const actor of [A, B]) {
    for (const percent of [1, 10, 90, "25"]) {
      const f = fixture({ actor });
      const response = await f.send({ expectedActorId: actor, code: " promo-50 ", percent,
        seller_id: actor === A ? B : A, sellerId: actor === A ? B : A });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { ok: true, coupon: { id: COUPON, code: "PROMO-50", percent: Number(percent) } });
      assert.deepEqual(f.rows, [{ id: COUPON, active: true, uses: 0, seller_id: actor,
        code: "PROMO-50", percent: Number(percent), product_id: null, max_uses: null, expires_at: null }]);
      assert.deepEqual(f.queries, [{ table: "zabelie_coupons", steps: [
        ["insert", [{ seller_id: actor, code: "PROMO-50", percent: Number(percent), product_id: null, max_uses: null, expires_at: null }]],
        ["select", ["id, code, percent"]], ["single", []],
      ] }]);
      assert.deepEqual(f.events, ["client", "auth", "query"]);
    }
  }
});

test("coupons: anonymous operations still fail before reading the body or querying coupons", async () => {
  for (const method of ["POST", "GET", "PATCH"]) {
    const f = fixture({ actor: null });
    const response = await f.route[method]({ json() { throw new Error("Anonymous body read"); } });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentification requise" });
    untouched(f);
  }
});

test("coupons: invalid JSON and non-object bodies cannot create coupons", async () => {
  const malformed = fixture();
  assert.equal((await malformed.sendRaw("{")).status, 400);
  untouched(malformed);
  for (const body of [null, false, 50, "form", [], [{ expectedActorId: A, code: "PROMO50", percent: 50 }]]) {
    const f = fixture();
    assert.equal((await f.send(body)).status, 422, JSON.stringify(body));
    untouched(f);
  }
});

test("coupons: stale identity precedes code and percentage validation", async () => {
  const f = fixture({ actor: B });
  assert.equal((await f.send({ expectedActorId: A, code: 123, percent: 0 })).status, 403);
  untouched(f);
});

test("coupons: existing invalid code and percentage refusals retain their messages", async () => {
  for (const code of ["", "ab", "avec espace", "?PROMO", "A".repeat(25)]) {
    const f = fixture();
    const response = await f.send({ expectedActorId: A, code, percent: 50 });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "Code invalide : 3–24 caractères, lettres/chiffres/tirets." });
    untouched(f);
  }
  for (const percent of [undefined, null, 0, -1, 91, 1.5, "bad"]) {
    const f = fixture();
    const response = await f.send({ expectedActorId: A, code: "PROMO50", percent });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: "Remise entre 1 et 90 %." });
    untouched(f);
  }
});

test("coupons: optional product, usage limit and expiration are forwarded unchanged", async () => {
  const f = fixture();
  const response = await f.send({ expectedActorId: A, code: "LIMITED", percent: 20,
    productId: PRODUCT, maxUses: 3, expiresAt: "2030-01-01T00:00:00Z" });
  assert.equal(response.status, 200);
  assert.deepEqual(f.rows, [{ id: COUPON, active: true, uses: 0, seller_id: A, code: "LIMITED", percent: 20,
    product_id: PRODUCT, max_uses: 3, expires_at: "2030-01-01T00:00:00Z" }]);
});

test("coupons: real applicability keeps store-wide coupons inside the verified seller", async () => {
  const f = fixture({ actor: B });
  assert.equal((await f.send({ expectedActorId: B, code: "STORE50", percent: 50 })).status, 200);
  const coupon = f.rows[0] as unknown as CouponRow;
  assert.equal(couponApplies(coupon, PRODUCT, B), true);
  assert.equal(couponApplies(coupon, A, B), true);
  assert.equal(couponApplies(coupon, PRODUCT, A), false);
});

test("coupons: duplicate and database refusals keep existing responses without stored rows", async () => {
  for (const [error, message] of [["duplicate key value violates unique constraint", "Ce code existe déjà dans votre boutique."],
    ["Synthetic database refusal", "Synthetic database refusal"]]) {
    const f = fixture({ error });
    const response = await f.send({ expectedActorId: A, code: "PROMO50", percent: 50 });
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: message });
    assert.equal(f.queries.length, 1);
    assert.deepEqual(f.rows, []);
  }
});

test("coupons: GET and PATCH retain the authenticated client and existing query shape", async () => {
  const get = fixture();
  assert.deepEqual(await (await get.route.GET()).json(), { coupons: [] });
  assert.deepEqual(get.queries, [{ table: "zabelie_coupons", steps: [
    ["select", ["id, code, percent, product_id, max_uses, uses, expires_at, active, created_at"]],
    ["order", ["created_at", { ascending: false }]],
  ] }]);
  const patch = fixture();
  assert.deepEqual(await (await patch.send({ id: COUPON, active: false }, "PATCH")).json(), { ok: true });
  assert.deepEqual(patch.queries, [{ table: "zabelie_coupons", steps: [
    ["update", [{ active: false }]], ["eq", ["id", COUPON]],
  ] }]);
  assert.deepEqual(patch.rows, []);
});
