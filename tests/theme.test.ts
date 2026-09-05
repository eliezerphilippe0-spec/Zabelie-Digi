import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEME_COOKIE } from "../components/theme-toggle";

/**
 * Mode clair / sombre — ce qui doit rester vrai.
 *
 * Depuis la Phase 1 de l'accueil premium (2026-09-04, docs/02 V-20), le CLAIR
 * est le défaut et le SOMBRE un choix explicite — l'inverse du 2026-08-15. Le
 * thème est décidé au RENDU SERVEUR par le cookie : aucun flash de mauvais
 * thème. `--color-on-brand` ne bascule jamais — c'est le texte posé sur
 * l'orange, l'encre indigo dans les deux mondes (blanc sur orange = 2,66:1).
 *
 * Mutations éprouvées : `=== "dark" ? "dark" : "light"` → `"light" : "dark"`
 * rougit T1 ; `--color-on-brand` recopié dans le bloc sombre rougit T4 ; un
 * token ajouté au bloc sombre sans base claire rougit T5.
 */

const LAYOUT = readFileSync("app/layout.tsx", "utf8");
const THEME = readFileSync("app/zabelie-theme.css", "utf8");
const TOGGLE = readFileSync("components/theme-toggle.tsx", "utf8");
const NAV = readFileSync("components/site-nav.tsx", "utf8");

test("T1 — layout : le cookie COMMANDE data-theme, au rendu serveur, et le CLAIR est le défaut", () => {
  // La liaison : la valeur lue du cookie décide, et toute autre valeur rend
  // le clair — le sombre est un choix explicite, jamais un défaut.
  assert.match(
    LAYOUT,
    /cookies\(\)\)\.get\("zab_theme"\)\?\.value === "dark" \? "dark" : "light"/
  );
  assert.match(LAYOUT, /<html lang=\{lang\} data-theme=\{theme\}/);
});

test("T2 — le nom du cookie n'a pas divergé entre le toggle et le layout", () => {
  assert.equal(THEME_COOKIE, "zab_theme");
  assert.match(LAYOUT, /get\("zab_theme"\)/);
});

test("T3 — toggle : un clic pose L'ATTRIBUT ET LE COOKIE — jamais l'un sans l'autre", () => {
  // L'attribut seul : le prochain rendu serveur reviendrait au défaut.
  // Le cookie seul : rien ne change à l'écran avant navigation.
  assert.match(
    TOGGLE,
    /document\.documentElement\.dataset\.theme = prochain;\s*\n\s*document\.cookie = `\$\{THEME_COOKIE\}=\$\{prochain\}/
  );
});

test("T4 — on-brand ne bascule JAMAIS : présent dans @theme, absent du bloc sombre", () => {
  const coupe = THEME.indexOf('[data-theme="dark"]');
  assert.ok(coupe > 0, "le bloc sombre doit exister");
  assert.match(THEME.slice(0, coupe), /--color-on-brand: #17123a/);
  assert.ok(
    !THEME.slice(coupe).includes("--color-on-brand"),
    "on-brand redéfini en sombre : le texte sur orange deviendrait illisible dans un des deux thèmes"
  );
});

test("T5 — le bloc sombre redéfinit des tokens que le clair pose — pas d'orphelin", () => {
  /* Un token présent en sombre mais absent du clair serait invisible en mode
   * clair ; l'inverse (clair sans sombre) est LÉGITIME — le sombre hérite.
   * On vérifie donc une seule direction. */
  const coupe = THEME.indexOf('[data-theme="dark"]');
  const clairs = new Set(
    [...THEME.slice(0, coupe).matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])
  );
  const sombres = [...THEME.slice(coupe).matchAll(/--color-([a-z0-9-]+):/g)].map(
    (m) => m[1]
  );
  assert.ok(sombres.length >= 10, "le bloc sombre doit redéfinir la palette, pas trois tokens");
  for (const t of sombres) {
    assert.ok(clairs.has(t), `--color-${t} défini en sombre mais pas en clair`);
  }
});

test("T6 — la bascule est montée dans la barre, avec ses libellés i18n", () => {
  assert.match(NAV, /<ThemeToggle\s*\n\s*labelToLight=\{t\(lang, "nav\.theme\.light"\)\}/);
});

test("T7 — color-scheme suit le thème — champs natifs et ascenseurs compris", () => {
  assert.match(THEME, /\[data-theme="dark"\][\s\S]{0,80}color-scheme: dark/);
  assert.match(THEME, /:root:not\(\[data-theme="dark"\]\)[\s\S]{0,40}color-scheme: light/);
});

test("T8 — les tokens de mouvement existent et tombent à zéro en mouvement réduit", () => {
  // Brief accueil premium §3.3 : quatre tokens, aucune durée au-delà de 300 ms,
  // et `prefers-reduced-motion: reduce` met TOUT à zéro par les tokens.
  for (const t of ["--motion-fast: 120ms", "--motion-base: 200ms", "--motion-slow: 300ms", "--ease: cubic-bezier(0.2, 0, 0, 1)"]) {
    assert.ok(THEME.includes(t), `${t} absent du thème`);
  }
  assert.match(
    THEME,
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{[^}]*--motion-fast: 0ms;[^}]*--motion-base: 0ms;[^}]*--motion-slow: 0ms;/
  );
  // Et globals.css n'a plus de durée en dur au-dessus de la borne.
  const G = readFileSync("app/globals.css", "utf8");
  const durees = [...G.matchAll(/animation:[^;]*?(\d{3,4})ms/g)].map((m) => Number(m[1]));
  assert.deepEqual(durees.filter((d) => d > 300), [], `durée(s) > 300 ms en dur : ${durees}`);
});
