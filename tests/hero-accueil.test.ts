import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DICT } from "../lib/i18n";
import { preuveVendeurs, SEUIL_VENDEURS } from "../lib/home-sections";
import { TitreAccent } from "../components/titre-accent";
import { lirePolice } from "./woff2-lecteur";

/**
 * HERO DE L'ACCUEIL — chantier design, Phase 3 (`docs/design/PHASE-3.md`).
 *
 * Le titre garde sa chaîne i18n, et UN mot y passe en police d'accent (V-25
 * A2) : il est désigné par une clé `*.accent`, retrouvé par `TitreAccent`. La
 * preuve sociale (V-27 A15) compte des vendeurs réels et disparaît sous le seuil.
 * Ce qui se casse sans bruit, et que ce fichier attrape :
 *   - une traduction du titre modifiée sans son mot d'accent : l'accent
 *     disparaît, rien ne rougit à l'écran ;
 *   - un mot d'accent portant une lettre absente de la découpe de la police
 *     (V-25 A3 : lettres et accents seuls) : le navigateur le dessinerait dans
 *     une autre police, au milieu du mot ;
 *   - une pastille affichée sous le seuil, ou avec un chiffre qui n'est pas compté.
 */

const lire = (p: string) => readFileSync(p, "utf8");
const PAGE = lire("app/page.tsx");
const police = lirePolice(readFileSync("app/fonts/InstrumentSerifZabelie.woff2"));
const LANGUES = Object.keys(DICT) as Array<keyof typeof DICT>;
const PAIRES = [["hero.s1.t", "hero.s1.t.accent"], ["launch.title", "launch.title.accent"]] as const;

test("H1 — dans chaque langue, le mot d'accent figure une fois dans son titre, et la police le porte", () => {
  assert.equal(LANGUES.length, 4, "kreyòl, français, anglais, espagnol");
  for (const lang of LANGUES) {
    const table = DICT[lang] as Record<string, string>;
    for (const [cle, cleAccent] of PAIRES) {
      const titre = table[cle], mot = table[cleAccent];
      assert.ok(titre && mot, `${lang} : ${cle} ou ${cleAccent} manquant`);
      assert.equal(titre.split(mot).length - 1, 1, `${lang} : « ${mot} » doit figurer UNE fois dans « ${titre} »`);
      assert.match(mot, /^\p{L}+$/u, `${lang} : « ${mot} » — lettres seules, la découpe n'a ni chiffre ni ponctuation`);
      const absentes = [...mot].filter((c) => !police.caracteres.has(c.codePointAt(0)!));
      assert.deepEqual(absentes, [], `${lang} : « ${mot} » porte des lettres absentes de la police d'accent`);
    }
  }
});

test("H2 — le h1 du hero passe par TitreAccent, chaque titre avec SON mot", () => {
  assert.match(
    PAGE,
    /<TitreAccent texte=\{t\(lang, opening \? "launch\.title" : "hero\.s1\.t"\)\} accent=\{t\(lang, opening \? "launch\.title\.accent" : "hero\.s1\.t\.accent"\)\} \/>/,
    "les deux conditions doivent choisir la même variante : titre de lancement avec son mot, titre courant avec le sien"
  );
});

test("H3 — TitreAccent entoure le mot, et un mot absent laisse le titre intact en le disant", () => {
  const rendu = renderToStaticMarkup(createElement(TitreAccent, { texte: "Òf vandè ayisyen yo", accent: "ayisyen" }));
  assert.equal(rendu, 'Òf vandè <span class="mot-accent">ayisyen</span> yo');
  const avertissements: unknown[][] = [];
  const avant = console.warn;
  console.warn = (...a: unknown[]) => void avertissements.push(a);
  try {
    assert.equal(renderToStaticMarkup(createElement(TitreAccent, { texte: "Òf vandè yo", accent: "ayisyen" })), "Òf vandè yo");
  } finally {
    console.warn = avant;
  }
  assert.equal(avertissements.length, 1, "un mot d'accent introuvable se journalise");
});

test("H5 — rythme : 40 px entre les sections, 48 en grand écran, la rangée du premier écran exceptée", () => {
  // Brief Phase 3.7 : `--space-10/12`, soit `pt-10` et `pt-12` (V-25 A8 : pas de
  // `--space-*`, l'échelle Tailwind). La rangée principale ouvre le premier
  // écran : l'espacer descendrait les premiers produits sous le pli.
  assert.match(PAGE, /\$\{primary \? "pt-6" : "pt-10 md:pt-12"\}/);
  const sections = [...PAGE.matchAll(/<section\b[^>]*className="([^"]*)"/g)].map((m) => m[1]).filter((c) => /\bmx-auto max-w-6xl\b/.test(c) && !/home-premier-ecran|home-catalogue-state/.test(c));
  assert.ok(sections.length >= 3, `${sections.length} sections lues`);
  for (const c of sections) assert.match(c, /(?<![\w:-])pt-10 md:pt-12(?![\w-])/, `section hors rythme : « ${c} »`);
});

test("H6 — sur la bannière indigo, le mot d'accent prend l'orange qui passe le contraste", () => {
  /* MESURÉ le 2026-11-07 : `--accent` (#b8500c) rend 2,55:1 sur `chrome-2`, sous
   * le 3:1 d'un grand texte. Le script de contraste ne mesurait l'accent que sur
   * les fonds clairs : il ne pouvait pas le voir. */
  const css = lire("app/home-discovery.css").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.match(css, /\.home-hero:not\(\.launch-hero\) \.mot-accent \{ color: var\(--color-accent-sur-chrome\); \}/);
  assert.match(lire("scripts/zabelie-contrast.mjs"), /`--accent-sur-chrome sur \$\{arret\}`, T\["accent-sur-chrome"\], T\[arret\], NORMAL/,
    "la paire est mesurée sur les trois arrêts du dégradé");
});

test("H4 — la preuve sociale : un compte réel, absente sous le seuil", () => {
  assert.equal(SEUIL_VENDEURS, 3, "V-27 A15 reprend le seuil existant");
  assert.equal(preuveVendeurs(SEUIL_VENDEURS - 1), null);
  assert.equal(preuveVendeurs(0), null);
  assert.equal(preuveVendeurs(SEUIL_VENDEURS), SEUIL_VENDEURS);
  // La CONDITION et la SOURCE, pas le libellé : le chiffre vient des vendeurs
  // comptés dans le catalogue chargé, et la pastille n'existe que s'il passe.
  assert.match(PAGE, /const preuve = preuveVendeurs\(sellerMap\.size\);/);
  assert.match(PAGE, /\{!opening && preuve !== null && <p className="home-preuve">\{t\(lang, "home\.proof\.sellers", \{ n: String\(preuve\) \}\)\}<\/p>\}/);
  for (const lang of LANGUES) {
    const v = (DICT[lang] as Record<string, string>)["home.proof.sellers"];
    assert.ok(v?.includes("{n}"), `${lang} : la preuve sociale ne porte pas le compte`);
    assert.doesNotMatch(v, /\d/, `${lang} : un chiffre écrit en dur dans « ${v} »`);
  }
  const css = lire("app/home-discovery.css").replace(/\/\*[\s\S]*?\*\//g, " ");
  for (const m of css.matchAll(/([^{}]*home-preuve[^{}]*)\{([^{}]*)\}/g)) {
    assert.doesNotMatch(m[2], /--color-(?:success|brand|accent)/, "la pastille ne prend ni le vert des statuts d'argent ni l'orange des actions");
  }
});
