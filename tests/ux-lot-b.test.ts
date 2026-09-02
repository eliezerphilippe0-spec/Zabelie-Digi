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
  assert.ok(sections >= 8, `l'accueil a ${sections} sections — la mesure suppose une vraie page`);
  assert.ok(
    eyebrows <= plafond,
    `${eyebrows} eyebrows pour ${sections} sections : plafond ${plafond}. Retirer, pas déplacer.`
  );
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
  assert.match(PAGE, /className="glass relative overflow-hidden rounded-3xl border border-accent\/40/);
});

test("UB5 — le composant mort au faux écran produit n'existe plus", () => {
  assert.equal(existsSync(join(RACINE, "components/hero-visual.tsx")), false);
  assert.doesNotMatch(PAGE, /HeroVisual/);
});

test("UB6 — un produit ne remplit pas deux rails : la règle est définie ET appliquée", () => {
  // Définition, avec sa liaison : le filtre porte sur `vus.has(p.slug)`.
  assert.match(
    PAGE,
    /const inedit = \(items: typeof products\): boolean => \{[\s\S]{0,200}?if \(!items\.some\(\(p\) => !vus\.has\(p\.slug\)\)\) return false;/,
    "inedit() doit refuser un rail dont TOUS les produits ont déjà été vus"
  );
  // Le produit de la semaine ouvre la page : il compte comme vu.
  assert.match(PAGE, /new Set<string>\(featured \? \[featured\.slug\] : \[\]\)/);
  // Application : les six rails, chacun gardé par son propre appel.
  for (const v of ["trending", "newest", "fichiers", "services", "free", "promo"]) {
    assert.match(PAGE, new RegExp(`\\{inedit\\(${v}\\) && \\(\\s*<HomeRow`), `le rail ${v} n'est pas gardé`);
  }
  // Un rail vide reste l'affaire de HomeRow (V-13) : inedit([]) est vrai.
  assert.match(PAGE, /if \(items\.length === 0\) return true;/);
});
