import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attestationAgeValide, lireAgeMinimum } from "../lib/age-minimum";
import { POLICY_VERSION } from "../lib/policy";

/**
 * Âge minimum par rayon (0115) et ouverture du clairin (0116).
 *
 * Décision porteur du 2026-09-23 : 18 ans. Ce qui est gardé ici, c'est ce qui
 * COMMANDE : la source du seuil, la condition du refus, l'ordre des écritures,
 * l'état initial de la case — jamais un libellé seul (CLAUDE.md, piège de
 * sous-chaîne). Chaque assertion structurelle a été éprouvée par une mutation
 * qui rend le garde inatteignable ou change sa source.
 */

const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const ROUTE = sansCommentaires(readFileSync("app/api/checkout/route.ts", "utf8"));
const BOUTON = sansCommentaires(readFileSync("components/buy-button.tsx", "utf8"));
const FICHE = sansCommentaires(readFileSync("app/produit/[slug]/page.tsx", "utf8"));
const I18N = readFileSync("lib/i18n.ts", "utf8");
const M0115 = readFileSync("supabase/migrations/0115_age_minimum_rayon.sql", "utf8");
const M0116 = readFileSync("supabase/migrations/0116_ouvrir_klerin.sql", "utf8");

// ── Le module ────────────────────────────────────────────────────────────────

test("AM1 — l'attestation ne vaut que `true`, rien de « truthy »", () => {
  assert.equal(attestationAgeValide(true), true);
  for (const faux of [false, "true", 1, "on", "yes", {}, [], null, undefined]) {
    assert.equal(attestationAgeValide(faux), false, `${JSON.stringify(faux)} accepté`);
  }
});

type Reponse = { data: unknown; error: { code?: string } | null };
function fauxAdmin(reponse: Reponse) {
  const appels: unknown[] = [];
  const admin = {
    rpc: async (nom: string, args: unknown) => {
      appels.push([nom, args]);
      return reponse;
    },
  };
  return { admin: admin as never, appels };
}

test("AM2 — sans sous-rayon, aucun aller-retour SQL et aucune restriction", async () => {
  const { admin, appels } = fauxAdmin({ data: 18, error: null });
  assert.deepEqual(await lireAgeMinimum(admin, "p1", false), { ok: true, age: 0 });
  assert.equal(appels.length, 0);
});

test("AM3 — le seuil vient de la BASE, par zabelie_age_minimum", async () => {
  const { admin, appels } = fauxAdmin({ data: 18, error: null });
  assert.deepEqual(await lireAgeMinimum(admin, "p1", true), { ok: true, age: 18 });
  assert.deepEqual(appels, [["zabelie_age_minimum", { p_product: "p1" }]]);
});

test("AM4 — fonction absente (0115 non appliquée) : aucune restriction possible", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const { admin } = fauxAdmin({ data: null, error: { code } });
    assert.deepEqual(await lireAgeMinimum(admin, "p1", true), { ok: true, age: 0 });
  }
});

test("AM5 — toute AUTRE erreur est un refus, jamais « pas de restriction »", async () => {
  const { admin } = fauxAdmin({ data: null, error: { code: "57014" } });
  assert.deepEqual(await lireAgeMinimum(admin, "p1", true), { ok: false });
});

// ── Le checkout ─────────────────────────────────────────────────────────────

test("AC1 — l'attestation part du corps de la requête, le seuil de la base", () => {
  assert.match(ROUTE, /ageAttestation: ageAttestationInput,/);
  assert.match(
    ROUTE,
    /const lectureAge = await lireAgeMinimum\(admin, product\.id, Boolean\(product\.category_id\)\);/
  );
});

test("AC2 — la base muette refuse (503), elle n'autorise pas", () => {
  assert.match(
    ROUTE,
    /if \(!lectureAge\.ok\) \{\s*return NextResponse\.json\(\s*\{ error: t\(lang, "api\.order\.failed"\), code: "age_indisponible" \},\s*\{ status: 503/
  );
});

test("AC3 — la condition du refus, liée à sa source", () => {
  assert.match(
    ROUTE,
    /const ageMinimum = lectureAge\.age;\s*if \(ageMinimum > 0 && !attestationAgeValide\(ageAttestationInput\)\) \{\s*return NextResponse\.json\(/
  );
  assert.match(ROUTE, /code: "age_attestation_requise",/);
});

test("AC4 — le refus a lieu AVANT la création de la commande", () => {
  const refus = ROUTE.indexOf("age_attestation_requise");
  const commande = ROUTE.search(/\.from\("orders"\)\s*\.insert\(/);
  assert.ok(refus > 0 && commande > 0);
  assert.ok(refus < commande, "l'attestation doit être exigée avant l'insertion de la commande");
});

test("AC5 — l'attestation est écrite AVANT le paiement, et son échec retire la commande", () => {
  const ecriture = ROUTE.search(
    /if \(ageMinimum > 0\) \{\s*const \{ error: ageErr \} = await admin\s*\.from\("zabelie_order_age_attestations"\)\s*\.insert\(\{ order_id: order\.id, age_minimum: ageMinimum \}\);\s*if \(ageErr\) \{\s*await admin\.from\("orders"\)\.delete\(\)\.eq\("id", order\.id\);/
  );
  const paiement = ROUTE.search(/\.from\("payments"\)\.insert\(/);
  assert.ok(ecriture > 0, "écriture de l'attestation absente ou détachée de son retrait");
  assert.ok(paiement > 0 && ecriture < paiement, "l'attestation doit précéder le paiement");
});

// ── L'interface ─────────────────────────────────────────────────────────────

test("AU1 — la case n'est jamais pré-cochée, et bloque les DEUX boutons", () => {
  assert.match(BOUTON, /const \[ageAtteste, setAgeAtteste\] = useState\(false\);/);
  assert.match(BOUTON, /const ageBloque = Boolean\(ageMinimum\) && !ageAtteste;/);
  assert.match(BOUTON, /const achatBloque = rechajBloque \|\| ageBloque;/);
  const gardes = BOUTON.match(/disabled=\{busy \|\| soldOut \|\| selectedOut \|\| achatBloque\}/g) ?? [];
  assert.equal(gardes.length, 2);
  assert.match(BOUTON, /ageAttestation: ageMinimum \? ageAtteste : undefined,/);
});

test("AU2 — la fiche lit le seuil en base et le transmet au bouton", () => {
  assert.match(
    FICHE,
    /if \(isSupabaseConfigured\(\) && product\.sousRayonSlug !== null\) \{\s*try \{\s*const lectureAge = await lireAgeMinimum\(createAdminClient\(\), product\.id, true\);\s*ageMinimum = lectureAge\.ok \? lectureAge\.age : 0;/
  );
  assert.match(FICHE, /\{ageMinimum > 0 && \(\s*<p[^>]*>\s*<span aria-hidden="true">\{ageMinimum\}\+<\/span>/);
  assert.match(FICHE, /ageMinimum=\{\s*ageMinimum > 0\s*\? \{ age: ageMinimum, label: t\(lang, "age\.attest"\)/);
});

// ── La politique ────────────────────────────────────────────────────────────

test("AP1 — la politique passe en v4, datée du jour de la décision, en quatre langues", () => {
  assert.equal(POLICY_VERSION, "v4");
  assert.match(readFileSync("lib/policy.ts", "utf8"), /\/\/ v4 \(2026-09-23\)/);
  for (const d of ["23 septembre 2026", "23 septanm 2026", "September 23, 2026", "23 de septiembre de 2026"]) {
    assert.ok(I18N.includes(`"policy.date": "${d}"`), `policy.date « ${d} » manquante`);
  }
});

test("AP2 — 18 ans écrit en toutes lettres dans le titre de la section Alcool, quatre langues", () => {
  const titres = I18N.match(/"policy\.alcohol\.h": "[^"]*"/g) ?? [];
  assert.equal(titres.length, 4);
  for (const titre of titres) assert.match(titre, /18/, titre);
  for (const cle of ["age.badge", "age.attest", "api.age.required"]) {
    const n = (I18N.match(new RegExp(`"${cle.replace(/\./g, "\\.")}": "[^"]*\\{age\\}`, "g")) ?? []).length;
    assert.equal(n, 4, `${cle} : ${n} langue(s) portant {age}, 4 attendues`);
  }
});

// ── Les migrations ──────────────────────────────────────────────────────────

test("AS1 — 0115 pose le seuil sur klerin et N'OUVRE RIEN", () => {
  assert.match(M0115, /set age_minimum = 18\s+where slug = 'klerin'/);
  assert.doesNotMatch(sansCommentaires(M0115.replace(/--[^\n]*/g, "")), /set active = true/);
});

test("AS2 — 0116 n'ouvre que klerin, et refuse de passer sans le seuil de 0115", () => {
  const code = M0116.replace(/--[^\n]*/g, "");
  const ouvertures = code.match(/set active = true\s+where slug = '([a-z-]+)'/g) ?? [];
  assert.deepEqual(ouvertures.map((o) => o.replace(/[\s\S]*'([a-z-]+)'$/, "$1")), ["klerin"]);
  assert.match(code, /if v_age is distinct from 18 then\s+raise exception/);
});
