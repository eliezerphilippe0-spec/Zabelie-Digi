import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSuspension, AccountStatusUnavailable } from "../lib/account-suspension";
import { loadRoute, database } from "./helpers/route-harness";

test("account status: active, suspended, missing, read error and thrown network failure", async () => {
  const cases = [
    { data: { suspended_at: null, suspended_reason: null }, error: null },
    { data: { suspended_at: "2026-09-01", suspended_reason: "moderation" }, error: null },
    { data: null, error: null },
    { data: null, error: { message: "offline" } },
  ];
  assert.equal(await readSuspension(database(() => cases[0]) as unknown as SupabaseClient, "user"), null);
  assert.deepEqual(await readSuspension(database(() => cases[1]) as unknown as SupabaseClient, "user"),
    { suspendedAt: "2026-09-01", reason: "moderation" });
  for (const result of cases.slice(2)) {
    await assert.rejects(readSuspension(database(() => result) as unknown as SupabaseClient, "user"), AccountStatusUnavailable);
  }
  await assert.rejects(readSuspension(database(() => { throw new Error("offline"); }) as unknown as SupabaseClient, "user"), AccountStatusUnavailable);
});

test("API guard distinguishes suspension from unavailable status", async () => {
  for (const status of [200, 403, 503]) {
    const auth = loadRoute("lib/auth.ts", {
      "@/lib/account-suspension": { readSuspension: async () => {
        if (status === 503) throw new Error("offline");
        return status === 403 ? { suspendedAt: "now" } : null;
      } },
      "@/lib/supabase/admin": { createAdminClient: () => ({}) },
      "@/lib/api-erreur": { erreurTraduite: async (error: string, code: number, extra: object) =>
        Response.json({ error, ...extra }, { status: code }) },
    });
    const response = await auth.requireActiveAccount("user");
    assert.equal(response?.status ?? 200, status);
  }
});

test("checkout rejects suspended sellers and unavailable seller status before inserting an order", async () => {
  for (const status of [403, 503]) {
    const checked: string[] = [];
    const db = database(query => {
      assert.equal(query.table, "products");
      assert.ok(!query.steps.some(([step]) => step === "insert"));
      return { data: { id: "product", seller_id: "seller", kind: "service", price_htg: 100 }, error: null };
    });
    const route = loadRoute("app/api/checkout/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "buyer" } } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/auth": { requireActiveAccount: async (id: string) => {
        checked.push(id);
        return id === "seller" ? Response.json({ error: "unavailable" }, { status }) : null;
      } },
      "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    });
    const response = await route.POST(new Request("https://example.test/api/checkout", {
      method: "POST", body: JSON.stringify({ productId: "product" }),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(checked, ["buyer", "seller"]);
    assert.equal(db.queries.length, 1);
  }
});

function accountFixture(options: { count?: number | null; readError?: boolean; deleteError?: boolean; authError?: boolean; profileError?: boolean; pages?: number } = {}) {
  const actions: string[] = [];
  let profile: Record<string, unknown> = {};
  let metadata: Record<string, unknown> = {};
  const db = database(query => {
    const step = (name: string) => query.steps.find(([s]) => s === name)?.[1];
    if (query.table === "profiles") {
      actions.push("close-profile");
      profile = step("update")?.[0] as Record<string, unknown>;
      return { data: options.profileError ? null : { id: "user" }, error: null };
    }
    if (step("delete")) {
      actions.push("remove-" + query.table);
      return { error: null };
    }
    if (step("range")) {
      const offset = step("range")![0] as number;
      return { data: offset === 0 && options.pages ? Array.from({ length: 500 }, (_, i) => ({ id: "order-" + i })) : [{ id: "last" }], error: null };
    }
    return { count: options.count === undefined ? 1 : options.count, error: options.readError ? { message: "offline" } : null };
  });
  const route = loadRoute("app/api/account/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      getUser: async () => ({ data: { user: { id: "user", user_metadata: { full_name: "Private", avatar_url: "private.jpg" } } }, error: null }),
      signOut: async () => { actions.push("sign-out"); return { error: null }; },
    } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ ...db, auth: { admin: {
      deleteUser: async () => { actions.push("delete-auth"); return { error: options.deleteError ? {} : null }; },
      updateUserById: async (_id: string, patch: Record<string, unknown>) => {
        actions.push("scrub-auth"); metadata = patch;
        return { error: options.authError ? {} : null };
      },
    } } }) },
  });
  return { route, actions, db, profile: () => profile, metadata: () => metadata };
}

test("account closure clears storefront location, identity, metadata and all recipient pages", async () => {
  const f = accountFixture({ pages: 2 });
  const response = await f.route.DELETE();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "anonymized");
  for (const key of ["bio", "avatar_url", "country_code", "region_code", "zone_id", "pwen_repe", "boutik_slug"]) {
    assert.equal(f.profile()[key], null, key);
  }
  assert.ok(f.profile().suspended_at);
  assert.equal(f.profile().suspended_reason, "account_closed");
  assert.equal(JSON.stringify(f.metadata().user_metadata), JSON.stringify({ full_name: null, avatar_url: null }));
  assert.equal(f.metadata().ban_duration, "876000h");
  assert.equal(f.actions[0], "close-profile");
  assert.equal(f.actions.filter(a => a === "remove-zabelie_order_recipients").length, 2);
  assert.equal(f.actions.at(-1), "sign-out");
  assert.ok(!f.actions.includes("delete-auth"));
});

test("account without orders is deleted; Auth failure never triggers arbitrary anonymization", async () => {
  for (const deleteError of [false, true]) {
    const f = accountFixture({ count: 0, deleteError });
    const response = await f.route.DELETE();
    assert.equal(response.status, deleteError ? 503 : 200);
    assert.ok(!f.actions.includes("close-profile"));
    assert.equal(f.actions.includes("sign-out"), !deleteError);
  }
});

test("account closure reports database and Auth failures instead of claiming success", async () => {
  for (const options of [{ count: null }, { readError: true }, { profileError: true }, { authError: true }]) {
    const f = accountFixture(options);
    assert.equal((await f.route.DELETE()).status, 503);
    assert.ok(!f.actions.includes("sign-out"));
  }
});
