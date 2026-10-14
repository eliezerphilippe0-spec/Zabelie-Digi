import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ACCUEIL VIVANT (V-22, décision porteur du 2026-10-12) — l'exception au
 * « pas de décor, pas de micro-animation » ne vaut que sous ses conditions :
 *
 *  V1  le mouvement vit sous `prefers-reduced-motion: no-preference` et ses
 *      durées passent par les tokens (300 ms au plus, 0 ms en mouvement réduit) ;
 *  V2  l'apparition au défilement n'anime jamais l'opacité (axe-core mesure le
 *      contraste juste après `networkidle`, e2e/accessibilite.spec.ts) ;
 *  V3  le fondu de la bannière, qui porte du TEXTE, est fini en 500 ms ;
 *  V4  les décors ne s'affichent que là où ils disent vrai : la vitrine dans la
 *      bannière de LANCEMENT seulement, la boutique en préparation seulement sur
 *      un catalogue VIDE (jamais sur une erreur de chargement) ;
 *  V5  un décor n'est pas une offre : aucun texte, aucun prix, caché aux
 *      lecteurs d'écran.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (CLAUDE.md,
 * « un instrument non éprouvé ne prouve rien ») : voir la PR de V-22.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesCss = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");

const CSS = sansCommentairesCss(lire("app/home-vivant.css"));
const PAGE = lire("app/page.tsx");
const DECORS = lire("components/home-vivant.tsx");

/** Corps (accolades comprises) du premier bloc ouvert par `entete`. */
function bloc(src: string, entete: string): { debut: number; fin: number; corps: string } {
  const debut = src.indexOf(entete);
  assert.ok(debut >= 0, `bloc « ${entete} » introuvable`);
  let profondeur = 0;
  for (let i = src.indexOf("{", debut); i < src.length; i++) {
    if (src[i] === "{") profondeur++;
    else if (src[i] === "}" && --profondeur === 0) return { debut, fin: i, corps: src.slice(debut, i + 1) };
  }
  throw new Error(`bloc « ${entete} » non refermé`);
}

/** Corps d'un @keyframes nommé. */
function keyframes(nom: string): string {
  return bloc(CSS, `@keyframes ${nom}`).corps;
}

test("V1 — toute animation vit sous no-preference, et ses durées sont des tokens", () => {
  const np = bloc(CSS, "@media (prefers-reduced-motion: no-preference)");
  const animations = [...CSS.matchAll(/(?<![-\w])animation:\s*([^;]+);/g)];
  // Quatre : textes de la bannière, vitrine, tuiles, apparition au défilement.
  assert.ok(animations.length >= 4, `extraction suspecte : ${animations.length} animations lues`);
  for (const m of animations) {
    const i = m.index!;
    assert.ok(i > np.debut && i < np.fin, `animation hors de no-preference : « ${m[0]} »`);
    // Une animation au temps porte sa durée en token ; une animation au
    // défilement (`linear both` + animation-timeline) n'a pas de durée.
    if (!/^\w+ linear both$/.test(m[1].trim())) {
      assert.match(m[1], /^\w+ var\(--motion-(?:fast|base|slow)\) var\(--ease\)/, `durée hors token : « ${m[0]} »`);
    }
  }
  for (const m of CSS.matchAll(/(?<![-\w])transition:\s*([^;]+);/g)) {
    assert.ok(m.index! > np.debut && m.index! < np.fin, `transition hors de no-preference : « ${m[0]} »`);
    for (const partie of m[1].split(",")) {
      assert.match(partie.trim(), /^[a-z-]+ var\(--motion-(?:fast|base|slow)\)/, `durée de transition hors token : « ${partie.trim()} »`);
    }
  }
});

test("V2 — l'apparition au défilement n'anime que transform, jamais l'opacité", () => {
  const sup = bloc(CSS, "@supports (animation-timeline: view())").corps;
  const noms = [...sup.matchAll(/(?<![-\w])animation:\s*(\w+) linear both;/g)].map((m) => m[1]);
  assert.ok(noms.length >= 1, "aucune apparition au défilement lue — l'extraction a bougé");
  for (const nom of noms) {
    const k = keyframes(nom);
    assert.doesNotMatch(k, /opacity/, `@keyframes ${nom} anime l'opacité : un texte à demi transparent ferait tomber axe`);
    assert.match(k, /transform/);
  }
  assert.match(sup, /animation-timeline: view\(\);/);
});

test("V3 — le fondu de la bannière (du texte) est fini en 500 ms", () => {
  const delais = [...CSS.matchAll(/\.launch-hero \.home-hero-copy > :nth-child\(\d\) \{ animation-delay: (\d+)ms; \}/g)].map((m) => Number(m[1]));
  assert.ok(delais.length >= 3, `délais de la bannière introuvables (${delais.length})`);
  assert.match(CSS, /\.launch-hero \.home-hero-copy > \* \{ animation: zbReveal var\(--motion-slow\)/);
  // --motion-slow vaut 300 ms (tests/theme.test.ts, T8).
  assert.ok(Math.max(...delais) + 300 <= 500, `dernier texte visible à ${Math.max(...delais) + 300} ms`);
});

test("V4 — chaque décor ne s'affiche que là où il dit vrai", () => {
  // La vitrine : bannière de LANCEMENT seulement (catalogue chargé ET vide).
  assert.match(PAGE, /const opening = catalogue !== null && products\.length === 0;/);
  assert.equal((PAGE.match(/<HomeVitrine\b/g) ?? []).length, 1);
  assert.match(PAGE, /\{opening && <HomeVitrine \/>\}/);
  // La boutique en préparation : catalogue VIDE, jamais une erreur (null).
  assert.equal((PAGE.match(/<HomeChantier\b/g) ?? []).length, 1);
  assert.match(PAGE, /\{catalogue !== null && <HomeChantier \/>\}/);
});

test("V5 — un décor n'est pas une offre : aucun texte, aucun prix, caché aux lecteurs d'écran", () => {
  const code = DECORS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(code, /\bt\(|\btn\(|from "@\/lib\/i18n"/, "un décor ne porte aucun libellé");
  // `$` seul ne se cherche pas : les gabarits `${x}` du tracé SVG en portent
  // (« c0 ${l} » ressemble à « 0 $ »). Un prix, c'est HTG, gourde, ou $ + chiffre.
  assert.doesNotMatch(code, /\bHTG\b|gourdes?|US\$|\$\s?\d|<text\b/i, "un décor ne porte ni prix ni texte");
  // Aucun nœud texte JSX : rien entre une balise fermante et une ouvrante.
  assert.doesNotMatch(code, />\s*[\p{L}\p{N}][^<{]*</u, "texte visible dans un décor");
  for (const racine of ['className="home-vitrine"', 'className="home-chantier-art"']) {
    const i = code.indexOf(racine);
    assert.ok(i >= 0, `racine ${racine} introuvable`);
    assert.match(code.slice(i, i + 200), /aria-hidden="true"/, `${racine} doit être aria-hidden`);
  }
});
