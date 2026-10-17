import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * L'ACCUEIL COMME VITRINE (audit page par page du 2026-10-17, note 5/10).
 *
 * Trois écarts avec les pages d'accueil des grandes plateformes, mesurés sur
 * zabelie.com en 390 px : la page s'ouvrait sur « MonCash en phase de test :
 * aucun paiement réel » (la limite avant la promesse), montrait une carte
 * « Recharges actuellement indisponibles », et faisait 5,3 écrans de haut.
 * L'ordre promesse → limite est gardé par `tests/home-premier-ecran` P1.
 */

const sans = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
const page = sans(readFileSync("app/page.tsx", "utf8"));
const univers = sans(readFileSync("components/marketplace-universes.tsx", "utf8"));

test("V1 — le premier repère de confiance est la garantie de séquestre", () => {
  assert.match(page, /<TrustBar\s+compact\s+items=\{\[\s*\{ t: t\(lang, "trust\.2\.b"\), icone: "bouclier" \}/);
});

test("V2 — la carte Recharges n'existe que si les recharges sont ouvertes", () => {
  assert.match(univers, /const recharges = isTopupFirstPartyEnabled\(\);/);
  assert.match(univers, /\{recharges && <Link href="\/recharges"/, "la carte s'affiche même fermée");
  assert.doesNotMatch(univers, /availability\.topup\.paused/, "la vitrine annonce de nouveau une offre indisponible");
  /* Trois cartes : la grille passe à trois colonnes au lieu d'en laisser une vide. */
  assert.match(univers, /recharges \? "universe-grid" : "universe-grid universe-grid-trois"/);
  const css = readFileSync("app/editorial-marketplace.css", "utf8");
  assert.match(css, /\.universe-grid-trois \{ grid-template-columns: repeat\(3,minmax\(0,1fr\)\); \}/);
});

test("V3 — les trois étapes se replient, la mention d'intermédiaire reste visible", () => {
  const i = page.indexOf('className="home-receipt');
  const bloc = page.slice(i, page.indexOf("</section>", i));
  const d = bloc.indexOf("<details");
  assert.ok(d > -1, "les trois étapes s'affichent de nouveau en entier");
  assert.doesNotMatch(bloc, /<details[^>]*\bopen\b/, "replié par défaut");
  const replie = bloc.slice(d, bloc.indexOf("</details>"));
  for (const k of ["home.b1.t", "home.b2.t", "home.b3.t"]) assert.ok(replie.includes(`"${k}"`), `${k} a quitté le repli`);
  /* Ce que Zabelie fait et ne fait pas ne se cache pas : titre et mention
   * AVANT le repli (e2e `parcours-physique-accueil` lit la mention à l'écran). */
  for (const k of ["home.receipt.title", "home.receipt.body"]) {
    const p = bloc.indexOf(`"${k}"`);
    assert.ok(p > -1 && p < d, `${k} est passé dans le repli`);
  }
  assert.match(replie, /<summary[^>]*>\s*\{t\(lang, "home\.receipt\.steps"\)\}/);
});

test("V4 — l'encart d'aide en double a quitté l'accueil", () => {
  assert.doesNotMatch(page, /home-help/, "l'encart « Une question avant d'acheter ? » est revenu");
  assert.match(page, /href="\/aide#comment"/, "l'accueil doit garder un chemin vers l'aide à l'achat");
});
