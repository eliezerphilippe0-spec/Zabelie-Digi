import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { THEME_COOKIE, THEME_INIT_SCRIPT, readThemePreference, resolveTheme } from "../lib/theme";

const LAYOUT = readFileSync("app/layout.tsx", "utf8");
const THEME = readFileSync("app/zabelie-theme.css", "utf8");
const NAV = readFileSync("components/site-nav.tsx", "utf8");

test("T1 — les anciennes préférences restent valides, le défaut reste clair", () => {
  for (const value of [undefined, "", "invalid", "DARK"]) assert.equal(readThemePreference(value), "light");
  for (const value of ["light", "dark", "system"] as const) assert.equal(readThemePreference(value), value);
  assert.equal(THEME_COOKIE, "zab_theme");
  assert.match(LAYOUT, /readThemePreference\(\(await cookies\(\)\)\.get\(THEME_COOKIE\)\?\.value\)/);
  assert.match(LAYOUT, /<ThemeProvider initialPreference=\{preference\}>/);
});

test("T2 — seul Automatique suit le système", () => {
  for (const systemDark of [false, true]) {
    assert.equal(resolveTheme("light", systemDark), "light");
    assert.equal(resolveTheme("dark", systemDark), "dark");
    assert.equal(resolveTheme("system", systemDark), systemDark ? "dark" : "light");
  }
});

test("T3 — le script exécuté avant le contenu résout le système sans modifier un choix explicite", () => {
  assert.ok(LAYOUT.indexOf('__html: THEME_INIT_SCRIPT') < LAYOUT.indexOf('<body'));
  for (const preference of ["light", "dark", "system"] as const) {
    for (const systemDark of [false, true]) {
      const dataset = { themePreference: preference, theme: resolveTheme(preference, false) };
      runInNewContext(THEME_INIT_SCRIPT, {
        document: { documentElement: { dataset } },
        window: { matchMedia: (query: string) => {
          assert.equal(query, "(prefers-color-scheme: dark)");
          return { matches: systemDark };
        } },
      });
      assert.equal(dataset.theme, resolveTheme(preference, systemDark));
      assert.equal(dataset.themePreference, preference);
    }
  }
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

test("T6 — un seul sélecteur visible dans la barre, hors du menu compte, avec ses traductions", () => {
  assert.equal((NAV.match(/<ThemeToggle/g) ?? []).length, 1);
  assert.ok(NAV.indexOf("<ThemeToggle") < NAV.indexOf("<AccountMenu"));
  for (const key of ["label", "light", "dark", "system"]) assert.ok(NAV.includes(`t(lang, "nav.theme.${key}")`));
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
