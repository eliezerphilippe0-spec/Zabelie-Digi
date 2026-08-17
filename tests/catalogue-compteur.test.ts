import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CATALOGUE_PAGE_SIZE } from "../lib/products";
import { DICT } from "../lib/i18n";

/**
 * LE COMPTEUR DU CATALOGUE ET SON PIED DE PAGINATION (2026-08-17).
 *
 * Le seul écran du site qui SAVAIT paginer affichait un total faux : il
 * rendait `items.length`, c'est-à-dire la taille de la page — « 24 résultats »
 * que le catalogue en compte 24 ou 3 000. Un compteur plafonné à la taille de
 * page est faux dès la deuxième page, et c'est le seul chiffre par lequel un
 * acheteur juge si sa recherche a trouvé quelque chose.
 *
 * Et il n'y avait qu'un « Voir plus » : arrivé page 3, le visiteur ne savait
 * ni où il était, ni comment revenir.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PAGE = sansCommentaires(readFileSync("app/catalogue/page.tsx", "utf8"));
const LIB = sansCommentaires(readFileSync("lib/products.ts", "utf8"));

// ── Le total vient du COUNT, pas de la page ────────────────────────────────

test("le compteur affiché est le TOTAL, jamais la longueur de la page", () => {
  /* La liaison : `total` alimente le compteur. L'ancienne forme est interdite
   * explicitement — un `products.length` qui reviendrait ici ressusciterait
   * le défaut sans rien casser d'autre. */
  assert.match(PAGE, /\{totalExact \? total : `≥ \$\{total\}`\} \{t\(lang, "catalog\.results"\)\}/);
  assert.ok(
    !/\{products\.length\} \{t\(lang, "catalog\.results"\)\}/.test(PAGE),
    "l'ancien compteur plafonné doit avoir disparu"
  );
});

test("le COUNT est demandé dans la MÊME requête que la page", () => {
  /* Deux requêtes séparées, c'est deux jeux de filtres à garder synchronisés —
   * la divergence rendrait un compteur qui compte une autre population que
   * celle affichée. Ici c'est la même requête, par construction. */
  assert.match(
    LIB,
    /\.from\("products"\)\s*\n\s*\.select\(SELECT, \{ count: "exact" \}\)\s*\n\s*\.eq\("status", "published"\)/
  );
});

test("sans COUNT, le total SOUS-ESTIME et se dit inexact", () => {
  /* Un repli sur `items.length` serait le bug d'origine sous un autre nom.
   * Celui-ci rend ce qui a réellement été vu — pages précédentes comprises —
   * et le marque, pour que l'écran préfixe « ≥ ». */
  assert.match(LIB, /total: count \?\? offset \+ items\.length,\s*\n\s*totalExact: count != null,/);
});

test("le mode démo porte aussi un total, sinon la fixture mentirait", () => {
  assert.match(LIB, /total: all\.length,\s*\n\s*totalExact: true,/);
});

// ── Le pied de pagination ──────────────────────────────────────────────────

test("le nombre de pages se DÉDUIT du total — une seule source", () => {
  assert.match(PAGE, /const nbPages = Math\.max\(1, Math\.ceil\(total \/ CATALOGUE_PAGE_SIZE\)\)/);
  assert.equal(CATALOGUE_PAGE_SIZE, 24);
});

test("un catalogue vide reste « page 1 sur 1 », jamais « sur 0 »", () => {
  // C'est ce que `Math.max(1, …)` garantit ; on le vérifie sur le calcul.
  const nbPages = (total: number) => Math.max(1, Math.ceil(total / CATALOGUE_PAGE_SIZE));
  assert.equal(nbPages(0), 1);
  assert.equal(nbPages(1), 1);
  assert.equal(nbPages(CATALOGUE_PAGE_SIZE), 1, "24 produits tiennent en une page");
  assert.equal(nbPages(CATALOGUE_PAGE_SIZE + 1), 2, "le 25ᵉ ouvre la page 2");
});

test("le retour n'apparaît qu'à partir de la page 2, la suite qu'avec une suite", () => {
  /* Un « Précédent » sur la page 1 mène à la page 1 : un bouton qui ne fait
   * rien apprend au visiteur à ne plus lire les boutons. */
  assert.match(PAGE, /\{page > 1 \? \(\s*\n\s*<Link\s*\n\s*href=\{hrefFor\(\{ page: page - 1 \}\)\}/);
  assert.match(PAGE, /\{hasMore \? \(\s*\n\s*<Link\s*\n\s*href=\{hrefFor\(\{ page: page \+ 1 \}\)\}/);
  // Et le pied entier disparaît quand il n'y a rien à naviguer.
  assert.match(PAGE, /\{\(hasMore \|\| page > 1\) && \(/);
});

test("le repère de page porte les DEUX nombres, dans les quatre langues", () => {
  assert.match(PAGE, /\.replace\("\{n\}", String\(page\)\)\s*\n\s*\.replace\("\{total\}", String\(nbPages\)\)/);
  for (const l of ["fr", "ht", "en", "es"] as const) {
    const v = (DICT[l] as Record<string, string>)["catalog.pageOf"];
    assert.match(v, /\{n\}/, `${l} : marqueur {n} absent`);
    assert.match(v, /\{total\}/, `${l} : marqueur {total} absent`);
  }
});

test("les libellés du pied existent et diffèrent d'une langue à l'autre", () => {
  for (const cle of ["catalog.prev", "catalog.pageOf"]) {
    const vues = new Set(
      (["fr", "ht", "en", "es"] as const).map((l) => (DICT[l] as Record<string, string>)[cle])
    );
    assert.equal(vues.size, 4, `${cle} : ${vues.size} formulations pour 4 langues`);
  }
});

test("une page HORS LIMITES le dit, et laisse un chemin de retour", () => {
  /* ⚠️ Trouvé en PARCOURANT le catalogue, pas en le relisant.
   * `/catalogue?page=9` sur un catalogue de deux pages affichait « le
   * catalogue est encore vide » — FAUX, il y avait six produits — et sans
   * aucun moyen de revenir : le pied vivait dans la branche « il y a des
   * produits ». Un lien périmé suffisait à mettre le visiteur dans un
   * cul-de-sac qui lui disait en plus que la boutique n'avait rien à vendre.
   *
   * La liaison porte sur la CONDITION `page > 1`, pas sur la présence du
   * libellé : un message conservé mais rendu inatteignable laisserait
   * exactement le même texte dans le fichier. */
  assert.match(
    PAGE,
    /products\.length === 0 \? \(\s*\n\s*page > 1 \? \([\s\S]{0,900}catalog\.page404\.t/,
    "la branche hors-limites doit précéder les autres états vides"
  );
  assert.match(
    PAGE,
    /catalog\.page404\.b[\s\S]{0,400}href=\{hrefFor\(\{ page: 1 \}\)\}/,
    "le retour doit pointer la page 1, pas une URL figée"
  );
  for (const l of ["fr", "ht", "en", "es"] as const) {
    for (const k of ["catalog.page404.t", "catalog.page404.b", "catalog.page404.cta"]) {
      const v = (DICT[l] as Record<string, string>)[k];
      assert.ok(typeof v === "string" && v.trim(), `${k} absente en ${l}`);
    }
  }
});

test("les liens du pied respectent la cible tactile de 44 px", () => {
  const liens = [...PAGE.matchAll(/href=\{hrefFor\(\{ page: page [-+] 1 \}\)\}\s*\n\s*className="([^"]+)"/g)];
  assert.equal(liens.length, 2, "précédent et suivant");
  for (const l of liens) assert.match(l[1], /min-h-11/);
});
