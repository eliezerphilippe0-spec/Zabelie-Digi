import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * LOT B DE L'AUDIT UX (2026-09-02) — l'accueil.
 *
 * Les règles du skill de goût qui se mesurent MÉCANIQUEMENT sont mesurées
 * ici, à chaque commit, au lieu d'être relues à l'œil : le plafond
 * d'eyebrows (§4.7), le prix en plein, le halo extérieur, le composant mort,
 * et la règle « un produit ne remplit pas deux rails ».
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const PAGE = lire("app/page.tsx");

test("UB1 — eyebrows ≤ ⌈sections / 3⌉ sur l'accueil (§4.7, mécanique)", () => {
  const sections = (PAGE.match(/<section\b/g) ?? []).length;
  const eyebrows = (PAGE.match(/uppercase tracking/g) ?? []).length;
  const plafond = Math.ceil(sections / 3);
  // Accueil premium, Phase 3 : la page est passée de 16 blocs à ~5 sections,
  // et le brief (§3.4) interdit l'eyebrow tout court. Le plafond mécanique
  // reste calculé pour la trace ; l'exigence est ZÉRO.
  assert.ok(sections >= 3, `l'accueil a ${sections} sections — la mesure suppose une vraie page`);
  assert.equal(eyebrows, 0, `${eyebrows} eyebrows pour ${sections} sections (plafond ${plafond}) : aucun n'est admis.`);
});

test("UB2 — aucun prix en dégradé sur le chemin acheteur", () => {
  for (const f of [
    "components/product-card.tsx",
    "app/page.tsx",
    "app/produit/[slug]/page.tsx",
    "app/panier/page.tsx",
  ]) {
    const src = lire(f);
    // Liaison : la classe `numeric` (chiffres tabulaires = un montant) ne
    // cohabite jamais avec `text-gradient` dans le MÊME attribut className.
    assert.doesNotMatch(
      src,
      /className="[^"]*\bnumeric\b[^"]*\btext-gradient\b|className="[^"]*\btext-gradient\b[^"]*\bnumeric\b/,
      `${f} : un montant (numeric) est rendu en text-gradient`
    );
  }
});

test("UB3 — les numéros d'étapes « 01 02 03 » ne sont plus rendus", () => {
  // La donnée `n` peut rester (clé React) ; c'est le RENDU qui est interdit.
  assert.doesNotMatch(PAGE, /\{step\.n\}/, "step.n ne doit plus apparaître dans le JSX");
});

test("UB4 — le halo extérieur a disparu, de la feuille et de la page", () => {
  assert.doesNotMatch(lire("app/globals.css"), /\.glow-ring\s*\{/);
  // Dans un attribut className — pas dans un commentaire qui raconte son retrait.
  assert.doesNotMatch(PAGE, /className="[^"]*\bglow-ring\b/);
  // Et le bloc de conversion final porte bien sa bordure de remplacement.
  // Le bloc de conversion n'est plus un `.glass` bordé d'accent : depuis la
  // Phase 3 de l'accueil premium, c'est une surface pleine bordée de `line`.
  assert.match(PAGE, /id="comment"[\s\S]{0,200}className="rounded-2xl border border-line bg-surface/);
  assert.doesNotMatch(PAGE, /className="glass/);
});

test("UB5 — le composant mort au faux écran produit n'existe plus", () => {
  assert.equal(existsSync(join(RACINE, "components/hero-visual.tsx")), false);
  assert.doesNotMatch(PAGE, /HeroVisual/);
});

test("UB6 — all home rows use the shared allocation including the featured product", () => {
  assert.match(PAGE, /allocateHomeRows\(\[/);
  assert.match(PAGE, /featured \? \[featured\.id\] : \[\]/);
  assert.doesNotMatch(PAGE, /const inedit/);
  for (const name of ["principaux", "newest", "fichiers", "services", "free"]) {
    assert.ok(PAGE.includes(name + ".length > 0"));
    assert.ok(PAGE.includes("items={" + name + "}"));
  }
});
