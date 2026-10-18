import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";
import { annoncesDe, dureeDefilement } from "@/components/barre-annonce";

/**
 * LA BARRE D'ANNONCE DÉFILANTE (demandée le 2026-10-17, sur le modèle de
 * Jumia Côte d'Ivoire). Ce qui est gardé : qu'elle ne dise que ce qui est
 * tenu, qu'elle s'arrête quand on le lui demande, qu'un lecteur d'écran ne la
 * lise qu'une fois, et que le clavier commence toujours par le lien
 * d'évitement.
 */

const COMPOSANT = readFileSync("components/barre-annonce.tsx", "utf8");
const CSS = readFileSync("app/barre-annonce.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const NAV = readFileSync("components/site-nav.tsx", "utf8");

test("A1 — chaque annonce existe dans les quatre langues, sans trou", () => {
  for (const lang of LANGS) {
    const a = annoncesDe(lang);
    assert.ok(a.length >= 3, `trop peu d'annonces en ${lang}`);
    for (const { texte } of a) {
      assert.ok(texte.trim().length > 0, `annonce vide en ${lang}`);
      assert.doesNotMatch(texte, /\b(trust|rail|guides)\.[a-z0-9.]+/, `clé brute affichée en ${lang} : « ${texte} »`);
    }
  }
});

test("A2 — elle ne reprend que des libellés déjà tenus ailleurs", () => {
  /* Les clés de la liste sont celles que gardent les tests de promesse
   * (accueil-maquette, promesse-vendeur). Une nouvelle annonce passe d'abord
   * par eux : la barre n'est pas une porte dérobée vers une promesse neuve. */
  const cles = [...COMPOSANT.matchAll(/cles: \[([^\]]+)\]/g)].flatMap((m) => m[1].split(",").map((c) => c.trim().replace(/"/g, "")));
  assert.ok(cles.length >= 5, "extraction suspecte");
  const AUTORISEES = new Set(["trust.2.b", "trust.c3", "trust.c4", "guides.diaspora.title", "rail.shop.t", "rail.shop.free"]);
  for (const c of cles) {
    assert.ok(AUTORISEES.has(c), `« ${c} » n'est pas un libellé déjà tenu : le valider avant de l'annoncer`);
    for (const lang of LANGS) assert.ok((DICT[lang] as Record<string, string>)[c]?.trim(), `${c} manquante en ${lang}`);
  }
});

test("A3 — la seconde copie est muette pour les lecteurs d'écran et hors tabulation", () => {
  assert.match(COMPOSANT, /<ul className="annonce-groupe" aria-hidden=\{copie \|\| undefined\}>/);
  assert.match(COMPOSANT, /tabIndex=\{copie \? -1 : undefined\}/);
  assert.match(COMPOSANT, /\{groupe\(false\)\}\s*\{groupe\(true\)\}/, "deux copies, la vraie d'abord");
});

test("A4 — le mouvement n'existe que s'il n'est pas refusé, et s'arrête sur demande (WCAG 2.2.2)", () => {
  const i = CSS.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(i > -1, "le défilement n'est plus conditionné");
  const fin = CSS.indexOf("@media (prefers-reduced-motion: reduce)");
  const bloc = CSS.slice(i, fin);
  assert.match(bloc, /\.annonce-piste\s*\{\s*animation: annonce-defile/);
  assert.doesNotMatch(CSS.slice(0, i) + CSS.slice(fin), /animation:\s*annonce-defile/, "une animation hors du bloc tournerait aussi en mouvement réduit");
  for (const arret of [".annonce-fenetre:hover", ".annonce-fenetre:focus-within", ".annonce[data-pause]"]) {
    assert.ok(bloc.includes(arret), `plus d'arrêt sur ${arret}`);
  }
  /* Le focus du BOUTON ne doit pas compter : sinon le second clic ne relance rien. */
  assert.doesNotMatch(bloc, /\.annonce:focus-within/);
  const reduit = CSS.slice(fin);
  assert.match(reduit, /\.annonce-groupe\[aria-hidden="true"\],\s*\.annonce-pause\s*\{\s*display: none;/);
});

test("A5 — le clavier commence par le lien d'évitement, la barre se replie avec l'en-tête", () => {
  const evitement = NAV.indexOf('href="#main"');
  const barre = NAV.indexOf("<BarreAnnonce lang={lang} />");
  assert.ok(evitement > -1 && barre > evitement, "la barre passe avant le lien d'évitement");
  assert.match(COMPOSANT, /className="annonce header-fold"/, "la barre ne se replie plus au défilement");
  /* Hors couche, `.annonce { display: flex }` passe devant `.header-fold` :
   * la règle de repli doit être redite ici (mesuré par l'e2e). */
  assert.match(CSS, /header\[data-compact\] \.annonce \{ display: none; \}/);
  assert.match(COMPOSANT, /role="marquee"/);
});

test("A6 — la vitesse suit la longueur du texte, avec un plancher", () => {
  assert.equal(dureeDefilement([{ texte: "court" }]), 24);
  assert.equal(dureeDefilement([{ texte: "x".repeat(300) }]), 60);
  for (const lang of LANGS) {
    const d = dureeDefilement(annoncesDe(lang));
    assert.ok(d >= 24 && d <= 90, `durée hors bornes en ${lang} : ${d} s`);
  }
});

test("A7 — la barre n'est pas orange : l'accent reste aux boutons et aux prix", () => {
  /* Revue des couleurs du 2026-10-17 : une bande orange en tête de chaque
   * page faisait concurrence au bouton principal (« un seul accent »,
   * zabelie-theme.css). L'orange ne reste que sur les losanges. */
  const regle = CSS.slice(CSS.indexOf(".annonce {"), CSS.indexOf("}", CSS.indexOf(".annonce {")));
  assert.match(regle, /background: var\(--color-chrome-2\);/);
  assert.match(regle, /color: var\(--color-on-chrome\);/);
  assert.doesNotMatch(regle, /--color-brand/, "la barre a repris l'orange de l'accent");
  const puce = CSS.slice(CSS.indexOf(".annonce-item::before"), CSS.indexOf("}", CSS.indexOf(".annonce-item::before")));
  assert.match(puce, /background: var\(--color-brand\);/, "les losanges portent l'accent");
});

test("A8 — chaque lien de la barre et le bouton pause font 44 px de haut", () => {
  /* Audit final du 2026-10-17 : à 36 px, chaque page gagnait huit cibles
   * sous la taille au doigt que le site vise (44 px). */
  const barre = CSS.slice(CSS.indexOf(".annonce {"), CSS.indexOf("}", CSS.indexOf(".annonce {")));
  const lien = CSS.slice(CSS.indexOf(".annonce-lien {"), CSS.indexOf("}", CSS.indexOf(".annonce-lien {")));
  assert.match(barre, /min-height: 44px;/, "la barre ne fait plus 44 px");
  assert.match(lien, /min-height: 44px;/, "un lien de la barre est sous 44 px");
});
