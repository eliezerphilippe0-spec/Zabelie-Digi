import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * LOT A DE L'AUDIT UX (2026-09-02) — accès et perception.
 *
 * Trois gardes sur ce qui COMMANDE, pas sur ce qui est produit :
 *   • un `loading.tsx` existe pour chaque surface d'atterrissage ET il rend
 *     le squelette partagé (un fichier vide passerait le premier test seul) ;
 *   • la règle `:focus-visible` vit dans la couche base de `globals.css` ;
 *   • les boutons du chemin acheteur portent `min-h-11` DANS leur attribut
 *     className — pas quelque part dans le fichier.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

const SURFACES = [
  "app/loading.tsx",
  "app/catalogue/loading.tsx",
  "app/produit/[slug]/loading.tsx",
  "app/boutik/[slug]/loading.tsx",
];

test("UA1 — chaque surface d'atterrissage a un loading.tsx qui rend le squelette partagé", () => {
  for (const f of SURFACES) {
    assert.ok(existsSync(join(RACINE, f)), `${f} manque : la page reste blanche pendant Supabase`);
    const src = lire(f);
    assert.match(src, /from "@\/components\/skeleton"/, `${f} n'importe pas le squelette partagé`);
    assert.match(src, /<SkeletonPage>/, `${f} doit envelopper dans <SkeletonPage> (aria-busy)`);
    assert.match(src, /<SiteNav \/>/, `${f} doit garder la vraie barre : l'utilisateur peut naviguer pendant l'attente`);
  }
});

test("UA2 — le squelette annonce l'attente et se tait sous reduced-motion", () => {
  const src = lire("components/skeleton.tsx");
  assert.match(src, /aria-busy="true"/, "l'état d'attente doit être porté par aria-busy");
  assert.match(src, /animate-pulse motion-reduce:animate-none/, "la pulsation doit se couper sous prefers-reduced-motion");
  // Aucun texte visible : un squelette ne se traduit pas.
  assert.doesNotMatch(src, />[A-Za-zÀ-ÿ]{3,}[^<]*</, "un squelette ne porte aucune chaîne visible");
});

test("UA3 — :focus-visible est défini dans la couche base, à la couleur d'accent", () => {
  const css = lire("app/globals.css");
  const base = css.slice(css.indexOf("@layer base"), css.indexOf("@layer utilities"));
  assert.match(
    base,
    /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/,
    "la règle :focus-visible doit vivre dans @layer base et utiliser le token d'accent"
  );
});

const BOUTONS: Array<[string, RegExp]> = [
  ["components/cart-pay-button.tsx", /<button[\s\S]{0,300}?className="[^"]*\bmin-h-11\b/],
  ["components/reset-password-form.tsx", /<button[\s\S]{0,300}?className="[^"]*\bmin-h-11\b/],
  ["components/copy-field.tsx", /<button[\s\S]{0,300}?className="[^"]*\bmin-h-11\b[^"]*\bmin-w-11\b/],
  ["app/error.tsx", /<button[\s\S]{0,300}?className="[^"]*\bmin-h-11\b/],
  // `galerie-produit.tsx` n'est PAS ici, et c'est mesuré : la vignette fait
  // 72 × 72 px (`width={72}`) et porte déjà `aria-label`. L'audit l'avait
  // comptée à tort parmi les boutons < 44 px — un grep sur `min-h-11` ne
  // voit pas une taille donnée par l'image qu'il contient.
];

test("UA4 — les boutons du chemin acheteur font au moins 44 px", () => {
  for (const [f, re] of BOUTONS) {
    assert.match(lire(f), re, `${f} : le <button> doit porter min-h-11 dans son className`);
  }
});
