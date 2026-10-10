import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { CONDITIONS } from "../lib/policy-terms";
import { IDENTITE, POLITIQUE } from "../lib/policy-privacy";
import { ACCOUNT_LEGAL_VERSIONS, CONDITIONS_VERSION, CONFIDENTIALITE_VERSION, initialLegalDeclaration, hasCurrentLegalAcceptance } from "../lib/legal-acceptance";
import { loadRoute, database } from "./helpers/route-harness";
import { t } from "../lib/i18n";
import { appelSession } from "../lib/appel-session";

// Fingerprints archive the exact canonical documents behind these receipt IDs.
// A document/identity change needs a NEW version, fingerprint and SQL migration;
// replacing only a fingerprint would relabel an already accepted document.
// Les empreintes retirées ne s'effacent pas : elles ARCHIVENT le document que
// chaque reçu atteste. `confidentialite-v1` reste donc ici après le passage en
// v2 — des comptes portent ce reçu, et il désigne un texte précis.
const DOCUMENTS = {
  "cgu-v1": "1ed972be789bdfae4067cae594856049dbec1c7371a370c37e5646047457b250",
  "confidentialite-v1": "6ab1482d81dd66d66d75f260a439e77e96e4a331debb7b91ae473ca7ca3f0853",
  // v2 — 2026-10-10 : TypeSafe entre au §6 (0136).
  "confidentialite-v2": "6318df0e2dc8500af19983bd75dc07be3be76d637767c173298907fb76b0d162",
};

test("receipt versions describe the canonical documents actually linked, in all four languages", () => {
  for (const [version, document, page, symbol] of [
    [CONDITIONS_VERSION, CONDITIONS, "app/conditions/page.tsx", "CONDITIONS_VERSION"],
    [CONFIDENTIALITE_VERSION, POLITIQUE, "app/confidentialite/page.tsx", "CONFIDENTIALITE_VERSION"],
  ] as const) {
    const collections = version === CONFIDENTIALITE_VERSION ? ["fr", "ht", "en", "es"].map(lang => ({ title: t(lang as "fr", "collections.privacy.title"), body: t(lang as "fr", "collections.privacy.body") })) : undefined;
    assert.equal(createHash("sha256").update(JSON.stringify({ document, identity: IDENTITE, collections })).digest("hex"), DOCUMENTS[version], "Changed legal text requires a new receipt version and SQL constants");
    assert.match(readFileSync(page, "utf8"), new RegExp(`data-policy-version=\\{${symbol}\\}`));
  }
  // La migration COURANTE est la source de vérité des versions que le serveur
  // sait écrire. La faire pointer sur 0133 après un passage en v2 aurait laissé
  // l'application exiger un reçu qu'aucune fonction SQL ne produit.
  //
  // ⚠️ L'assertion porte sur CHAQUE FONCTION, jamais sur le fichier. Mesuré le
  // 2026-10-10 : retirer `confidentialite-v2` de la seule RPC de
  // ré-acceptation laissait le test VERT — cinq occurrences survivaient dans
  // les commentaires, le trigger et la sonde. En production, la RPC aurait
  // refusé v2 et les utilisateurs auraient ré-accepté en boucle sans jamais
  // satisfaire la garde. Une présence de sous-chaîne ne prouve rien sur
  // l'endroit qui décide.
  const migration = readFileSync("supabase/migrations/0136_zabelie_confidentialite_v2.sql", "utf8");
  const corps = migration
    .split(/create (?:or replace )?function /)
    .slice(1)
    .map((bloc) => bloc.slice(0, bloc.indexOf("$$;")));
  assert.equal(corps.length, 2, "0136 doit porter les DEUX fonctions d'acceptation");
  for (const [rang, fonction] of corps.entries()) {
    for (const version of ACCOUNT_LEGAL_VERSIONS) {
      assert.ok(
        fonction.includes(`'${version}'`),
        `${version} absente du corps de la fonction ${rang + 1} de 0136 : un reçu exigé que cette fonction ne sait pas écrire`
      );
    }
  }
});

test("initial declarations require both distinct explicit acts; old product receipts are insufficient", () => {
  for (const pair of [[false, false], [true, false], [false, true]] as const) {
    assert.throws(() => initialLegalDeclaration(pair[0], pair[1]), /legal_acceptance_required/);
  }
  assert.deepEqual(initialLegalDeclaration(true, true), {
    conditions_version: CONDITIONS_VERSION, conditions_accepted: true,
    confidentialite_version: CONFIDENTIALITE_VERSION, confidentialite_read: true,
  });
  assert.equal(hasCurrentLegalAcceptance([{ policy_version: "v4" }, { policy_version: CONDITIONS_VERSION }]), false);
  assert.equal(hasCurrentLegalAcceptance(ACCOUNT_LEGAL_VERSIONS.map(policy_version => ({ policy_version }))), true);
});

test("only opted-in business operations read legal receipts; missing proof and outage stay distinct", async () => {
  for (const [rows, error, expected] of [
    [[], null, 403],
    [ACCOUNT_LEGAL_VERSIONS.map(policy_version => ({ policy_version })), null, 200],
    [null, { message: "private detail" }, 503],
  ] as const) {
    const db = database(() => ({ data: rows, error }));
    const auth = loadRoute("lib/auth.ts", {
      "@/lib/account-suspension": { readSuspension: async () => null },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/legal-acceptance": { ACCOUNT_LEGAL_VERSIONS, hasCurrentLegalAcceptance },
      "@/lib/api-erreur": { erreurTraduite: async (error: string, status: number, extra: object) => Response.json({ error, ...extra }, { status }) },
    });
    assert.equal(await auth.requireActiveAccount("self"), null, "ordinary calls retain their original guard");
    assert.equal(db.queries.length, 0, "support/rights and non-opted callers do not read this registry");
    const response = await auth.requireActiveAccount("self", { legalAcceptance: true });
    assert.equal(response?.status ?? 200, expected);
    if (expected === 403) assert.equal((await response!.json()).code, "legal_acceptance_required");
  }
  const checkout = readFileSync("app/api/checkout/route.ts", "utf8");
  assert.match(checkout, /requireActiveAccount\(user\.id, \{ legalAcceptance: recoveryOnlyInput !== true \}\)/);
});

test("legal refusal returns to the current product/cart through a navigation, never another POST", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ code: "legal_acceptance_required", error: "read terms" }, { status: 403 }); };
    assert.deepEqual(await appelSession("/api/checkout", {}, "/produit/test?source=cart"), {
      etat: "connexion", vers: "/connexion?mode=legal&next=%2Fproduit%2Ftest%3Fsource%3Dcart",
    });
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});

function callbackFixture(options: { receipts?: { policy_version: string }[] | null; readError?: boolean; exchangeError?: boolean; noUser?: boolean } = {}) {
  const db = database(() => ({ data: options.receipts === undefined ? [] : options.receipts, error: options.readError ? {} : null }));
  const actions: string[] = [];
  const route = loadRoute("app/auth/callback/route.ts", {
    "next/server": { NextResponse: { redirect: (url: string) => new Response(null, { status: 307, headers: { Location: url } }) } },
    "@/lib/site-origin": { siteOrigin: () => "https://zabelie.com" },
    "@/lib/safe-next": { safeNext: (path: string | null) => path?.startsWith("/") && !path.startsWith("//") ? path : "/" },
    "@/lib/legal-acceptance": { ACCOUNT_LEGAL_VERSIONS, hasCurrentLegalAcceptance },
    "@/lib/supabase/server": { createClient: async () => ({ ...db, auth: {
      exchangeCodeForSession: async () => { actions.push("exchange"); return { data: { user: options.noUser ? null : { id: "self" } }, error: options.exchangeError ? {} : null }; },
    } }) },
  });
  return { route, db, actions };
}

test("OAuth/confirmation callback requires a NEW explicit act when receipts are absent or unreadable", async () => {
  for (const options of [{}, { receipts: [{ policy_version: CONDITIONS_VERSION }] }, { receipts: null }, { readError: true }]) {
    const f = callbackFixture(options);
    const response = await f.route.GET(new Request("https://zabelie.com/auth/callback?code=valid&next=%2Fpanier%3Fsource%3Doauth"));
    assert.equal(response.headers.get("Location"), "https://zabelie.com/connexion?mode=legal&next=%2Fpanier%3Fsource%3Doauth");
    assert.equal(f.db.queries[0].table, "zabelie_policy_acceptances");
    assert.ok(f.db.queries[0].steps.some(([name, args]) => name === "eq" && args[0] === "user_id" && args[1] === "self"));
    assert.ok(!f.db.queries.some(q => q.steps.some(([method]) => method === "insert" || method === "update")), "callback cannot infer or invent an act");
  }
});

test("callback preserves confirmed receipts and safe next; expired codes never read or write evidence", async () => {
  const f = callbackFixture({ receipts: ACCOUNT_LEGAL_VERSIONS.map(policy_version => ({ policy_version })) });
  assert.equal((await f.route.GET(new Request("https://zabelie.com/auth/callback?code=valid&next=%2Fpanier"))).headers.get("Location"), "https://zabelie.com/panier");
  for (const options of [{ exchangeError: true }, { noUser: true }]) {
    const broken = callbackFixture(options);
    assert.equal((await broken.route.GET(new Request("https://zabelie.com/auth/callback?code=expired"))).headers.get("Location"), "https://zabelie.com/connexion?erreur=lien_expire");
    assert.equal(broken.db.queries.length, 0);
  }
  const unsafe = callbackFixture();
  assert.equal((await unsafe.route.GET(new Request("https://zabelie.com/auth/callback?code=valid&next=https://evil.invalid"))).headers.get("Location"), "https://zabelie.com/connexion?mode=legal&next=%2F");
});

test("account export includes only the caller's immutable receipt versions/dates and reports read failures", async () => {
  for (const fail of [false, true]) {
    const db = database(query => ({ data: query.table === "zabelie_policy_acceptances" ? [{ policy_version: "cgu-v1", accepted_at: "2026-10-05T00:00:00Z" }] : [], error: fail && query.table === "zabelie_policy_acceptances" ? {} : null }));
    class ExportResponse extends Response { static json = Response.json; }
    const route = loadRoute("app/api/account/export/route.ts", {
      "next/server": { NextResponse: ExportResponse },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "self", email: "self@test.local" } } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/collection-export": { exportCollections: async () => ({}) },
    });
    const response = await route.GET();
    assert.equal(response.status, fail ? 503 : 200);
    if (!fail) assert.deepEqual((await response.json()).legal_acknowledgements, [{ policy_version: "cgu-v1", accepted_at: "2026-10-05T00:00:00Z" }]);
    const receipt = db.queries.find(q => q.table === "zabelie_policy_acceptances")!;
    assert.ok(receipt.steps.some(([name, args]) => name === "select" && args[0] === "policy_version,accepted_at"));
    assert.ok(receipt.steps.some(([name, args]) => name === "eq" && args[0] === "user_id" && args[1] === "self"));
  }
});
