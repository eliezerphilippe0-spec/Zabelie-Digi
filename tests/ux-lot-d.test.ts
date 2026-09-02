import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LOT D DE L'AUDIT UX (2026-09-02) — le système.
 *
 * Mécanique, et volontairement : chacun de ces points a été trouvé par un
 * comptage, il se garde par un comptage. Un rayon hors échelle, un
 * `min-h-screen` qui saute sur iOS, un <main> sans id que le lien
 * d'évitement ne trouve pas — aucun ne casse rien, tous se voient.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const rel = `${dir}/${e}`;
    if (statSync(join(RACINE, rel)).isDirectory()) tsx(rel, acc);
    else if (e.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
}
const SOURCES = [...tsx("app"), ...tsx("components")];

test("UD1 — rayons : aucun cran hors échelle (md, sm, arbitraire)", () => {
  // Exception unique, documentée dans le thème : le drapeau haïtien (glyphe
  // 24 × 16, `aria-label="Haïti"`) garde `rounded-[3px]`. La ligne qui porte
  // l'aria-label est la seule tolérée — pas le fichier entier.
  /* ⚠️ Réécrit après une mutation VERTE : `rounded-[7px]` sur la carte produit
   * passait. La première forme, /\brounded-(md|sm|\[[^\]]+\])\b/, exigeait
   * une frontière de mot APRÈS `]` — or `]` suivi d'un espace, ce sont deux
   * non-mots côte à côte : pas de frontière, pas de correspondance. Le `\b`
   * ne sait pas où finit un crochet. Les deux formes sont séparées : les
   * crans nommés se terminent par (?![\w-]), le cran arbitraire par `]`. */
  const HORS_ECHELLE = /\brounded-(?:md|sm)(?![\w-])|\brounded-\[[^\]]+\]/;
  const fautifs = SOURCES.filter((f) =>
    lire(f)
      .split("\n")
      .some((l) => HORS_ECHELLE.test(l) && !/aria-label="Haïti"/.test(l))
  );
  assert.deepEqual(fautifs, [], "rayons hors de l'échelle documentée dans zabelie-theme.css");
  assert.match(lire("app/zabelie-theme.css"), /RÈGLE DES RAYONS[\s\S]{0,900}rounded-full\s+pills/, "la règle doit être écrite dans le thème");
});

test("UD2 — plus aucun min-h-screen : min-h-dvh, stable sous la barre iOS", () => {
  const fautifs = SOURCES.filter((f) => /\bmin-h-screen\b/.test(lire(f)));
  assert.deepEqual(fautifs, []);
  assert.ok(SOURCES.some((f) => /\bmin-h-dvh\b/.test(lire(f))), "min-h-dvh doit être utilisé quelque part");
});

test("UD3 — lien d'évitement : présent, traduit, et sa cible existe sur chaque <main>", () => {
  const nav = lire("components/site-nav.tsx");
  assert.match(nav, /<a\s+href="#main"\s+className="sr-only focus:not-sr-only[^"]*"\s*>\s*\{t\(lang, "a11y\.skip"\)\}/);
  // Liaison : chaque <main> porte id="main" — sinon le lien tombe dans le vide.
  // Les commentaires sont retirés d'abord : « le <main> de la page » dans une
  // explication n'est pas une balise (rouge sur le fichier réel, corrigé ici
  // et non par une exemption).
  const sansCommentaires = (s: string) =>
    s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");
  const mains = SOURCES.flatMap((f) =>
    (sansCommentaires(lire(f)).match(/<main\b[^>]*>/g) ?? []).map((m) => `${f}: ${m.slice(0, 60)}`)
  );
  const sansId = mains.filter((m) => !/id="main"/.test(m));
  assert.ok(mains.length >= 20, `${mains.length} <main> trouvés — la mesure suppose le vrai dépôt`);
  assert.deepEqual(sansId, [], "<main> sans id=\"main\" : le lien d'évitement n'y arrive pas");
  const i18n = lire("lib/i18n.ts");
  assert.equal((i18n.match(/^\s*"a11y\.skip": /gm) ?? []).length, 4, "a11y.skip dans les quatre langues");
});

test("UD4 — .glass : fond plein par défaut, flou uniquement sous @media (hover: hover)", () => {
  const css = lire("app/globals.css");
  const iGlass = css.indexOf(".glass {");
  const iMedia = css.indexOf("@media (hover: hover) and (min-width: 768px)");
  assert.ok(iGlass > 0 && iMedia > iGlass, "la règle de base précède la media query");
  const base = css.slice(iGlass, iMedia);
  assert.doesNotMatch(base, /backdrop-filter/, "aucun flou dans la règle de base");
  assert.match(css.slice(iMedia), /\.glass\s*\{[^}]*backdrop-filter:\s*blur\(14px\)/);
});

test("UD5 — les alias de palette morts ne sont plus utilisés dans l'interface", () => {
  const fautifs = SOURCES.filter((f) =>
    /\b(?:text|border|bg|from|to|via|ring|stroke|fill|hover:bg|hover:text|hover:border|focus:border)-(?:gold|amber|violet|teal|magenta)\b/.test(lire(f))
  );
  assert.deepEqual(fautifs, [], "alias gold/amber/violet/teal/magenta : utiliser accent / success / danger");
  // Et les tokens eux-mêmes ont quitté le thème — dans les DEUX palettes.
  assert.doesNotMatch(
    lire("app/zabelie-theme.css"),
    /^\s*--color-(gold|amber|violet|teal|magenta|accent-gold):/m,
    "un alias mort est revenu dans zabelie-theme.css"
  );
});
