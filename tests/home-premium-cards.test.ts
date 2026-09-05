import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Accueil premium, Phase 4 — cartes produit, squelettes, mouvement (brief
 * §4.4, §3.3), tels que le code les COMMANDE.
 *
 * Mutations éprouvées :
 *   C1  `aspect-square` retiré du conteneur d'image                   → rouge
 *   C2  `line-clamp-2` retiré du nom                                   → rouge
 *   C3  prix : `text-accent` → `text-mist`                             → rouge
 *   C4  `titreCarte(product.title, …)` → `product.title`               → rouge
 *   C5  CardImage : `onLoad={() => setChargee(true)}` retiré           → rouge
 *   C6  `loading="lazy"` retiré                                        → rouge
 *   C7  `--default-transition-duration: var(--motion-base)` retiré     → rouge
 *   C8  `rounded-card` → `rounded-2xl` sur la carte                    → rouge
 */

const CARD = readFileSync("components/product-card.tsx", "utf8");
const IMG = readFileSync("components/card-image.tsx", "utf8");
const SKEL = readFileSync("components/skeleton.tsx", "utf8");
const THEME = readFileSync("app/zabelie-theme.css", "utf8");
const CART = readFileSync("components/add-to-cart.tsx", "utf8");
function sansCommentaires(s: string): string {
  return s.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}
const card = sansCommentaires(CARD);
const img = sansCommentaires(IMG);

test("C1 — l'image de la carte est un carré réservé (aspect-square) sur fond neutre", () => {
  assert.match(card, /<div className="relative aspect-square w-full bg-line">/);
  // Et l'image remplit ce carré sans le déformer.
  assert.match(img, /className="absolute inset-0 h-full w-full object-cover transition-opacity"/);
  assert.match(img, /width=\{size\}\s+height=\{size\}/, "largeur = hauteur : le carré est réservé avant l'image");
});

test("C2 — ordre : image → nom (2 lignes) → prix → vendeur, avec les bons tokens", () => {
  const iImg = card.indexOf("aspect-square");
  const iNom = card.indexOf("line-clamp-2");
  const iPrix = card.indexOf("formatHTG(product.priceHTG)");
  const iVendeur = card.indexOf("{labels.by} {product.creator}");
  assert.ok(iImg > 0 && iImg < iNom && iNom < iPrix && iPrix < iVendeur, "ordre attendu : image, nom, prix, vendeur");
  assert.match(card, /<h3 className="line-clamp-2 text-sm[^"]*">\{titre\}<\/h3>/);
  assert.match(card, /<span className="numeric text-sm font-bold text-accent">\{formatHTG\(product\.priceHTG\)\}<\/span>/);
  assert.match(card, /<span className="truncate text-sm text-mist">/);
});

test("C3 — le prix est Manrope 700 par `.numeric`, orange AA, jamais en dégradé", () => {
  const G = readFileSync("app/globals.css", "utf8");
  assert.match(G, /button,\s*\.numeric,\s*\.metric \{\s*font-family: var\(--font-heading\);\s*font-weight: 700;/);
  assert.doesNotMatch(card, /text-gradient/);
});

test("C4 — le titre passe par titreCarte : aucune URL brute, un repli traduit", () => {
  assert.match(card, /const titre = titreCarte\(product\.title, labels\.titleFallback \?\? "Produit", undefined, product\.slug\);/);
  assert.match(card, /alt=\{titre\}/);
  const i18n = readFileSync("lib/i18n.ts", "utf8");
  assert.equal((i18n.match(/^\s*"card\.title\.fallback": /gm) ?? []).length, 4);
  assert.match(readFileSync("app/page.tsx", "utf8"), /titleFallback: t\(lang, "card\.title\.fallback"\)/);
});

test("C5 — fondu à l'arrivée : opacity commandée par onLoad, durée sur le token", () => {
  assert.match(img, /const \[chargee, setChargee\] = useState\(false\);/);
  assert.match(img, /onLoad=\{\(\) => setChargee\(true\)\}/);
  assert.match(img, /style=\{\{ opacity: chargee \? 1 : 0, transitionDuration: "var\(--motion-base\)" \}\}/);
});

test("C6 — l'image est différée et décodée hors du fil principal", () => {
  assert.match(img, /loading="lazy"/);
  assert.match(img, /decoding="async"/);
});

test("C7 — mouvement : transitions par défaut sur les tokens, tap à 0,97, squelette pulsé", () => {
  assert.match(THEME, /--default-transition-duration: var\(--motion-base\);/);
  assert.match(THEME, /--default-transition-timing-function: var\(--ease\);/);
  assert.match(card, /className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition active:scale-\[0\.97\]"/);
  assert.match(SKEL, /animate-pulse motion-reduce:animate-none/);
  assert.match(SKEL, /<SkeletonBlock className="aspect-square w-full rounded-none" \/>/);
  // La coche du panier arrive par la révélation du thème (--motion-slow).
  assert.match(sansCommentaires(CART), /className="reveal-mark inline-flex items-center gap-1\.5/);
});

test("C8 — rayon des cartes : `rounded-card` (12 px), un cran de l'échelle, pas un arbitraire", () => {
  assert.match(THEME, /--radius-card: 0\.75rem;/);
  assert.match(card, /rounded-card border border-line bg-surface/);
  assert.match(SKEL, /rounded-card border border-line bg-surface/);
  assert.doesNotMatch(card, /rounded-\[/);
});

test("C9 — grilles : 2 colonnes mobile, gouttière 12 px, partout où la carte vit", () => {
  for (const f of ["app/page.tsx", "app/catalogue/page.tsx", "components/boutique-vue.tsx", "components/skeleton.tsx"]) {
    assert.match(readFileSync(f, "utf8"), /grid grid-cols-2 gap-3 sm:grid-cols-[346]/, `${f} n'a pas la grille à deux colonnes`);
  }
});
