import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readSuspension, AccountStatusUnavailable } from "../lib/account-suspension";
import { loadRoute, database } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type Lang } from "../lib/i18n";

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

const ACCOUNT_A = "11300000-0000-4000-8000-000000000001";
const ACCOUNT_B = "11300000-0000-4000-8000-000000000002";

function accountFixture(options: { count?: number | null; kyc?: number | null; acceptances?: number | null; acceptanceError?: boolean; kycError?: boolean; kycCloseError?: boolean; readError?: boolean; deleteError?: boolean; authError?: boolean; profileError?: boolean; pages?: number; actor?: string | null; identityError?: boolean; lang?: Lang } = {}) {
  const actor = options.actor === undefined ? ACCOUNT_A : options.actor;
  const actions: string[] = [];
  const events: string[] = [];
  const authCalls: { method: string; id: string; patch?: Record<string, unknown> }[] = [];
  const signOuts: { actor: string | null; options: unknown }[] = [];
  const recipientPages: string[][] = [];
  let adminCreations = 0;
  let profile: Record<string, unknown> = {};
  let metadata: Record<string, unknown> = {};
  const kycClosures: { patch: Record<string, unknown>; filters: unknown[][] }[] = [];
  const db = database(query => {
    events.push("query:" + query.table);
    const step = (name: string) => query.steps.find(([s]) => s === name)?.[1];
    if (query.table === "profiles") {
      actions.push("close-profile");
      profile = step("update")?.[0] as Record<string, unknown>;
      return { data: options.profileError ? null : { id: actor }, error: null };
    }
    if (step("delete")) {
      actions.push("remove-" + query.table);
      return { error: null };
    }
    if (step("range")) {
      const offset = step("range")![0] as number;
      const data = offset === 0 && options.pages ? Array.from({ length: 500 }, (_, i) => ({ id: "order-" + i })) : options.count === 0 ? [] : [{ id: "last" }];
      recipientPages.push(data.map(row => row.id));
      return { data, error: null };
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
    "@/lib/i18n-server": { getLang: async () => options.lang ?? "fr" },
    "@/lib/i18n": { t },
    "@/lib/collections": { UUID_RE },
    "@/lib/supabase/server": { createClient: async () => ({ auth: {
      getUser: async () => {
        events.push("auth");
        return { data: { user: actor === null ? null : { id: actor, user_metadata: { full_name: "Private", avatar_url: "private.jpg" } } }, error: options.identityError ? { message: "synthetic identity unavailable" } : null };
      },
      signOut: async (signOutOptions: unknown) => { actions.push("sign-out"); events.push("sign-out"); signOuts.push({ actor, options: signOutOptions }); return { error: null }; },
    } }) },
    "@/lib/supabase/admin": { createAdminClient: () => {
      adminCreations++;events.push("admin");
      return { ...db, auth: { admin: {
        deleteUser: async (id: string) => { actions.push("delete-auth"); authCalls.push({ method: "deleteUser", id }); return { error: options.deleteError ? {} : null }; },
        updateUserById: async (id: string, patch: Record<string, unknown>) => {
          actions.push("scrub-auth"); metadata = patch; authCalls.push({ method: "updateUserById", id, patch });
          return { error: options.authError ? {} : null };
        },
      } } };
    } },
  });
  const request = (body?: string) => new Request("https://example.test/api/account", { method: "DELETE", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body }) });
  const sendRaw = (body?: string) => route.DELETE(request(body));
  const matchingBody = () => JSON.stringify({ expectedActorId: actor });
  return { route: { ...route, DELETE: (req: Request = request(matchingBody())) => route.DELETE(req) }, sendRaw,
    send: (body?: unknown) => sendRaw(body === undefined ? matchingBody() : JSON.stringify(body)),
    actions, events, authCalls, signOuts, recipientPages, adminCreations: () => adminCreations,
    db, profile: () => profile, metadata: () => metadata, kycClosures };
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
  assert.ok(query?.steps.some(([s, a]) => s === "eq" && a[0] === "user_id" && a[1] === ACCOUNT_A));
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
  assert.deepEqual(filters, [["user_id", ACCOUNT_A], ["status", "pending"]], "seul un dossier EN ATTENTE de CE compte est clos");
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

function noAccountClosure(f: ReturnType<typeof accountFixture>) {
  assert.deepEqual(f.events, ["auth"]);
  assert.equal(f.adminCreations(), 0);assert.equal(f.db.queries.length, 0);
  assert.deepEqual(f.actions, []);assert.deepEqual(f.authCalls, []);assert.deepEqual(f.signOuts, []);
}

function closureEvidence(f: ReturnType<typeof accountFixture>) {
  return JSON.stringify({ adminCreations: f.adminCreations(), actions: f.actions,
    authCalls: f.authCalls.map(({ method, id }) => ({ method, id })), signOuts: f.signOuts,
    filters: f.db.queries.map(query => ({ table: query.table, filters: query.steps.filter(([method]) => method === "eq" || method === "in") })) });
}

function closureQueriesBelongTo(f: ReturnType<typeof accountFixture>, actor: string) {
  let recipientPage = 0;
  const recipientPages = f.recipientPages.filter(ids => ids.length > 0);
  for (const query of f.db.queries) {
    if (query.table === "zabelie_order_recipients") {
      const filter = query.steps.find(([method]) => method === "in")?.[1];
      assert.ok(filter, "recipient removal is bounded to the IDs read for this buyer");
      assert.equal(filter[0], "order_id");
      assert.deepEqual(JSON.parse(JSON.stringify(filter[1])), recipientPages[recipientPage++]);
      continue;
    }
    const column = query.table === "profiles" ? "id" : query.table === "orders"
      ? query.steps.some(([method, args]) => method === "eq" && args[0] === "products.seller_id") ? "products.seller_id" : "buyer_id"
      : "user_id";
    assert.ok(query.steps.some(([method, args]) => method === "eq" && args[0] === column && args[1] === actor), `${query.table} must stay scoped to ${actor}`);
  }
  assert.equal(recipientPage, recipientPages.length);
}

for (const mode of ["anonymized", "deleted"] as const) {
  test(`an old account screen cannot ${mode === "deleted" ? "delete" : "anonymize"} the newly authenticated account`, async () => {
    const f = accountFixture({ actor: ACCOUNT_B, count: 0, ...(mode === "anonymized" ? { acceptances: 2 } : {}) });
    const response = await f.send({ expectedActorId: ACCOUNT_A });
    assert.equal(response.status, 403, closureEvidence(f));
    assert.deepEqual(await response.json(), { error: t("fr", "api.auth.required") });
    noAccountClosure(f);
  });
}

test("matching account identities preserve both closure modes and ignore forged target accounts", async () => {
  for (const actor of [ACCOUNT_A, ACCOUNT_B]) {
    const other = actor === ACCOUNT_A ? ACCOUNT_B : ACCOUNT_A;
    for (const mode of ["anonymized", "deleted"] as const) {
      const f = accountFixture({ actor, ...(mode === "deleted" ? { count: 0 } : { count: 1, pages: 2 }) });
      const response = await f.send({ expectedActorId: actor, userId: other, id: other });
      assert.equal(response.status, 200);assert.deepEqual(await response.json(), { ok: true, mode });
      assert.equal(f.adminCreations(), 1);assert.deepEqual(f.events.slice(0, 2), ["auth", "admin"]);
      assert.deepEqual(f.authCalls.map(({ method, id }) => ({ method, id })), [{ method: mode === "deleted" ? "deleteUser" : "updateUserById", id: actor }]);
      assert.deepEqual(JSON.parse(JSON.stringify(f.signOuts)), [{ actor, options: { scope: "global" } }]);
      closureQueriesBelongTo(f, actor);
      if (mode === "anonymized") {
        assert.equal(f.profile().suspended_reason, "account_closed");
        assert.equal(f.metadata().email, `deleted+${actor}@deleted.invalid`);
        assert.equal(f.metadata().ban_duration, "876000h");
        assert.equal(f.actions.filter(action => action === "remove-zabelie_order_recipients").length, 2);
        assert.ok(!f.actions.includes("delete-auth"));
      } else {
        assert.deepEqual(f.actions, ["delete-auth", "sign-out"]);
        assert.equal(f.db.queries.length, 4);
      }
    }
  }
});

test("cached bodyless clients and objects without the required closure identity fail before every effect", async () => {
  for (const body of [undefined, "", "{}", JSON.stringify({ id: ACCOUNT_A, userId: ACCOUNT_A }), JSON.stringify({ actorId: ACCOUNT_A })]) {
    const f = accountFixture({ actor: ACCOUNT_B, count: 0 });
    assert.equal((await f.sendRaw(body)).status, 400, closureEvidence(f));
    noAccountClosure(f);
  }
});

test("malformed closure identities fail without creating the admin client or reading account data", async () => {
  for (const expectedActorId of [null, "", "not-an-id", 12, false, [], {}, [ACCOUNT_A], ` ${ACCOUNT_A} `]) {
    const f = accountFixture({ actor: ACCOUNT_A });
    assert.equal((await f.send({ expectedActorId })).status, 400, closureEvidence(f));
    noAccountClosure(f);
  }
});

test("nonempty invalid JSON and non-object closure bodies cannot have any account effect", async () => {
  for (const body of ["{", "null", "[]", "true", "17", '"texte"', '""']) {
    const f = accountFixture({ actor: ACCOUNT_A });
    assert.equal((await f.sendRaw(body)).status, 400, closureEvidence(f));
    noAccountClosure(f);
  }
});

test("missing or failed authentication remains prior to closure JSON and expected identity", async () => {
  for (const options of [{ actor: null }, { actor: ACCOUNT_B, identityError: true }]) {
    for (const body of [undefined, "", "{}", "{", "null", JSON.stringify({ expectedActorId: ACCOUNT_A })]) {
      const f = accountFixture(options);
      const response = await f.sendRaw(body);
      assert.equal(response.status, 401);assert.deepEqual(await response.json(), { error: t("fr", "api.auth.required") });
      noAccountClosure(f);
    }
  }
});

test("closure identity refusals and existing Auth and database errors use the four real translations", async () => {
  for (const lang of LANGS) {
    const anonymous = accountFixture({ actor: null, lang });
    const absent = await anonymous.sendRaw("{");
    assert.equal(absent.status, 401);assert.deepEqual(await absent.json(), { error: t(lang, "api.auth.required") });noAccountClosure(anonymous);
    const unavailable = accountFixture({ actor: ACCOUNT_A, lang, count: null });
    const failed = await unavailable.send({ expectedActorId: ACCOUNT_A });
    assert.equal(failed.status, 503);assert.deepEqual(await failed.json(), { error: t(lang, "api.unavailable") });
    assert.equal(unavailable.adminCreations(), 1);assert.deepEqual(unavailable.actions, []);assert.deepEqual(unavailable.authCalls, []);assert.deepEqual(unavailable.signOuts, []);
    closureQueriesBelongTo(unavailable, ACCOUNT_A);
    const mismatch = accountFixture({ actor: ACCOUNT_B, lang });
    const refused = await mismatch.send({ expectedActorId: ACCOUNT_A });
    assert.equal(refused.status, 403, closureEvidence(mismatch));assert.deepEqual(await refused.json(), { error: t(lang, "api.auth.required") });noAccountClosure(mismatch);
    const malformed = accountFixture({ actor: ACCOUNT_A, lang });
    const invalid = await malformed.send({ expectedActorId: false });
    assert.equal(invalid.status, 400);assert.deepEqual(await invalid.json(), { error: t(lang, "api.params.invalid") });noAccountClosure(malformed);
    const missing = accountFixture({ actor: ACCOUNT_A, lang });
    const bodyless = await missing.sendRaw();
    assert.equal(bodyless.status, 400);assert.deepEqual(await bodyless.json(), { error: t(lang, "api.params.invalid") });noAccountClosure(missing);
  }
});
