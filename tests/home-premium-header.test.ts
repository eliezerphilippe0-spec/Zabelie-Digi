import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Accueil premium, Phase 2 — l'en-tête compact (brief §4.1), tel que le code
 * le COMMANDE. Chaque assertion porte sur une condition ou une liaison.
 *
 * Mutations éprouvées :
 *   H1  `rayons.filter((r) => !r.vide)` → `rayons.filter(() => true)`   → rouge
 *   H2  `variant="header"` retiré de la SearchBox de l'en-tête          → rouge
 *   H3  `{desVides && (` → `{false && (`                                → rouge
 *   H4  lien « Aide » retiré du menu compte                             → rouge
 *   H5  `variant === "header" ? (` → `false ? (` dans SearchBox         → rouge
 *   H6  chips : `min-h-11` retiré                                       → rouge
 */

const NAV = readFileSync("components/site-nav.tsx", "utf8");
const CHIPS = readFileSync("components/category-chips.tsx", "utf8");
const SEARCH = readFileSync("components/search-box.tsx", "utf8");
const PAGE = readFileSync("app/page.tsx", "utf8");
const MENU = readFileSync("components/account-menu.tsx", "utf8");

function sansCommentaires(s: string): string {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

test("H1 — les chips ne montrent QUE les rayons non vides (la condition, pas le libellé)", () => {
  const src = sansCommentaires(CHIPS);
  assert.match(src, /const pleins = rayons\.filter\(\(r\) => !r\.vide\);/);
  assert.match(src, /\{pleins\.map\(\(r\) => \(/);
  // Et chaque chip porte l'icône du rayon, liée au slug du rayon.
  assert.match(src, /<DepartmentIcon slug=\{r\.slug\}/);
});

test("H2 — la recherche de l'en-tête est la variante loupe, une seule, sur toute la largeur", () => {
  const src = sansCommentaires(NAV);
  const occurrences = src.match(/<SearchBox\b/g) ?? [];
  assert.equal(occurrences.length, 1, "une seule SearchBox dans l'en-tête (plus de doublon desktop/mobile)");
  assert.match(src, /<SearchBox\s+compact\s+variant="header"/);
  // Plus de rangée « Catalogue · Talents · Aide » ni de topbar hors du menu.
  assert.doesNotMatch(src, /border-t border-line pt-2 md:hidden/);
  assert.doesNotMatch(src, /bg-ink\/95 backdrop-blur/);
});

test("H3 — « bientôt » ne s'affiche plus ; une ligne discrète ne vient QUE s'il reste des rayons vides", () => {
  const src = sansCommentaires(CHIPS);
  assert.match(src, /const desVides = rayons\.some\(\(r\) => r\.vide\);/);
  assert.match(src, /\{desVides && \(\s*<li[^>]*>\{labels\.more\}<\/li>/);
  assert.doesNotMatch(src, /labels\.empty|menu\.empty/);
  // Et l'accueil n'a plus son propre bandeau de catégories.
  assert.doesNotMatch(sansCommentaires(PAGE), /aria-label="Catégories"|catalogueCategories/);
});

test("H4 — Aide, Talents, langue, thème et déconnexion vivent dans le menu compte", () => {
  // ⚠️ L'index se calcule sur la MÊME chaîne que la coupe : le retrait des
  // commentaires décale les positions, et une coupe faite à l'index de
  // l'original tombait APRÈS le menu — assertion rouge sur un fichier juste.
  const nav = sansCommentaires(NAV);
  const menu = nav.slice(nav.indexOf("<AccountMenu"));
  for (const [href, cle] of [["/aide", "nav.help"], ["/#talents", "nav.talents"], ["/vendre", "topbar.sell"], ["/connexion", "nav.login"], ["/messages", "msg.title"]]) {
    assert.match(menu, new RegExp(`href="${href.replace(/[/#]/g, "\\$&")}"[^>]*>\\s*\\{t\\(lang, "${cle.replace(".", "\\.")}"\\)\\}`), `${href} manque au menu compte`);
  }
  assert.match(menu, /<LangToggle current=\{lang\} \/>/);
  assert.match(menu, /<ThemeToggle\s*\n\s*labelToLight=/);
  // Le menu est un <details> natif : zéro JavaScript pour s'ouvrir.
  assert.match(sansCommentaires(MENU), /<details className="relative">\s*<summary/);
});

test("H5 — la variante en-tête rend un bouton loupe avec le libellé en aria-label", () => {
  const src = sansCommentaires(SEARCH);
  assert.match(src, /\{variant === "header" \? \(\s*<button\s+type="submit"\s+aria-label=\{submitLabel\}/);
  assert.match(src, /variant === "header"\s*\?\s*"border-transparent bg-surface text-cloud/);
});

test("H6 — chips, panier, compte, loupe : des cibles tactiles de 44 px sur le chrome", () => {
  const chip = /<Link\s+href=\{r\.href\}\s+className="[^"]*\bmin-h-11\b[^"]*text-on-chrome/;
  assert.match(sansCommentaires(CHIPS), chip);
  assert.match(sansCommentaires(NAV), /href="\/panier"[\s\S]{0,200}?className="[^"]*\bmin-h-11 min-w-11\b/);
  assert.match(sansCommentaires(MENU), /<summary[\s\S]{0,120}?className="[^"]*\bmin-h-11 min-w-11\b/);
  assert.match(sansCommentaires(SEARCH), /aria-label=\{submitLabel\}[\s\S]{0,120}?className="[^"]*\bmin-h-11 min-w-11\b/);
});

test("H7 — les tokens du chrome existent, en clair ET en sombre, et le dégradé les référence", () => {
  const theme = readFileSync("app/zabelie-theme.css", "utf8");
  const coupe = theme.indexOf('[data-theme="dark"]');
  for (const part of [theme.slice(0, coupe), theme.slice(coupe)]) {
    for (const tok of ["--color-chrome:", "--color-chrome-2:", "--color-chrome-3:", "--color-on-chrome:"]) {
      assert.ok(part.includes(tok), `${tok} manque dans une des deux palettes`);
    }
  }
  assert.match(theme, /--brand-gradient: linear-gradient\(\s*135deg,\s*var\(--color-chrome-2\),\s*var\(--color-chrome-3\),\s*var\(--color-chrome\)\s*\)/);
  // Et la porte de contraste mesure on-chrome sur les trois arrêts.
  const script = readFileSync("scripts/zabelie-contrast.mjs", "utf8");
  assert.match(script, /for \(const arret of \["chrome", "chrome-2", "chrome-3"\]\)/);
});
