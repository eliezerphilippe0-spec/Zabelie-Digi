import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  REFUS_ESSAYAGE,
  SEL_MESURE,
  SOUS_RAYONS_ESSAYAGE,
  groupeDe,
  jourHaiti,
  pieceDuSousRayon,
  sousRayonOuvert,
} from "../lib/essayage/regles";
import { essayageActif, lireEnvEssayage } from "../lib/essayage/flags";

/**
 * ESSAYAGE VIRTUEL — règles pures (docs/74 §2.1, §7 ; tasks/essayage-todo.md 1.1).
 *
 * La liste des sous-rayons ouverts est confrontée à l'arbre RÉEL des
 * migrations (0035, 0077) : un slug mal orthographié ou rangé sous les
 * enfants ouvrirait ou fermerait un rayon sans que personne ne le voie.
 */

// Arbre de la taxonomie : enfant → parent, tel que les migrations l'amorcent
// (« ('parent', 'enfant', 'Libellé', … ) »).
const ARBRE = new Map<string, string>();
for (const fichier of ["supabase/migrations/0035_categories.sql", "supabase/migrations/0077_taxonomie_niveau3.sql"]) {
  for (const [, parent, enfant] of readFileSync(fichier, "utf8").matchAll(/\(\s*'([a-z0-9-]+)',\s*'([a-z0-9-]+)',\s*'/g)) {
    ARBRE.set(enfant, parent);
  }
}
const OUVERTS = Object.keys(SOUS_RAYONS_ESSAYAGE);
const CATEGORIES_OUVERTES = new Set(["rad-fanm", "rad-gason", "rad-espo"]);

test("R1 — chaque sous-rayon ouvert existe, au niveau 3, sous Vêtements femme, homme ou sport", () => {
  assert.equal(OUVERTS.length, 15, "la liste du §2.1 compte 15 sous-rayons");
  for (const slug of OUVERTS) {
    const parent = ARBRE.get(slug);
    assert.ok(parent, `${slug} n'existe pas dans la taxonomie`);
    assert.ok(CATEGORIES_OUVERTES.has(parent), `${slug} est rangé sous ${parent}`);
    assert.ok(sousRayonOuvert(slug), slug);
  }
});

test("R2 — lingerie, maillots de bain, sous-vêtements, chaussures, accessoires et enfants restent fermés", () => {
  for (const slug of ["lenjri", "mayo-beny", "souvetman-gason", "soulye-espo", "akseswa-espo"]) {
    assert.ok(ARBRE.has(slug), `${slug} doit exister, sinon ce test ne prouve rien`);
    assert.equal(sousRayonOuvert(slug), false, slug);
  }
  const enfants = [...ARBRE].filter(([, parent]) => parent === "rad-timoun").map(([slug]) => slug);
  assert.ok(enfants.length >= 5, "les sous-rayons enfants sont lus");
  for (const slug of enfants) assert.equal(sousRayonOuvert(slug), false, slug);
  // Tout sous-rayon des catégories ouvertes qui n'est pas listé est fermé : la liste est fermée, pas l'inverse.
  for (const [slug, parent] of ARBRE) {
    if (CATEGORIES_OUVERTES.has(parent) && !OUVERTS.includes(slug)) assert.equal(sousRayonOuvert(slug), false, slug);
  }
});

test("R3 — une fiche rangée au seul niveau 2, ou sans sous-rayon, reste fermée", () => {
  for (const slug of ["rad-fanm", "rad-gason", "rad-espo", "rad-timoun", "mod-akseswa", "", null, undefined]) {
    assert.equal(sousRayonOuvert(slug), false, String(slug));
  }
  // Pas de piège par les propriétés héritées d'un objet.
  for (const slug of ["toString", "constructor", "__proto__", "hasOwnProperty"]) assert.equal(sousRayonOuvert(slug), false, slug);
});

test("R4 — chaque sous-rayon ouvert dit ce que couvre le vêtement", () => {
  assert.equal(pieceDuSousRayon("wob"), "entier");
  assert.equal(pieceDuSousRayon("jip"), "bas");
  assert.equal(pieceDuSousRayon("chemiz"), "haut");
  assert.equal(pieceDuSousRayon("kostim"), "ensemble");
  for (const slug of OUVERTS) assert.ok(["haut", "bas", "entier", "ensemble"].includes(pieceDuSousRayon(slug as never)), slug);
});

test("R5 — un acheteur reste dans son groupe, et les groupes sont équilibrés", () => {
  const id = "11111111-2222-4333-8444-555555555555";
  const groupe = groupeDe(id);
  for (let i = 0; i < 5; i++) assert.equal(groupeDe(id), groupe, "stable");
  let essai = 0;
  const n = 10_000;
  for (let i = 0; i < n; i++) if (groupeDe(randomUUID()) === "essai") essai++;
  assert.ok(Math.abs(essai / n - 0.5) <= 0.02, `part du groupe essai : ${essai / n}`);
  // Changer de sel rebat les groupes (nouvelle mesure) : une partie des acheteurs change de groupe.
  let changes = 0;
  for (let i = 0; i < 1_000; i++) {
    const a = randomUUID();
    if (groupeDe(a) !== groupeDe(a, `${SEL_MESURE}-bis`)) changes++;
  }
  assert.ok(changes > 300 && changes < 700, `changements de groupe : ${changes}`);
});

test("R5b — le hachage est figé : le changer en cours de mesure déplacerait des acheteurs d'un groupe à l'autre", () => {
  // Valeurs relevées le 2026-10-19 avec le sel `essayage-pilote-2026-10`. Pour une nouvelle mesure,
  // on change le SEL, pas la fonction ; et on met ces valeurs à jour en même temps, en connaissance de cause.
  const figes: [string, string][] = [
    ["00000000-0000-4000-8000-000000000001", "essai"],
    ["00000000-0000-4000-8000-000000000002", "essai"],
    ["00000000-0000-4000-8000-000000000003", "temoin"],
    ["00000000-0000-4000-8000-000000000004", "temoin"],
    ["22222222-2222-2222-2222-222222222222", "essai"],
    ["11111111-1111-1111-1111-111111111111", "temoin"],
    ["cccccccc-0000-4000-8000-000000000384", "temoin"],
  ];
  assert.equal(SEL_MESURE, "essayage-pilote-2026-10");
  for (const [id, groupe] of figes) assert.equal(groupeDe(id), groupe, id);
});

test("R6 — le jour se compte en heure d'Haïti, été comme hiver", () => {
  // Octobre : UTC-4. 03 h 30 UTC = 23 h 30 la veille à Port-au-Prince.
  assert.equal(jourHaiti(new Date("2026-10-20T03:30:00Z")), "2026-10-19");
  assert.equal(jourHaiti(new Date("2026-10-20T04:30:00Z")), "2026-10-20");
  // Décembre : UTC-5.
  assert.equal(jourHaiti(new Date("2026-12-01T04:30:00Z")), "2026-11-30");
  assert.equal(jourHaiti(new Date("2026-12-01T05:30:00Z")), "2026-12-01");
});

test("R7 — les refus ont des codes fermés", () => {
  assert.deepEqual([...REFUS_ESSAYAGE], ["interrupteur", "anonyme", "non_eligible", "quota", "plafond", "pause", "photo"]);
});

test("R8 — seule la valeur exacte « true » allume l'essayage", () => {
  assert.equal(essayageActif({ ZABELIE_ESSAYAGE_ENABLED: "true" }), true);
  for (const v of [undefined, "", "1", "TRUE", "True", "true ", " true", "yes"]) {
    assert.equal(essayageActif({ ZABELIE_ESSAYAGE_ENABLED: v }), false, JSON.stringify(v));
  }
});

test("R9 — l'environnement est lu explicitement, variable par variable", () => {
  const avant = { ...process.env };
  try {
    process.env.ZABELIE_ESSAYAGE_ENABLED = "true";
    process.env.ZABELIE_ESSAYAGE_FOURNISSEUR = "simulation";
    process.env.GENLOOK_API_KEY = "cle-genlook-de-test";
    process.env.FASHN_API_KEY = "cle-fashn-de-test";
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(lireEnvEssayage(), {
      ZABELIE_ESSAYAGE_ENABLED: "true",
      ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation",
      GENLOOK_API_KEY: "cle-genlook-de-test",
      FASHN_API_KEY: "cle-fashn-de-test",
      VERCEL_ENV: "preview",
    });
  } finally {
    for (const cle of ["ZABELIE_ESSAYAGE_ENABLED", "ZABELIE_ESSAYAGE_FOURNISSEUR", "GENLOOK_API_KEY", "FASHN_API_KEY", "VERCEL_ENV"]) {
      if (avant[cle] === undefined) delete process.env[cle];
      else process.env[cle] = avant[cle];
    }
  }
});
