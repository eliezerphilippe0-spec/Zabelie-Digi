import test from "node:test";
import assert from "node:assert/strict";
import { loadRoute } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { isMissingFunction } from "../lib/pg-errors";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";

const ACTOR = "11300000-0000-4000-8000-000000000001";
const PRODUCT = "11300000-0000-4000-8000-000000000010";
const VARIANT = "11300000-0000-4000-8000-000000000020";
const MAX_PRICE = 2147483647;
const BODY = { productId: PRODUCT, newPriceHTG: 1500 };
const METHODS = ["POST", "DELETE"] as const;
type Method = typeof METHODS[number];
type Options = {
  authenticated?: boolean;
  accountStatus?: number;
  initialPrice?: number;
  result?: unknown;
  rpcError?: { code: string };
  lang?: Lang;
};

/** Real handlers and predicates; only Auth/account/RPC I/O are doubled.
 * The SQL double models the owner, strict decrease and preserved old price
 * of 0075/0109, so accepting an invalid JSON amount exposes a price change. */
function fixture(options: Options = {}) {
  const events: string[] = [];
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const price = options.initialPrice ?? 2000;
  const state: { productPrice: number; variantPrice: number; compare: number | null; writes: number } = {
    productPrice: price, variantPrice: price, compare: price + 1000, writes: 0,
  };
  const route = loadRoute("app/api/products/discount/route.ts", {
    "@/lib/collections": { UUID_RE },
    "@/lib/pg-errors": { isMissingFunction },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number, extra?: Record<string, unknown>) =>
      Response.json({ error: t(options.lang ?? "fr", key), ...extra }, { status }) },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => {
      events.push("auth");
      return { data: { user: options.authenticated === false ? null : { id: ACTOR } }, error: null };
    } } }) },
    "@/lib/auth": { requireActiveAccount: async (id: string) => {
      events.push("account");
      assert.equal(id, ACTOR);
      return options.accountStatus ? Response.json({ code: "account_refused" }, { status: options.accountStatus }) : null;
    } },
    "@/lib/supabase/admin": { createAdminClient: () => {
      events.push("admin");
      return { rpc: async (name: string, params: Record<string, unknown>) => {
        events.push("rpc");
        calls.push({ name, params: structuredClone(params) });
        if (options.rpcError) return { data: null, error: options.rpcError };
        if (Object.hasOwn(options, "result")) return { data: options.result, error: null };
        if (typeof params.p_product_id !== "string" || !UUID_RE.test(params.p_product_id)) return { data: null, error: { code: "22P02" } };
        if (params.p_user_id !== ACTOR || params.p_product_id !== PRODUCT ||
            (params.p_variant_id !== undefined && params.p_variant_id !== VARIANT)) return { data: { ok: false, reason: "introuvable" }, error: null };
        if (name === "zabelie_clear_discount" || name === "zabelie_clear_variant_discount") {
          state.compare = null;
          state.writes++;
          return { data: { ok: true, prix_htg: state.variantPrice }, error: null };
        }
        assert.ok(name === "zabelie_set_discount" || name === "zabelie_set_variant_discount");
        const next = params.p_new_price_htg;
        if (typeof next !== "number" || !Number.isSafeInteger(next) || next <= 0 || next > MAX_PRICE) return { data: { ok: false, reason: "prix_invalide" }, error: null };
        if (next >= state.variantPrice) return { data: { ok: false, reason: "pas_une_baisse" }, error: null };
        const old = state.compare;
        state.productPrice = next;
        state.variantPrice = next;
        state.writes += 2;
        return { data: { ok: true, ancien_htg: old, nouveau_htg: next }, error: null };
      } };
    } },
  });
  return {
    events, calls, state,
    send: (method: Method, raw: string) => route[method](new Request("https://zabelie.test/api/products/discount", {
      method, headers: { "Content-Type": "application/json" }, body: raw,
    })),
  };
}

function untouched(f: ReturnType<typeof fixture>) {
  assert.deepEqual(f.events, ["auth", "account"]);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.state, { productPrice: 2000, variantPrice: 2000, compare: 3000, writes: 0 });
}

for (const [scope, variantId] of [["product", undefined], ["variant", VARIANT]] as const) {
  test(`discount ${scope}: numeric 1 HTG reaches the existing RPC with the session owner`, async () => {
    const f = fixture();
    const response = await f.send("POST", JSON.stringify({ ...BODY, variantId, newPriceHTG: 1, userId: "ignored-client-owner" }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, ancienHtg: 3000, nouveauHtg: 1 });
    assert.deepEqual(f.calls, [{ name: variantId ? "zabelie_set_variant_discount" : "zabelie_set_discount", params: {
      p_user_id: ACTOR, p_product_id: PRODUCT, ...(variantId ? { p_variant_id: variantId } : {}), p_new_price_htg: 1,
    } }]);
    assert.deepEqual(f.state, { productPrice: 1, variantPrice: 1, compare: 3000, writes: 2 });
    assert.deepEqual(f.events, ["auth", "account", "admin", "rpc"]);
  });

  test(`discount ${scope}: removing the crossed-out price preserves the current price`, async () => {
    const f = fixture();
    const response = await f.send("DELETE", JSON.stringify({ productId: PRODUCT, variantId }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, prixHtg: 2000 });
    assert.deepEqual(f.calls, [{ name: variantId ? "zabelie_clear_variant_discount" : "zabelie_clear_discount", params: {
      p_user_id: ACTOR, p_product_id: PRODUCT, ...(variantId ? { p_variant_id: variantId } : {}),
    } }]);
    assert.deepEqual(f.state, { productPrice: 2000, variantPrice: 2000, compare: null, writes: 1 });
  });
}

test("discount: the integer storage boundary is forwarded while SQL still decides whether it is a decrease", async () => {
  for (const variantId of [undefined, VARIANT]) {
    const f = fixture({ initialPrice: MAX_PRICE });
    const response = await f.send("POST", JSON.stringify({ ...BODY, variantId, newPriceHTG: MAX_PRICE }));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).code, "pas_une_baisse");
    assert.equal(f.calls[0].params.p_new_price_htg, MAX_PRICE);
    assert.equal(f.state.productPrice, MAX_PRICE);
    assert.equal(f.state.writes, 0);
    const lower = await f.send("POST", JSON.stringify({ ...BODY, variantId, newPriceHTG: MAX_PRICE - 1 }));
    assert.equal(lower.status, 200);
    assert.equal(f.state.productPrice, MAX_PRICE - 1);
  }
});

test("discount: non-number JSON amounts cannot overwrite either price", async () => {
  for (const newPriceHTG of [true, false, [1], [[1]], "1", "1500", null, {}, [], undefined]) {
    for (const variantId of [undefined, VARIANT]) {
      const f = fixture();
      const response = await f.send("POST", JSON.stringify({ ...BODY, variantId, newPriceHTG }));
      assert.equal(response.status, 400, JSON.stringify({ newPriceHTG, variantId }));
      assert.deepEqual(await response.json(), { error: "productId et nouveau prix (entier HTG) requis" });
      untouched(f);
    }
  }
});

test("discount: nonpositive, fractional, overflowing and unsafe numbers are rejected before admin access", async () => {
  for (const newPriceHTG of [0, -1, 1.5, MAX_PRICE + 1, Number.MAX_SAFE_INTEGER + 1]) {
    const f = fixture();
    assert.equal((await f.send("POST", JSON.stringify({ ...BODY, newPriceHTG }))).status, 400);
    untouched(f);
  }
  const f = fixture();
  assert.equal((await f.send("POST", `{"productId":"${PRODUCT}","newPriceHTG":1e309}`)).status, 400);
  untouched(f);
});

test("discount: null, primitives and arrays are rejected by both handlers without an exception or mutation", async () => {
  for (const body of [null, true, false, 42, "", "text", [], [BODY]]) {
    for (const method of METHODS) {
      const f = fixture();
      assert.equal((await f.send(method, JSON.stringify(body))).status, 400, `${method}: ${JSON.stringify(body)}`);
      untouched(f);
    }
  }
});

test("discount: malformed and empty JSON preserve both prices", async () => {
  for (const raw of ["", "{", '{"productId":']) {
    for (const method of METHODS) {
      const f = fixture();
      const response = await f.send(method, raw);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: "JSON invalide" });
      untouched(f);
    }
  }
});

test("discount: both handlers reject malformed product identifiers before creating an admin client", async () => {
  for (const productId of [undefined, null, true, 1, [], [PRODUCT], {}, "", "invalid", PRODUCT + "x"]) {
    for (const method of METHODS) {
      const f = fixture();
      assert.equal((await f.send(method, JSON.stringify({ ...BODY, productId }))).status, 400, `${method}: ${JSON.stringify(productId)}`);
      untouched(f);
    }
  }
});

test("discount: a supplied variant identifier must be a UUID in both handlers", async () => {
  for (const variantId of [null, true, 1, [], [VARIANT], {}, "", "invalid", VARIANT + "x"]) {
    for (const method of METHODS) {
      const f = fixture();
      assert.equal((await f.send(method, JSON.stringify({ ...BODY, variantId }))).status, 400);
      untouched(f);
    }
  }
});

test("discount: authentication refusal remains ahead of JSON parsing and account/admin access", async () => {
  for (const method of METHODS) {
    const f = fixture({ authenticated: false });
    const response = await f.send(method, "{");
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "Authentification requise" });
    assert.deepEqual(f.events, ["auth"]);
    assert.equal(f.calls.length, 0);
    assert.equal(f.state.writes, 0);
  }
});

test("discount: suspended or indeterminate accounts remain refused before JSON parsing", async () => {
  for (const accountStatus of [403, 503]) {
    for (const method of METHODS) {
      const f = fixture({ accountStatus });
      const response = await f.send(method, "{");
      assert.equal(response.status, accountStatus);
      assert.deepEqual(await response.json(), { code: "account_refused" });
      untouched(f);
    }
  }
});

test("discount: SQL ownership, price, multi-variant and fallback business refusals keep their existing contract", async () => {
  for (const [reason, error] of [
    ["introuvable", "Produit introuvable"],
    ["prix_invalide", "Prix invalide (entier positif en HTG)."],
    ["pas_une_baisse", "Un rabais baisse le prix : saisissez un prix inférieur au prix actuel."],
    ["variantes_multiples", "Choisissez la taille ou le modèle dont vous voulez réduire le prix."],
    ["unknown", "Rabais refusé."],
  ]) {
    const f = fixture({ result: { ok: false, reason } });
    const response = await f.send("POST", JSON.stringify(BODY));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error, code: reason });
    assert.equal(f.calls.length, 1);
    assert.equal(f.state.writes, 0);
  }
});

test("discount: the active flash refusal stays translated in all four languages", async () => {
  for (const lang of LANGS) {
    const f = fixture({ lang, result: { ok: false, reason: "flash_active" } });
    const response = await f.send("POST", JSON.stringify({ ...BODY, variantId: VARIANT }));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: t(lang, "sell.rabais.flashActive"), code: "flash_active" });
    assert.equal(f.state.writes, 0);
  }
});

test("discount: absent or refused SQL results cannot report success", async () => {
  for (const result of [null, undefined, { ok: false }]) {
    for (const method of METHODS) {
      const f = fixture({ result });
      const response = await f.send(method, JSON.stringify(BODY));
      assert.equal(response.status, method === "POST" ? 422 : 404);
      assert.deepEqual(await response.json(), { error: method === "POST" ? "Rabais refusé." : "Produit introuvable" });
      assert.equal(f.state.writes, 0);
    }
  }
});

test("discount: missing PostgreSQL and PostgREST functions retain the 503 fallback", async () => {
  for (const code of ["42883", "PGRST202"]) {
    for (const method of METHODS) {
      const f = fixture({ rpcError: { code } });
      const response = await f.send(method, JSON.stringify(BODY));
      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), { error: "Rabais momentanément indisponibles." });
      assert.equal(f.state.writes, 0);
    }
  }
});

test("discount: other SQL failures retain their existing 500 responses without reporting a price change", async () => {
  for (const method of METHODS) {
    const f = fixture({ rpcError: { code: "08006" } });
    const response = await f.send(method, JSON.stringify({ ...BODY, variantId: VARIANT }));
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: method === "POST" ? "Rabais impossible" : "Retrait impossible" });
    assert.equal(f.calls.length, 1);
    assert.equal(f.state.writes, 0);
  }
});
