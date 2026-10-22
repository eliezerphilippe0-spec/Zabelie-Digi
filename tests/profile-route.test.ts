import test from "node:test";
import assert from "node:assert/strict";
import { database, loadRoute } from "./helpers/route-harness";
import { checkDisplayName } from "../lib/display-name";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";

const A = "11300000-0000-4000-8000-000000000001";
const B = "11300000-0000-4000-8000-000000000002";
const ZONE = "11300000-0000-4000-8000-000000000003";
const BODY = { display_name: "Boutik A", bio: "Présentation A", country_code: "HT", region_code: "HT-OU", pwen_repe: "Repère A" };
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type Options = {
  actor?: string | null;
  lang?: Lang;
  updateError?: string;
  slugThrows?: boolean;
};

/** Real route, display-name validation and UUID predicate. Only Auth, database
 * and slug I/O are substituted; the UPDATE really changes this local model. */
function fixture(options: Options = {}) {
  const events: string[] = [];
  const profiles = new Map<string, Record<string, unknown>>([
    [A, { display_name: "Nom A initial", bio: "Bio A initiale" }],
    [B, { display_name: "Nom B initial", bio: "Bio B initiale" }],
  ]);
  const initial = plain([...profiles]);
  const slugCalls: { id: string; name: string }[] = [];
  const db = database(query => {
    assert.equal(query.table, "profiles");
    const values = query.steps.find(([method]) => method === "update")?.[1][0];
    const target = query.steps.find(([method]) => method === "eq")?.[1];
    assert.equal(target?.[0], "id");
    assert.equal(typeof target?.[1], "string");
    events.push("update:" + target![1]);
    if (options.updateError) return { data: null, error: { message: options.updateError } };
    profiles.set(target![1] as string, { ...profiles.get(target![1] as string), ...plain(values as Record<string, unknown>) });
    return { data: null, error: null };
  });
  const route = loadRoute("app/api/profile/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ ...db, auth: { getUser: async () => {
      events.push("auth");
      return { data: { user: options.actor === null ? null : { id: options.actor ?? A } }, error: null };
    } } }) },
    "@/lib/display-name": { checkDisplayName },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number) => Response.json({ error: t(options.lang ?? "fr", key) }, { status }) },
    "@/lib/supabase/admin": { createAdminClient: () => { events.push("admin");return {}; } },
    "@/lib/boutik-slug-attribution": { attribuerSlug: async (_client: unknown, id: string, name: string) => {
      events.push("slug");slugCalls.push({ id, name });
      if (options.slugThrows) throw new Error("Synthetic slug unavailable");
    } },
  }, {}, { console: { ...console, log() {} } });
  const sendRaw = (body: string) => route.POST(new Request("https://example.test/api/profile", {
    method: "POST", headers: { "Content-Type": "application/json" }, body,
  }));
  return { events, profiles, initial, queries: db.queries, slugCalls, sendRaw, send: (body: unknown = BODY) => sendRaw(JSON.stringify(body)) };
}

function untouched(f: ReturnType<typeof fixture>) {
  assert.deepEqual(f.events, ["auth"]);
  assert.equal(f.queries.length, 0);
  assert.deepEqual(f.slugCalls, []);
  assert.deepEqual([...f.profiles], f.initial);
}

test("profile: stale form A cannot overwrite the verified account B", async () => {
  const f = fixture({ actor: B });
  const response = await f.send({ ...BODY, expectedActorId: A });
  assert.equal(response.status, 403);
  untouched(f);
});

test("profile: matching form writes only the session owner and preserves slug attribution", async () => {
  const f = fixture();
  const response = await f.send({ ...BODY, expectedActorId: A, id: B, userId: B });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(f.profiles.get(A)?.display_name, "Boutik A");
  assert.deepEqual(f.profiles.get(B), f.initial[1][1]);
  assert.deepEqual(f.slugCalls, [{ id: A, name: "Boutik A" }]);
  assert.deepEqual(f.events, ["auth", "update:" + A, "admin", "slug"]);
});

test("profile: legacy client without precondition still writes the current account B", async () => {
  const f = fixture({ actor: B });
  assert.equal((await f.send(BODY)).status, 200);
  assert.equal(f.profiles.get(B)?.display_name, "Boutik A");
  assert.deepEqual(f.profiles.get(A), f.initial[0][1]);
  assert.deepEqual(f.slugCalls, [{ id: B, name: "Boutik A" }]);
});

test("profile: malformed expected identities stop before every profile or slug effect", async () => {
  for (const expectedActorId of ["", "another-account", null, false, 12, [], {}, [A]]) {
    const f = fixture();
    assert.equal((await f.send({ ...BODY, expectedActorId })).status, 400, JSON.stringify(expectedActorId));
    untouched(f);
  }
});

test("profile: non-object JSON is refused without reading or mutating profiles", async () => {
  for (const body of [null, [], [BODY], 12, true, "profile"]) {
    const f = fixture();assert.equal((await f.send(body)).status, 400);untouched(f);
  }
});

test("profile: Auth remains first for malformed JSON and stale or invalid identities", async () => {
  for (const body of ["{", "null", JSON.stringify({ ...BODY, expectedActorId: B }), JSON.stringify({ ...BODY, expectedActorId: false })]) {
    const f = fixture({ actor: null });assert.equal((await f.sendRaw(body)).status, 401);untouched(f);
  }
});

test("profile: invalid JSON retains the existing 400 response without mutation", async () => {
  const f = fixture();const response = await f.sendRaw("{");
  assert.equal(response.status, 400);assert.deepEqual(await response.json(), { error: "JSON invalide" });untouched(f);
});

test("profile: reserved or absent names retain the existing validation and error code", async () => {
  for (const display_name of [undefined, "", "Zabelie"]) {
    const f = fixture();const response = await f.send({ ...BODY, expectedActorId: A, display_name });
    const verdict = checkDisplayName(display_name);assert.equal(verdict.ok, false);
    assert.equal(response.status, 400);assert.equal((await response.json()).code, verdict.ok ? "unexpected" : verdict.reason);untouched(f);
  }
});

test("profile: existing country, department, zone and landmark refusals stay before UPDATE", async () => {
  for (const invalid of [{ country_code: "Haiti" }, { region_code: "OUEST" }, { zone_id: "not-a-uuid" }, { pwen_repe: "x".repeat(201) }]) {
    const f = fixture();assert.equal((await f.send({ ...BODY, ...invalid, expectedActorId: A })).status, 400);untouched(f);
  }
});

test("profile: matching form preserves normalization and all existing UPDATE fields", async () => {
  const f = fixture();
  assert.equal((await f.send({ ...BODY, expectedActorId: A, display_name: "  Boutik A  ", bio: "  Bio  ", avatar_url: "  https://example.test/avatar.png  ", country_code: " ht ", region_code: " ht-ou ", zone_id: ` ${ZONE} `, pwen_repe: "  Repère  " })).status, 200);
  assert.deepEqual(f.profiles.get(A), { display_name: "Boutik A", bio: "Bio", avatar_url: "https://example.test/avatar.png", country_code: "HT", region_code: "HT-OU", zone_id: ZONE, pwen_repe: "Repère" });
  assert.deepEqual(f.slugCalls, [{ id: A, name: "Boutik A" }]);
});

test("profile: clearing optional values still sends zone null for the existing trigger", async () => {
  const f = fixture();assert.equal((await f.send({ display_name: "Boutik A", expectedActorId: A })).status, 200);
  assert.deepEqual(f.profiles.get(A), { display_name: "Boutik A", bio: null, avatar_url: null, country_code: null, region_code: null, zone_id: null, pwen_repe: null });
});

test("profile: a non-Haitian country still clears the department", async () => {
  const f = fixture();assert.equal((await f.send({ ...BODY, country_code: "US", expectedActorId: A })).status, 200);
  assert.equal(f.profiles.get(A)?.country_code, "US");assert.equal(f.profiles.get(A)?.region_code, null);
});

test("profile: ZB069 remains 400 and database failures remain 500 without slug effects", async () => {
  for (const [updateError, status] of [["ZB069: invalid zone", 400], ["Synthetic database unavailable", 500]] as const) {
    const f = fixture({ updateError });const response = await f.send({ ...BODY, expectedActorId: A });
    assert.equal(response.status, status);assert.equal((await response.json()).error, updateError);
    assert.deepEqual([...f.profiles], f.initial);assert.deepEqual(f.slugCalls, []);assert.deepEqual(f.events, ["auth", "update:" + A]);
  }
});

test("profile: slug failure remains best-effort after a successful profile write", async () => {
  const f = fixture({ slugThrows: true });assert.equal((await f.send({ ...BODY, expectedActorId: A })).status, 200);
  assert.equal(f.profiles.get(A)?.display_name, "Boutik A");assert.equal(f.slugCalls.length, 1);
});

test("profile: identity refusals reuse existing translations in every language", async () => {
  for (const lang of LANGS) {
    const mismatch = fixture({ actor: B, lang });const refused = await mismatch.send({ ...BODY, expectedActorId: A });
    assert.equal(refused.status, 403);assert.deepEqual(await refused.json(), { error: t(lang, "api.auth.required") });untouched(mismatch);
    const invalid = fixture({ lang });const malformed = await invalid.send({ ...BODY, expectedActorId: null });
    assert.equal(malformed.status, 400);assert.deepEqual(await malformed.json(), { error: t(lang, "api.params.invalid") });untouched(invalid);
  }
});
