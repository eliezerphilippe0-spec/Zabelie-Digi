import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { surCheminArgent } from "./helpers/chemin-argent";

/**
 * BOUTONS : TROIS VARIANTES, TROIS TAILLES, CINQ ÉTATS — chantier design,
 * Phase 2.1 (`docs/design/PHASE-2.md`).
 *
 * Avant : 97 écritures différentes pour 119 fonds orange, des contours en
 * `--line` invisibles au soleil (1,2:1), « Retire » du panier à 30 px de haut,
 * et `.editorial-button` en Inter sur le premier bouton du site. Le dessin vit
 * désormais dans `app/globals.css` (`@layer components`), une seule fois.
 *
 * Ce fichier tient les deux bouts : ce que la feuille DÉCLARE (tailles,
 * variantes, états), et que les fichiers l'EMPLOIENT au lieu de réécrire un
 * bouton à la main. Le chemin de l'argent n'est pas modifié par ce chantier
 * (`tests/helpers/chemin-argent.ts`) : il suit le thème sans être touché.
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
const HORS_ARGENT = SOURCES.filter((f) => !surCheminArgent(f));

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ");
const CSS = sansCommentaires(lire("app/globals.css"));

/** Corps de la règle dont la liste de sélecteurs contient EXACTEMENT `sel`. */
function regle(sel: string): string {
  const corps = [...CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, s]) => s.split(",").map((x) => x.trim()).includes(sel))
    .map(([, , c]) => c);
  assert.ok(corps.length > 0, `aucune règle pour « ${sel} » dans app/globals.css`);
  return corps.join(";");
}
const decl = (corps: string, prop: string) => new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(corps)?.[1].trim() ?? null;

/** Chaînes de classes littérales d'un fichier : "…" et `…`. */
const litteraux = (src: string) =>
  [...src.matchAll(/"([^"\n]*)"|`([^`]*)`/g)].map((m) => ({ c: m[1] ?? m[2], i: m.index ?? 0 }));

/** Un bouton à fond orange écrit à la main : la forme que la classe remplace. */
const PRIMAIRE_A_LA_MAIN = (c: string) =>
  /(?<![\w:/-])bg-brand(?![\w/-])/.test(c) &&
  /(?<![\w:/-])text-on-brand(?![\w/-])/.test(c) &&
  /(?<![\w:/-])rounded-(?:xl|lg)(?![\w-])/.test(c) &&
  /(?<![\w:/-])px-\d/.test(c);
const VARIANTE = /(?<![\w-])bouton-(?:primaire|secondaire|texte)(?![\w-])/;
const BASE = /(?<![\w-])bouton(?![\w-])/;

test("V0 — les détecteurs discriminent", () => {
  assert.ok(PRIMAIRE_A_LA_MAIN("inline-flex min-h-11 rounded-xl bg-brand px-5 text-on-brand"));
  assert.ok(PRIMAIRE_A_LA_MAIN("rounded-lg bg-brand px-3 py-1.5 text-xs text-on-brand"));
  assert.ok(!PRIMAIRE_A_LA_MAIN("rounded-full bg-brand px-2 text-on-brand"), "une pastille n'est pas un bouton");
  assert.ok(!PRIMAIRE_A_LA_MAIN("bouton bouton-primaire mt-4"));
  assert.ok(!PRIMAIRE_A_LA_MAIN("rounded-xl bg-brand/10 px-4 text-on-brand"), "un fond teinté n'est pas un CTA");
  assert.ok(VARIANTE.test("bouton bouton-secondaire") && !VARIANTE.test("bouton bouton-compact"));
  assert.ok(BASE.test("bouton bouton-primaire") && !BASE.test("bouton-primaire mt-2"));
});

test("V1 — trois tailles, aucune sous 44 px", () => {
  assert.equal(decl(regle(".bouton"), "min-height"), "--spacing(12)", "48 px par défaut : la hauteur d'un champ");
  assert.equal(decl(regle(".bouton-compact"), "min-height"), "--spacing(11)", "44 px, le plancher tactile");
  assert.equal(decl(regle(".bouton-grand"), "min-height"), "--spacing(14)", "56 px pour l'action principale d'une page");
  // Aucune règle de bouton ne descend sous le plancher, ni en px ni en rem.
  for (const [, sel, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.bouton/.test(sel)) continue;
    for (const m of corps.matchAll(/min-height\s*:\s*([^;]+)/g)) {
      const v = m[1].trim();
      const n = /--spacing\((\d+(?:\.\d+)?)\)/.exec(v)?.[1];
      assert.ok(n !== undefined && Number(n) >= 11, `« ${sel.trim()} » : min-height ${v}, sous 44 px ou hors échelle`);
    }
  }
});

test("V2 — trois variantes, chacune sur ses tokens", () => {
  const p = regle(".bouton-primaire");
  assert.equal(decl(p, "background-color"), "var(--color-brand)");
  assert.equal(decl(p, "color"), "var(--color-on-brand)");
  const s = regle(".bouton-secondaire");
  assert.equal(decl(s, "border-color"), "var(--color-contour)", "un contour en `--line` ne se voit pas au soleil (1,2:1)");
  assert.equal(decl(s, "color"), "var(--color-cloud)");
  const t = regle(".bouton-texte");
  assert.equal(decl(t, "text-decoration"), "underline", "le bouton-texte ne repose pas sur la seule couleur");
  assert.equal(decl(t, "color"), "var(--color-accent)");
  assert.match(lire("app/zabelie-theme.css"), /--color-contour: #[0-9a-f]{6};[\s\S]*\[data-theme="dark"\][\s\S]*--color-contour: #[0-9a-f]{6};/,
    "le contour a sa valeur claire ET sa valeur sombre (V-25 A4)");
});

test("V3 — survol, appui, désactivé, chargement ; on n'anime que transform et opacity", () => {
  assert.match(CSS, /@media \(hover: hover\) \{[^@]*\.bouton-primaire:hover/, "le survol vit sous `(hover: hover)` : collé après un tap sinon");
  assert.equal(decl(regle(".bouton:active"), "transform"), "scale(0.97)");
  const off = regle(".bouton:disabled");
  assert.equal(decl(off, "opacity"), "0.6");
  assert.equal(decl(off, "cursor"), "not-allowed");
  assert.ok(regle(".bouton[aria-disabled=\"true\"]"));
  assert.equal(decl(regle(".bouton[aria-busy=\"true\"]"), "opacity"), "1", "en chargement, le bouton garde son contraste");
  assert.match(decl(regle(".bouton[aria-busy=\"true\"]::after"), "animation") ?? "", /var\(--motion-slow\)/,
    "le battement suit le jeton de 300 ms, qui vaut 0 sous mouvement réduit");
  // Toute transition posée sur un bouton ne porte que transform et opacity.
  let vues = 0;
  for (const [, sel, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.bouton/.test(sel)) continue;
    for (const m of corps.matchAll(/transition\s*:\s*([^;]+)/g)) {
      vues++;
      for (const part of m[1].split(",")) {
        const prop = part.trim().split(/\s+/)[0];
        assert.ok(prop === "transform" || prop === "opacity", `« ${sel.trim()} » anime « ${prop} » : le brief n'anime que transform et opacity`);
      }
    }
  }
  assert.ok(vues >= 1, "aucune transition de bouton lue : le contrôle est devenu aveugle");
});

test("V4 — hors chemin de l'argent, aucun bouton orange écrit à la main", () => {
  const fautes: string[] = [];
  for (const f of HORS_ARGENT) {
    const src = lire(f);
    for (const { c, i } of litteraux(src)) {
      if (PRIMAIRE_A_LA_MAIN(c)) fautes.push(`${f}:${src.slice(0, i).split("\n").length}  « ${c.slice(0, 80)} »`);
    }
  }
  assert.deepEqual(fautes, [], "Écrivez `bouton bouton-primaire` (et une taille si besoin) :\n  " + fautes.join("\n  "));
  // Témoin : le chemin de l'argent, lui, en porte encore. S'il n'en porte plus,
  // le détecteur est devenu aveugle — ou la Phase 4 est passée, et ce témoin
  // se met à jour avec elle.
  const temoins = SOURCES.filter((f) => surCheminArgent(f) && litteraux(lire(f)).some(({ c }) => PRIMAIRE_A_LA_MAIN(c)));
  assert.ok(temoins.length >= 5, `seulement ${temoins.length} fichier(s) du chemin de l'argent vu(s) avec un bouton à la main`);
});

/** Un bouton à contour écrit à la main : rayon de bouton, bordure, rembourrage, hauteur. */
const CONTOUR_A_LA_MAIN = (c: string) =>
  !VARIANTE.test(c) &&
  /(?<![\w:-])rounded-(?:xl|lg)(?![\w-])/.test(c) &&
  /(?<![\w:-])border(?![\w-])/.test(c) &&
  /(?<![\w:-])px-\d/.test(c) &&
  /(?<![\w:-])(?:min-h-11|py-[\d.]+)(?![\w-])/.test(c) &&
  !/(?<![\w:-])p-\d/.test(c);
/** L'élément qui porte la chaîne : le dernier `<balise` ouvert avant elle. */
const balise = (src: string, i: number) => [...src.slice(Math.max(0, i - 600), i).matchAll(/<(\w+)[\s>]/g)].pop()?.[1];

test("V7 — hors chemin de l'argent, aucun bouton à contour écrit à la main", () => {
  assert.ok(CONTOUR_A_LA_MAIN("min-h-11 rounded-xl border border-line px-4 text-sm"));
  assert.ok(CONTOUR_A_LA_MAIN("rounded-lg border border-line px-3 py-1.5 text-xs"), "« Retire », 30 px avant la Phase 2");
  assert.ok(!CONTOUR_A_LA_MAIN("bouton bouton-secondaire bouton-compact"));
  assert.ok(!CONTOUR_A_LA_MAIN("rounded-xl border border-line p-4"), "un encadré n'est pas un bouton");
  // Balise lue sur la CHAÎNE, pas sur la balise entière : un `onClick={() => …}`
  // posé avant `className` coupait la balise au `>` de la flèche, et 40 boutons
  // échappaient ainsi à la première passe (mesuré le 2026-11-07).
  const fautes: string[] = [];
  for (const f of HORS_ARGENT) {
    const src = lire(f);
    for (const m of src.matchAll(/className="([^"\n]*)"/g)) {
      const el = balise(src, m.index ?? 0);
      if (!["button", "Link", "a", "label"].includes(el ?? "")) continue;
      if (CONTOUR_A_LA_MAIN(m[1])) fautes.push(`${f}:${src.slice(0, m.index).split("\n").length} <${el}> « ${m[1].slice(0, 70)} »`);
    }
  }
  assert.deepEqual(fautes, [], "Écrivez `bouton bouton-secondaire` (et `bouton-compact` dans une liste) :\n  " + fautes.join("\n  "));

  // Une QUATRIÈME variante, à fond sombre (`bg-cloud text-ink`), vivait sur
  // trois boutons, dont « Déclarer l'envoi » à 32 px. Le brief en veut trois.
  const SOMBRE = (c: string) => !VARIANTE.test(c) && /(?<![\w:-])bg-(?:cloud|ink|chrome)(?![\w/-])/.test(c) && /(?<![\w:-])rounded-(?:xl|lg)(?![\w-])/.test(c) && /(?<![\w:-])px-\d/.test(c);
  assert.ok(SOMBRE("min-h-11 rounded-xl bg-cloud px-5 py-3 text-ink") && !SOMBRE("rounded-full bg-chrome/80 px-2"));
  const sombres: string[] = [];
  for (const f of HORS_ARGENT) {
    const src = lire(f);
    for (const m of src.matchAll(/className="([^"\n]*)"/g)) {
      if (["button", "Link", "a"].includes(balise(src, m.index ?? 0) ?? "") && SOMBRE(m[1])) sombres.push(`${f}:${src.slice(0, m.index).split("\n").length}`);
    }
  }
  assert.deepEqual(sombres, [], "Bouton à fond sombre écrit à la main : prenez une des trois variantes :\n  " + sombres.join("\n  "));
});

test("V5 — une variante ne s'écrit jamais sans `bouton`", () => {
  const fautes: string[] = [];
  let vues = 0;
  for (const f of HORS_ARGENT) {
    const src = lire(f);
    // Les constantes du fichier qui portent la base : `${bouton} bouton-primaire`.
    const basesComposees = [...src.matchAll(/const\s+(\w+)\s*=\s*[`"]([^`"]*)[`"]/g)].filter(([, , v]) => BASE.test(v)).map(([, n]) => n);
    for (const { c, i } of litteraux(src)) {
      if (!VARIANTE.test(c)) continue;
      vues++;
      const compose = basesComposees.some((n) => c.includes("${" + n + "}"));
      if (!BASE.test(c) && !compose) fautes.push(`${f}:${src.slice(0, i).split("\n").length}  « ${c.slice(0, 80)} »`);
    }
  }
  assert.ok(vues >= 140, `seulement ${vues} variantes vues : le motif est devenu aveugle`);
  assert.deepEqual(fautes, [], "Variante sans la classe de base `bouton` (forme, taille, états) :\n  " + fautes.join("\n  "));
});

test("V6 — `.editorial-button` n'existe plus, et chaque taille et variante sert", () => {
  for (const f of ["app/globals.css", "app/editorial-marketplace.css", "app/home-discovery.css", ...SOURCES]) {
    const src = f.endsWith(".css") ? sansCommentaires(lire(f)) : lire(f);
    assert.ok(!/editorial-button/.test(src), `${f} : \`.editorial-button\` est absorbé par \`bouton bouton-primaire\``);
  }
  const tout = HORS_ARGENT.map(lire).join("\n");
  for (const cls of ["bouton-primaire", "bouton-secondaire", "bouton-texte", "bouton-compact", "bouton-grand"]) {
    assert.ok(new RegExp(`(?<![\\w-])${cls}(?![\\w-])`).test(tout), `\`.${cls}\` n'a aucun emploi : une classe sans appelant`);
  }
});
