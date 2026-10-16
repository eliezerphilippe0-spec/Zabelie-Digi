import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { projetPourEditeur } from "../lib/digital-authoring/api";
import { LIMITES_DEFAUT, lire, remplirBrief, schemaBrief, schemaContenu } from "../lib/digital-authoring/schema";

/**
 * Studio de création éditoriale — éditeur (docs/70, tâche 2.4).
 * Brouillon contre complet, ligne de base non fiable, et les gardes de
 * l'écran qui ne se voient que dans la source.
 */

const SECTION = "00000000-0000-4000-8000-0000000000d1";
const vide = { sujet: "", publicDetail: "", probleme: "", resultat: "", methode: "", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };

test("brouillon : un brief incomplet et une section sans titre s'enregistrent ; complet les refuse", () => {
  assert.ok(lire(schemaBrief(LIMITES_DEFAUT, "brouillon"), vide).ok);
  assert.deepEqual(lire(schemaBrief(LIMITES_DEFAUT, "complet"), vide), { ok: false, code: "champ_requis" });
  const sansTitre = { objectif: "", sections: [{ id: SECTION, titre: "", resultat: "", corps: "" }] };
  assert.ok(lire(schemaContenu(LIMITES_DEFAUT, "brouillon"), sansTitre).ok);
  assert.deepEqual(lire(schemaContenu(LIMITES_DEFAUT, "complet"), sansTitre), { ok: false, code: "champ_requis" });
  // Les limites valent dans les deux modes.
  const long = { ...vide, sujet: "x".repeat(LIMITES_DEFAUT.brief + 1) };
  assert.equal(lire(schemaBrief(LIMITES_DEFAUT, "brouillon"), long).ok, false);
});

test("un brief jamais touché (`{}` en base) est incomplet, pas mal formé", () => {
  assert.deepEqual(remplirBrief({}), vide);
  assert.deepEqual(remplirBrief(null), vide);
  assert.deepEqual(remplirBrief({ sujet: "Manje" }).sujet, "Manje");
  assert.deepEqual(lire(schemaBrief(LIMITES_DEFAUT, "complet"), remplirBrief({})), { ok: false, code: "champ_requis" });
});

test("ligne de base non fiable : l'éditeur reçoit une forme sûre", () => {
  const p = projetPourEditeur({
    id: "p1", revision: 4, titre: 42, langue: "zz", public_vise: "mars", marche_diaspora: null,
    brief: { sujet: { html: "<b>" }, inconnu: "x" },
    contenu: { objectif: ["x"], sections: [{ id: SECTION, titre: "Un", resultat: 7, corps: "Tèks" }, "pas une section", { titre: "sans id" }] },
    plan_approuve_revision: "3", archived_at: "2026-10-15",
  });
  assert.ok(p);
  assert.equal(p.titre, "");
  assert.equal(p.langue, "ht", "langue inconnue → kreyòl, la langue de référence");
  assert.equal(p.public, "haiti");
  assert.equal(p.brief.sujet, "", "un objet dans un champ texte devient vide, jamais du HTML");
  assert.deepEqual(p.contenu, { objectif: "", sections: [{ id: SECTION, titre: "Un", resultat: "", corps: "Tèks" }] });
  assert.equal(p.planApprouveRevision, null);
  assert.equal(p.archive, true);
  assert.equal(projetPourEditeur({ revision: 1 }), null, "sans identifiant");
  assert.equal(projetPourEditeur({ id: "p", revision: "1" }), null, "révision non numérique");
});

test("aucun composant du Studio n'interprète du HTML", () => {
  const fichiers = readdirSync("components").filter((f) => f.startsWith("authoring-"));
  assert.ok(fichiers.length >= 2, "les composants du Studio doivent être lus");
  for (const f of fichiers) {
    const src = readFileSync(`components/${f}`, "utf8");
    assert.ok(!src.includes("dangerouslySetInnerHTML"), `${f} interprète du HTML`);
  }
});

test("éditeur : rédaction après approbation, approbation sur révision enregistrée, conflit à deux issues", () => {
  const src = readFileSync("components/authoring-editor.tsx", "utf8");
  assert.match(src, /\{planApprouve === null \? \(\s*<p[^>]*>\{e\.redactionVerrou\}/, "la rédaction n'est pas verrouillée avant le plan");
  assert.match(src, /if \(statut !== "propre" && statut !== "enregistre"\) rev = await sauver\(\);/, "l'approbation n'enregistre pas d'abord");
  // Chaque envoi porte la révision attendue et un jeton neuf, gardé pour trancher une réponse perdue.
  assert.match(src, /const suivi: EnvoiSuivi = \{ revisionAttendue, jeton: crypto\.randomUUID\(\), version: version\.current \};/);
  assert.match(src, /body: JSON\.stringify\(\{\s*revisionAttendue,\s*jeton: suivi\.jeton,/);
  assert.match(src, /onClick=\{garderMaVersion\}/);
  assert.match(src, /onClick=\{reprendreServeur\}/);
});

test("page du projet : drapeau, identifiant, session, noindex, lecture sous le JWT", () => {
  const src = readFileSync("app/tableau-de-bord/creation/[projectId]/page.tsx", "utf8");
  assert.match(src, /if \(!creationActive\(lireEnvCreation\(\)\)\) notFound\(\);/);
  assert.match(src, /if \(!UUID_RE\.test\(projectId\)\) notFound\(\);/);
  assert.match(src, /if \(!projet\) notFound\(\);/, "projet d'un autre : 404, jamais 403");
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.ok(!src.includes("createAdminClient"));
});
