import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { lirePolice } from "./woff2-lecteur";

/**
 * LA POLICE D'ACCENT — décision V-25 A2 et A3, `docs/design/AUDIT-0.md`.
 *
 * Instrument Serif Italic, découpée par `scripts/decouper-police-accent.sh`,
 * lue ici dans le FICHIER, jamais de mémoire. Quatre défauts à attraper :
 *
 *   1. une régénération qui oublie un accent de fin de mot (`vandè`, `bò`) ;
 *   2. une régénération qui ramène les chiffres et fait sauter le budget ;
 *   3. un retour à `next/font/google`, 22 Ko au lieu de 11 ;
 *   4. un `.mot-accent` posé sur un prix, un bouton, ou portant un chiffre,
 *      que le navigateur dessinerait alors avec une autre police.
 */

const FICHIER = "app/fonts/InstrumentSerifZabelie.woff2";
const police = lirePolice(readFileSync(FICHIER));
const lettres = (s: string) => [...s].filter((c) => !police.caracteres.has(c.codePointAt(0)!));

/**
 * Budget du brief : 90 000 octets pour les trois polices. Inter pèse 52 088
 * octets et Manrope 24 436, mesurés au build. Reste 13 476 pour l'accent.
 */
const BUDGET_OCTETS = 13_476;

/** Fichiers autorisés à employer `.mot-accent`. Les phases 3 et 4 les ajoutent. */
const EMPLOIS_AUTORISES = new Set<string>([]);

test("A1 — le lecteur discrimine : ce qui n'est pas dans la découpe en est absent", () => {
  assert.deepEqual(lettres("Ж"), ["Ж"], "`Ж` ne peut pas être dans une découpe latine");
  assert.ok(police.caracteres.size > 60 && police.caracteres.size < 110, `${police.caracteres.size} caractères : hors de la découpe prévue`);
});

test("A2 — kreyòl, français, espagnol : chaque lettre est dans le fichier", () => {
  // Choisies par la POSITION de l'accent : la fin de mot est le piège du kreyòl.
  const mots = ["vandè", "bò", "lè", "pwòp", "dyò", "machandè", "èske", "café", "déjà", "là", "où", "côté", "maïs", "être", "île", "sûr", "sí", "niño", "más", "útil"];
  assert.deepEqual(lettres(mots.join("")), [], "lettre(s) absente(s) de la police d'accent");
  assert.deepEqual(lettres("ÀÈÉÊÒÔÇÑ"), [], "majuscule(s) accentuée(s) absente(s)");
  assert.deepEqual(lettres("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ '’-"), []);
});

test("A3 — ni chiffre ni ponctuation : c'est ce qui tient le budget", () => {
  const presents = [..."0123456789.,;:!?«»()"].filter((c) => police.caracteres.has(c.codePointAt(0)!));
  assert.deepEqual(presents, [], "une régénération a ramené des signes que le mot d'accent ne doit pas porter");
});

test("A4 — le poids tient dans le budget, et le crénage est là", () => {
  const octets = statSync(FICHIER).size;
  assert.ok(octets <= BUDGET_OCTETS, `${FICHIER} pèse ${octets} octets, reste ${BUDGET_OCTETS} au budget de 90 Ko`);
  assert.ok(police.fonctionnalitesGpos.has("kern"), "crénage absent : un titre en italique se lirait mal");
});

test("A5 — la police est BRANCHÉE : chargée, repli ajusté, variable posée sur <html>, token lié", () => {
  const layout = readFileSync("app/layout.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
  assert.match(layout, /const accent = localFont\(\{[^}]*src: "\.\/fonts\/InstrumentSerifZabelie\.woff2"[^}]*style: "italic"[^}]*variable: "--font-accent-serif"/);
  assert.match(layout, /const accent = localFont\(\{[^}]*adjustFontFallback: "Times New Roman"/, "repli sans size-adjust : le basculement déplacerait le titre");
  assert.match(layout, /\$\{accent\.variable\}`\}/, "la variable de l'accent n'atteint pas <html>");
  assert.match(readFileSync("app/zabelie-theme.css", "utf8"), /--font-accent: var\(--font-accent-serif\), Georgia, "Times New Roman", serif;/);
  assert.ok(existsSync("app/fonts/InstrumentSerif-LICENSE.txt"), "la licence OFL 1.1 doit voyager avec le fichier");
});

test("A6 — `.mot-accent` lit le token, en orange de texte, sans faux gras", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const bloc = /\.mot-accent\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(bloc, /font-family:\s*var\(--font-accent\)/);
  assert.match(bloc, /font-style:\s*italic/);
  assert.match(bloc, /font-weight:\s*400/, "un h1 est en 800 : sans cette ligne, le navigateur empâte une police à une seule graisse");
  assert.match(bloc, /font-synthesis:\s*none/);
  assert.match(bloc, /color:\s*var\(--color-accent\)/, "A1 : `--color-accent`, le seul orange de texte qui passe le contraste");
});

function tsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) tsx(p, acc);
    else if (e.endsWith(".tsx")) acc.push(p.replaceAll("\\", "/"));
  }
  return acc;
}

/** Une classe, jamais la sous-chaîne : `mot-accentue` n'est pas `mot-accent`. */
const EMPLOI = /(?<![\w-])(?:mot-accent|font-accent)(?![\w-])/;

test("A7 — le détecteur d'emploi discrimine", () => {
  assert.ok(EMPLOI.test('<span className="mot-accent">'), "connu-positif");
  assert.ok(EMPLOI.test('<p className="text-lg font-accent">'), "connu-positif : l'utilitaire nu");
  assert.ok(!EMPLOI.test('<span className="mot-accentue">'), "connu-négatif");
  assert.ok(!EMPLOI.test('<span className="text-accent">'), "connu-négatif : `text-accent` est le prix");
});

test("A8 — le mot d'accent n'apparaît que dans les fichiers autorisés", () => {
  const sources = [...tsx("app"), ...tsx("components")];
  assert.ok(sources.length > 200, `${sources.length} fichiers lus : la mesure suppose le vrai dépôt`);
  // Commentaires retirés : expliquer la règle n'est pas l'enfreindre.
  const code = (f: string) =>
    readFileSync(f, "utf8")
      .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const fautes = sources.filter((f) => EMPLOI.test(code(f)) && !EMPLOIS_AUTORISES.has(f));
  assert.deepEqual(
    fautes,
    [],
    "Emploi hors liste. V-25 A2 : hero et titres de section clés seulement, jamais sur un prix, un bouton, un formulaire, la navigation, ni sous 24 px. Un emploi légitime s'ajoute à EMPLOIS_AUTORISES."
  );
});
