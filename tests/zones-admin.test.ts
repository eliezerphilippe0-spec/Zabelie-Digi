import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { slugifierZone } from "../lib/zones";

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
