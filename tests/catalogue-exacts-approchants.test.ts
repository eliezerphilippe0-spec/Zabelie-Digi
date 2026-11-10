import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * EXACTS ET APPROCHANTS S'AFFICHENT ENSEMBLE (audit du 2026-11-10, P0-1).
 *
 * Le rattrapage par similarité s'ouvre dès qu'une recherche rend moins de
 * trois résultats exacts (audit REA #7). La page rendait alors les approchants
 * SEULS : la grille des exacts vivait dans la branche « aucun approchant »
 * d'un ternaire. Chercher « batri » avec une batterie au catalogue et deux
 * produits voisins faisait disparaître la batterie.
 *
 * Ces assertions portent sur ce qui COMMANDE chaque grille (sa propre liste),
 * avec la liste liée à son `.map` : un garde rendu inatteignable ou rebranché
 * sur l'autre liste les fait rougir (CLAUDE.md, « piège de sous-chaîne »).
 * Mutations jouées le 2026-11-10 : voir le message du commit.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/catalogue/page.tsx", "utf8"));
const debut = PAGE.indexOf('{t(lang, "catalog.results.heading")}');
const SECTION = PAGE.slice(debut, PAGE.indexOf("</section>", debut));

const GRILLE_EXACTS = /\{products\.length > 0 && \(\s*<>\s*<div className="grid [^"]*">\s*\{products\.map\(/;
const GRILLE_APPROCHANTS = /\{approchants\.length > 0 && \(\s*<div className=\{products\.length === 0 \? undefined : "mt-8"\}>\s*<p className="[^"]*">\s*\{t\(lang, products\.length === 0 \? "catalog\.fuzzy" : "catalog\.fuzzy\.more"\)\}\s*<\/p>\s*<div className="grid [^"]*">\s*\{approchants\.map\(/;

test("la section des résultats a bien été isolée", () => {
  assert.ok(debut > 0 && SECTION.length > 2000, "section des résultats introuvable ou tronquée");
});

test("la grille des exacts est commandée par SA liste, jamais par les approchants", () => {
  assert.match(SECTION, GRILLE_EXACTS);
});

test("la grille des approchants est commandée par SA liste, et dit ce qu'elle est", () => {
  assert.match(SECTION, GRILLE_APPROCHANTS);
});

test("les exacts passent AVANT les approchants", () => {
  const exacts = SECTION.search(GRILLE_EXACTS);
  const approchants = SECTION.search(GRILLE_APPROCHANTS);
  assert.ok(exacts >= 0 && approchants > exacts, `ordre attendu exacts (${exacts}) < approchants (${approchants})`);
});

test("aucun ternaire sur les approchants n'exclut plus une grille ; l'état vide exige DEUX listes vides", () => {
  assert.doesNotMatch(SECTION, /approchants\.length > 0 \?/);
  assert.match(SECTION, /<\/h2>\s*\{approchants\.length === 0 && products\.length === 0 \? \(/);
});
