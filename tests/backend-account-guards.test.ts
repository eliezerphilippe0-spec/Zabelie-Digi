import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSuspension, AccountStatusUnavailable } from "../lib/account-suspension";
import { loadRoute, database } from "./helpers/route-harness";

function moderationFixture(options: { closed?: boolean; readError?: boolean; writeError?: string } = {}) {
  const effects: string[] = [];
  const db = database(q => {
    if (q.steps.some(([s]) => s === "update")) {
      effects.push("profile-update");
      return { error: options.writeError ? { code: options.writeError, message: "private database detail" } : null };
    }
    return { data: { id: "target", role: "creator", suspended_at: "2026-10-05", suspended_reason: options.closed ? "account_closed" : "moderation" }, error: options.readError ? { code: "offline" } : null };
  });
  const route = loadRoute("app/api/admin/user-status/route.ts", {
    "@/lib/auth": { getAdminUser: async () => ({ id: "admin", role: "admin" }) },
    "@/lib/api-erreur": { erreurTraduite: async (key: string, status: number) => Response.json({ error: key }, { status }) },
    "@/lib/admin-audit": { journaliserActeAdmin: async () => { effects.push("audit"); } },
    "@/lib/supabase/admin": { createAdminClient: () => Object.assign(db, { auth: { admin: { updateUserById: async () => { effects.push("auth-update"); return { error: null }; } } } }) },
  });
  return { effects, route, request: (action: string) => new Request("https://zabelie.com/api/admin/user-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: "target", action, reason: "review" }) }) };
}

test("moderation cannot reactivate or re-suspend a permanently closed account", async () => {
  for (const action of ["suspend", "reactivate"]) {
    const f = moderationFixture({ closed: true });
    const response = await f.route.POST(f.request(action));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "api.account.closed");
    assert.deepEqual(f.effects, []);
  }
});

test("moderation reactivation remains available for a reversible suspension", async () => {
  const f = moderationFixture();
  assert.equal((await f.route.POST(f.request("reactivate"))).status, 200);
  assert.deepEqual(f.effects, ["profile-update", "auth-update", "audit"]);
});

test("concurrent account closure prevents the Auth unban after the DB refusal", async () => {
  for (const action of ["suspend", "reactivate"]) {
    const f = moderationFixture({ writeError: "ZB131" });
    const response = await f.route.POST(f.request(action));
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error, "api.account.closed");
    assert.deepEqual(f.effects, ["profile-update"]);
  }
});

test("unavailable moderation state or failed write never changes Auth or leaks SQL", async () => {
  for (const options of [{ readError: true }, { writeError: "XX001" }]) {
    const f = moderationFixture(options);
    const response = await f.route.POST(f.request("reactivate"));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /private database detail/);
    assert.ok(!f.effects.includes("auth-update"));
  }
});

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
      "@/lib/panier-groupe-contexte": { contexteGroupe: () => null },
    });
    const response = await route.POST(new Request("https://example.test/api/checkout", {
      method: "POST", body: JSON.stringify({ productId: "product" }),
    }));
    assert.equal(response.status, status);
    assert.deepEqual(checked, ["buyer", "seller"]);
    assert.equal(db.queries.length, 1);
  }
});

function accountFixture(options: { count?: number | null; kyc?: number | null; acceptances?: number | null; acceptanceError?: boolean; kycError?: boolean; kycCloseError?: boolean; readError?: boolean; deleteError?: boolean; authError?: boolean; profileError?: boolean; pages?: number } = {}) {
  const actions: string[] = [];
  let profile: Record<string, unknown> = {};
  let metadata: Record<string, unknown> = {};
  const kycClosures: { patch: Record<string, unknown>; filters: unknown[][] }[] = [];
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
    if (query.table === "zabelie_kyc_submissions" && step("update")) {
      actions.push("close-kyc");
      kycClosures.push({ patch: step("update")![0] as Record<string, unknown>, filters: query.steps.filter(([m]) => m === "eq").map(([, a]) => a as unknown[]) });
      return { error: options.kycCloseError ? { message: "offline" } : null };
    }
    if (query.table === "zabelie_kyc_documents") {
      return { count: options.kyc === undefined ? 0 : options.kyc, error: options.kycError ? { message: "offline" } : null };
    }
    if (query.table === "zabelie_policy_acceptances") {
      return { count: options.acceptances === undefined ? 0 : options.acceptances, error: options.acceptanceError ? { message: "offline" } : null };
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
  return { route, actions, db, profile: () => profile, metadata: () => metadata, kycClosures };
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

test("a never-sold account WITH immutable legal receipts closes without deleting its evidence", async () => {
  const f = accountFixture({ count: 0, acceptances: 2 });
  const response = await f.route.DELETE();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "anonymized");
  assert.ok(f.actions.includes("close-profile"));
  assert.ok(!f.actions.includes("delete-auth"));
  assert.ok(!f.actions.includes("remove-zabelie_policy_acceptances"));
  const query = f.db.queries.find(q => q.table === "zabelie_policy_acceptances");
  assert.ok(query?.steps.some(([s, a]) => s === "eq" && a[0] === "user_id" && a[1] === "user"));
});

test("a never-sold account WITH identity documents is anonymized, never deleted (no orphan KYC files)", async () => {
  // 2026-10-04 : supprimer le profil effaçait les lignes KYC en cascade mais
  // pas les fichiers du bucket privé. Les pièces restent suivies et la purge
  // planifiée (5 ans, 0126) les retire ; 0127 l'impose aussi en base.
  const f = accountFixture({ count: 0, kyc: 2 });
  const response = await f.route.DELETE();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, "anonymized");
  assert.ok(!f.actions.includes("delete-auth"), "un compte avec pièces d'identité ne doit jamais être supprimé");
  assert.ok(f.actions.includes("close-profile"));
  const sansPieces = accountFixture({ count: 0, kyc: 0 });
  assert.equal((await (await sansPieces.route.DELETE()).json()).mode, "deleted", "témoin : sans pièces, la suppression reste complète");
});

test("closing an account also closes a PENDING identity dossier independently of retention", async () => {
  const f = accountFixture({ count: 0, kyc: 1 });
  assert.equal((await f.route.DELETE()).status, 200);
  assert.equal(f.kycClosures.length, 1);
  const { patch, filters } = f.kycClosures[0];
  assert.equal(patch.status, "rejected");
  assert.ok(typeof patch.decided_at === "string" && !Number.isNaN(Date.parse(patch.decided_at as string)), "la décision administrative reste datée");
  assert.equal(patch.note_admin, "Compte fermé avant décision");
  assert.deepEqual(filters, [["user_id", "user"], ["status", "pending"]], "seul un dossier EN ATTENTE de CE compte est clos");
  assert.ok(f.actions.indexOf("close-kyc") > f.actions.indexOf("close-profile"));
  const echec = accountFixture({ count: 0, kyc: 1, kycCloseError: true });
  assert.equal((await echec.route.DELETE()).status, 503, "un échec de clôture du dossier n'est jamais annoncé comme un succès");
  assert.ok(!echec.actions.includes("sign-out"));
});

test("account closure reports database and Auth failures instead of claiming success", async () => {
  for (const options of [{ count: null }, { readError: true }, { kyc: null, count: 0 }, { kycError: true, count: 0 }, { acceptances: null, count: 0 }, { acceptanceError: true, count: 0 }, { profileError: true }, { authError: true }]) {
    const f = accountFixture(options);
    assert.equal((await f.route.DELETE()).status, 503);
    assert.ok(!f.actions.includes("sign-out"));
  }
});
