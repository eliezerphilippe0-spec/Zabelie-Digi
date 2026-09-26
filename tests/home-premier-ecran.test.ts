import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * PREMIER ÉCRAN DE L'ACCUEIL, MOBILE — critère A1 du brief (`docs/home-premium/RAPPORT.md`).
 *
 * Mesuré le 2026-09-26, jeu d'essai à 12 cartes : la première carte produit
 * commençait à y = 1 055 en 375 × 812 — en-tête, état des paiements, bannière
 * avec carte vedette, barre de confiance et « Eksplore òf yo » passaient devant.
 * Sur mobile, trois blocs marqués `.home-premier-ecran` (état des paiements,
 * bannière, première rangée) passent devant le reste. L'ordre du DOCUMENT ne
 * bouge pas (lecteurs d'écran, ordinateur, test S8).
 *
 * ⚠️ La carte vedette n'est PAS masquée. Une première version le faisait, en
 * la croyant redondante avec la rangée : c'était faux — `allocateHomeRows`
 * l'exclut de toutes les rangées. Masquée, ce produit disparaissait de
 * l'accueil mobile ; c'est l'e2e `decouverte-sans-doublons` qui l'a révélé.
 */

const page = readFileSync("app/page.tsx", "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const css = readFileSync("app/home-discovery.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Le corps du bloc `@media (max-width: 767px) { … }`, accolades équilibrées. */
function mobile(): string {
  const i = css.indexOf("@media (max-width: 767px)");
  assert.ok(i >= 0, "la requête mobile de l'accueil a disparu");
  let j = css.indexOf("{", i) + 1;
  const debut = j;
  for (let prof = 1; prof > 0; j++) prof += css[j] === "{" ? 1 : css[j] === "}" ? -1 : 0;
  return css.slice(debut, j - 1);
}

test("P1 — les trois blocs du premier écran sont marqués, et eux seuls", () => {
  assert.match(page, /<main id="main">/, "la cible du lien d'évitement reste intacte (S5)");
  assert.match(page, /<div className="home-premier-ecran"><MarketplaceStatus lang=\{lang\} \/><\/div>/);
  assert.match(page, /<section className="home-premier-ecran mx-auto[^"]*">\s*<div\s+data-has-featured/);
  assert.match(page, /<div className="home-premier-ecran">\s*<HomeRow primary /, "la PREMIÈRE rangée doit être dans le bloc remonté");
  assert.equal((page.match(/home-premier-ecran/g) ?? []).length, 3, "trois blocs remontés, pas un de plus");
});

test("P2 — les règles qui remontent la rangée vivent DANS la requête mobile (l'ordinateur ne bouge pas)", () => {
  const m = mobile();
  assert.match(m, /\.home-discovery #main\s*\{\s*display:\s*flex;\s*flex-direction:\s*column;\s*\}/);
  assert.match(m, /\.home-discovery #main > \*\s*\{\s*width:\s*100%;\s*\}/, "sans largeur, un `mx-auto` en colonne flex se réduit à son contenu");
  assert.match(m, /\.home-discovery #main > \.home-premier-ecran\s*\{\s*order:\s*-1;\s*\}/);
  const horsMobile = css.replace(m, "");
  assert.doesNotMatch(horsMobile, /\.home-premier-ecran|#main\b/, "une règle du premier écran hors de la requête mobile toucherait l'ordinateur");
});

test("P3 — la carte vedette n'est masquée nulle part : son produit n'est dans aucune rangée", () => {
  const src = readFileSync("app/page.tsx", "utf8");
  assert.match(src, /allocateHomeRows\([\s\S]{0,900}\], featured \? \[featured\.id\] : \[\]\)/, "le produit vedette est exclu des rangées");
  assert.doesNotMatch(css, /\.home-featured[^{]*\{[^}]*display:\s*none/, "masquer la carte vedette retirerait son produit de l'accueil");
});

test("P4 — l'en-tête compact ne vise que l'accueil, et seulement sur mobile (A2)", () => {
  const m = mobile();
  // La barre de rubriques de l'accueil prend l'état « défilé » dès le chargement…
  assert.match(m, /\.home-discovery > header nav\.header-fold\s*\{\s*display:\s*none;\s*\}/);
  assert.match(m, /\.home-discovery > header \.marketplace-header-row\s*\{\s*row-gap:\s*4px;\s*padding-block:\s*4px;\s*\}/);
  // … sans toucher au logo (même classe `header-fold`, mais pas un `nav`) :
  assert.doesNotMatch(css, /\.home-discovery > header \.header-fold\b/, "masquer `.header-fold` sans `nav` retirerait aussi le logo");
  // … ni aux autres pages, ni à l'ordinateur :
  assert.doesNotMatch(css.replace(m, ""), /> header/, "une règle d'en-tête hors de la requête mobile toucherait l'ordinateur");
  const pages = readFileSync("app/page.tsx", "utf8");
  assert.match(pages, /className="bg-grain home-discovery editorial-page"/, "le sélecteur `.home-discovery` n'est porté que par l'accueil");
});
