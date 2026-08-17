import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { THEME_COOKIE } from "../components/theme-toggle";

/**
 * Mode sombre / clair (2026-08-15) — ce qui doit rester vrai.
 *
 * Le thème est décidé au RENDU SERVEUR par le cookie : aucun flash de
 * mauvais thème. `--color-on-brand` ne bascule jamais — c'est le texte posé
 * sur l'orange, sombre dans les deux mondes (blanc sur orange = 2,66:1).
 */

const LAYOUT = readFileSync("app/layout.tsx", "utf8");
const THEME = readFileSync("app/zabelie-theme.css", "utf8");
const TOGGLE = readFileSync("components/theme-toggle.tsx", "utf8");
const NAV = readFileSync("components/site-nav.tsx", "utf8");

test("layout : le cookie COMMANDE data-theme, au rendu serveur", () => {
  // La liaison : la valeur lue du cookie décide, et toute autre valeur rend
  // le sombre — le clair est un choix explicite, jamais un défaut.
  assert.match(
    LAYOUT,
    /cookies\(\)\)\.get\("zab_theme"\)\?\.value === "light" \? "light" : "dark"/
  );
  assert.match(LAYOUT, /<html lang=\{lang\} data-theme=\{theme\}/);
});

test("le nom du cookie n'a pas divergé entre le toggle et le layout", () => {
  assert.equal(THEME_COOKIE, "zab_theme");
  assert.match(LAYOUT, /get\("zab_theme"\)/);
});

test("toggle : un clic pose L'ATTRIBUT ET LE COOKIE — jamais l'un sans l'autre", () => {
  // L'attribut seul : le prochain rendu serveur reviendrait au sombre.
  // Le cookie seul : rien ne change à l'écran avant navigation.
  assert.match(
    TOGGLE,
    /document\.documentElement\.dataset\.theme = prochain;\s*\n\s*document\.cookie = `\$\{THEME_COOKIE\}=\$\{prochain\}/
  );
});

test("on-brand ne bascule JAMAIS : absent du bloc clair, présent dans @theme", () => {
  const coupe = THEME.indexOf('[data-theme="light"]');
  assert.ok(coupe > 0, "le bloc clair doit exister");
  assert.match(THEME.slice(0, coupe), /--color-on-brand: #0a0a0a/);
  assert.ok(
    !THEME.slice(coupe).includes("--color-on-brand"),
    "on-brand redéfini en clair : le texte sur orange deviendrait illisible dans un des deux thèmes"
  );
});

test("le bloc clair redéfinit les tokens que le sombre pose — pas d'orphelin", () => {
  /* Un token présent en clair mais absent du sombre serait invisible en mode
   * sombre ; l'inverse (sombre sans clair) est LÉGITIME — le clair hérite.
   * On vérifie donc une seule direction. */
  const coupe = THEME.indexOf('[data-theme="light"]');
  const sombres = new Set(
    [...THEME.slice(0, coupe).matchAll(/--color-([a-z0-9-]+):/g)].map((m) => m[1])
  );
  const clairs = [...THEME.slice(coupe).matchAll(/--color-([a-z0-9-]+):/g)].map(
    (m) => m[1]
  );
  for (const t of clairs) {
    assert.ok(sombres.has(t), `--color-${t} défini en clair mais pas en sombre`);
  }
});

test("la bascule est montée dans la barre, avec ses libellés i18n", () => {
  assert.match(NAV, /<ThemeToggle\s*\n\s*labelToLight=\{t\(lang, "nav\.theme\.light"\)\}/);
});

test("color-scheme suit le thème — champs natifs et ascenseurs compris", () => {
  assert.match(THEME, /\[data-theme="light"\][\s\S]{0,80}color-scheme: light/);
  assert.match(THEME, /:root:not\(\[data-theme="light"\]\)[\s\S]{0,40}color-scheme: dark/);
});
