import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slugifierZone } from "../lib/zones";
import { database, loadRoute } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";

/**
 * PR-Z4 — administration des zones et demandes modérées (`docs/33` §4).
 *
 * La PREUVE de comportement vit dans `supabase/tests/zone_requests.test.sql`
 * (R1→R5 : gardes ZB070, RLS, anti-doublon, décision unique). Ici : le
 * slugifieur pur, et les COMMANDES que ni tsc ni la suite SQL ne voient —
 * la vérif de la spec (« chaque mutation loguée dans zabelie_admin_actions »)
 * est un artefact adressé par chaîne, exactement la classe que les
 * croisements du dépôt existent pour attraper.
 */

test("slugifierZone — accents pliés, tirets, jamais de bord", () => {
  assert.equal(slugifierZone("Bò Lanmè"), "bo-lanme");
  assert.equal(slugifierZone("  Sitè 2  "), "site-2");
  assert.equal(slugifierZone("L'Estère"), "l-estere");
});

const ROUTE = readFileSync("app/api/admin/zones/route.ts", "utf8");
const REQ = readFileSync("app/api/zones/request/route.ts", "utf8");
const FORM = readFileSync("components/profile-form.tsx", "utf8");
const MIG = readFileSync("supabase/migrations/0070_zone_requests.sql", "utf8")
  .replace(/--[^\n]*/g, "");

test("la route admin est gardée par le rôle, PAR SA CONDITION", () => {
  assert.match(
    ROUTE,
    /if \(!me \|\| me\.role !== "admin"\)/,
    "le garde de rôle admin a disparu ou a changé de forme",
  );
});

test("CHAQUE acte admin est journalisé — la vérif de la spec, comptée", () => {
  /* Trois actes (create_zone, set_active, decide) → trois appels au journal.
   * Compter est la seule assertion honnête : une branche qui perd son appel
   * laisserait les deux autres faire illusion. */
  const appels = ROUTE.match(/await journaliserActeAdmin\(/g) ?? [];
  assert.equal(
    appels.length,
    3,
    `${appels.length} appel(s) à journaliserActeAdmin au lieu de 3 — un acte a perdu sa trace (0055)`,
  );
});

test("accepter = le katye naît AVANT la décision — jamais une acceptation sans zone", () => {
  const decide = ROUTE.slice(ROUTE.indexOf('body.action === "decide"'));
  const naissance = decide.indexOf('level: "katye"');
  const decision = decide.indexOf('status: decision === "accept"');
  assert.ok(naissance > -1 && decision > -1, "branches de décision introuvables");
  assert.ok(
    naissance < decision,
    "la demande est marquée acceptée avant que le katye existe",
  );
});

test("la route vendeur traduit les gardes de la base, sans les réimplémenter", () => {
  assert.match(REQ, /error\.code === "23505"[\s\S]{0,120}status: 409/, "doublon → 409 absent");
  assert.match(REQ, /ZB070[\s\S]{0,120}status: 400/, "refus ZB070 → 400 absent");
});

test("le formulaire vendeur PROPOSE (comin choisie exigée), il ne crée jamais", () => {
  assert.match(
    FORM,
    /if \(!zk \|\| reqNom\.trim\(\)\.length < 2/,
    "la demande doit exiger une komin choisie et un nom",
  );
  assert.match(FORM, /fetch\("\/api\/zones\/request"/, "la demande ne part plus vers la route");
  assert.doesNotMatch(
    FORM,
    /from\("zabelie_zones"\)[\s\S]{0,80}insert/,
    "le client insère dans zabelie_zones — la modération est contournée",
  );
});

test("0070 — la décision est finale et le contenu intouchable, PAR LE TRIGGER", () => {
  assert.match(
    MIG,
    /old\.status <> 'pending'[\s\S]{0,120}raise exception 'ZB070/,
    "le trigger ne refuse plus la re-décision",
  );
  assert.match(
    MIG,
    /new\.nom_propose <> old\.nom_propose/,
    "le trigger ne fige plus le contenu de la demande",
  );
});

const ACTOR_A = "11300000-0000-4000-8000-000000000001";
const ACTOR_B = "11300000-0000-4000-8000-000000000002";
const KOMIN = "11300000-0000-4000-8000-000000000003";
const DEMANDE = { kominId: KOMIN, nom: "  Katye proposé  " };

/** Vrai handler et E/S locales seulement ; la preuve RLS/ZB070 reste en SQL. */
function demandeFixture(options: { actor?: string | null; lang?: Lang; error?: { code: string; message: string } } = {}) {
  const events: string[] = [];
  const requests: Record<string, unknown>[] = [];
  const db = database(query => {
    assert.equal(query.table, "zabelie_zone_requests");
    const insert = query.steps.find(([method]) => method === "insert")?.[1][0];
    assert.ok(insert);events.push("insert");
    if (options.error) return { data: null, error: options.error };
    requests.push(JSON.parse(JSON.stringify(insert)));
    return { data: null, error: null };
  });
  const route = loadRoute("app/api/zones/request/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ ...db, auth: { getUser: async () => {
      events.push("auth");return { data: { user: options.actor === null ? null : { id: options.actor ?? ACTOR_A } } };
    } } }) },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number) => Response.json({ error: t(options.lang ?? "fr", key) }, { status }) },
  });
  const sendRaw = (body: string) => route.POST(new Request("https://example.test/api/zones/request", { method: "POST", headers: { "Content-Type": "application/json" }, body }));
  return { events, requests, queries: db.queries, sendRaw, send: (body: unknown = DEMANDE) => sendRaw(JSON.stringify(body)) };
}
function sansDemande(f: ReturnType<typeof demandeFixture>) {
  assert.deepEqual(f.events, ["auth"]);assert.equal(f.queries.length, 0);assert.deepEqual(f.requests, []);
}

test("demande quartier : formulaire A sous session B refusé avant INSERT", async () => {
  const f = demandeFixture({ actor: ACTOR_B });
  assert.equal((await f.send({ ...DEMANDE, expectedActorId: ACTOR_A })).status, 403);
  sansDemande(f);
});

test("demande quartier : identités concordantes et clients anciens restent liés à la session", async () => {
  for (const actor of [ACTOR_A, ACTOR_B]) {
    for (const identity of [{ expectedActorId: actor }, {}]) {
      const f = demandeFixture({ actor });
      const response = await f.send({ ...DEMANDE, ...identity, requester: actor === ACTOR_A ? ACTOR_B : ACTOR_A, status: "accepted" });
      assert.equal(response.status, 200);assert.deepEqual(await response.json(), { ok: true });
      assert.deepEqual(f.events, ["auth", "insert"]);
      assert.deepEqual(f.requests, [{ requester: actor, komin_id: KOMIN, nom_propose: "Katye proposé" }]);
      assert.equal(f.queries.length, 1);
    }
  }
});

test("demande quartier : précondition mal formée refusée sans requête", async () => {
  for (const expectedActorId of [null, "", "not-an-id", 1, false, [], {}]) {
    const f = demandeFixture();
    assert.equal((await f.send({ ...DEMANDE, expectedActorId })).status, 400);
    sansDemande(f);
  }
});

test("demande quartier : JSON invalide et corps non objets ne créent rien", async () => {
  for (const body of ["{", "null", "[]", "true", "17", '"texte"']) {
    const f = demandeFixture();assert.equal((await f.sendRaw(body)).status, 400);sansDemande(f);
  }
});

test("demande quartier : types des champs invalides refusés sans exception ni INSERT", async () => {
  for (const field of ["kominId", "nom"]) {
    for (const value of [true, 17, [], {}, null]) {
      const f = demandeFixture();
      assert.equal((await f.send({ ...DEMANDE, [field]: value })).status, 400);sansDemande(f);
    }
  }
});

test("demande quartier : limites et trim existants conservés", async () => {
  for (const body of [{}, { ...DEMANDE, kominId: " " }, { ...DEMANDE, nom: "x" }, { ...DEMANDE, nom: "x".repeat(81) }]) {
    const f = demandeFixture();assert.equal((await f.send(body)).status, 400);sansDemande(f);
  }
  for (const nom of ["xy", "x".repeat(80)]) {
    const f = demandeFixture();assert.equal((await f.send({ kominId: ` ${KOMIN} `, nom: ` ${nom} `, expectedActorId: ACTOR_A })).status, 200);
    assert.deepEqual(f.requests, [{ requester: ACTOR_A, komin_id: KOMIN, nom_propose: nom }]);
  }
});

test("demande quartier : Auth reste prioritaire au JSON et à l'identité", async () => {
  for (const body of ["{", "null", JSON.stringify({ ...DEMANDE, expectedActorId: ACTOR_B })]) {
    const f = demandeFixture({ actor: null });assert.equal((await f.sendRaw(body)).status, 401);sansDemande(f);
  }
});

test("demande quartier : le doublon pending garde sa réponse409", async () => {
  const f = demandeFixture({ error: { code: "23505", message: "synthetic duplicate" } });
  const response = await f.send({ ...DEMANDE, expectedActorId: ACTOR_A });
  assert.equal(response.status, 409);assert.deepEqual(await response.json(), { error: "Cette demande existe déjà et attend sa revue." });
  assert.deepEqual(f.events, ["auth", "insert"]);assert.deepEqual(f.requests, []);
});

test("demande quartier : garde ZB070 conservé sans seconde validation de zone", async () => {
  const f = demandeFixture({ error: { code: "P0001", message: "ZB070 : komin introuvable ou fermée" } });
  const response = await f.send({ ...DEMANDE, expectedActorId: ACTOR_A });
  assert.equal(response.status, 400);assert.deepEqual(await response.json(), { error: "ZB070 : komin introuvable ou fermée" });
  assert.deepEqual(f.events, ["auth", "insert"]);assert.deepEqual(f.requests, []);
});

test("demande quartier : panne de base conserve le refus500 sans succès apparent", async () => {
  const f = demandeFixture({ error: { code: "08006", message: "synthetic database unavailable" } });
  const response = await f.send({ ...DEMANDE, expectedActorId: ACTOR_A });
  assert.equal(response.status, 500);assert.deepEqual(await response.json(), { error: "synthetic database unavailable" });assert.deepEqual(f.requests, []);
});

test("demande quartier : les nouveaux refus réutilisent les traductions existantes", async () => {
  for (const lang of LANGS) {
    const f = demandeFixture({ actor: ACTOR_B, lang });
    const r = await f.send({ ...DEMANDE, expectedActorId: ACTOR_A });
    assert.equal(r.status, 403);assert.deepEqual(await r.json(), { error: t(lang, "api.auth.required") });sansDemande(f);
    const invalid = demandeFixture({ lang });
    const response = await invalid.send({ ...DEMANDE, expectedActorId: false });
    assert.equal(response.status, 400);assert.deepEqual(await response.json(), { error: t(lang, "api.params.invalid") });sansDemande(invalid);
  }
});
