import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT } from "../lib/i18n";

/**
 * LE RAPPEL D'ACHAT DE LA FICHE (audit du 2026-11-10, P0-6).
 *
 * Seule exception à « pas de bouton flottant » (`docs/design/DESIGN-SYSTEM.md`).
 * Ces assertions tiennent les CONDITIONS de l'exception, pas sa présence : un
 * lien et non un second paiement, effacement devant tout bouton principal,
 * téléphone seulement, au-dessus de la barre. Le comportement lui-même se
 * vérifie dans un navigateur : `e2e/fiche-rappel-achat.spec.ts`.
 */
const sansCommentaires = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const COMPOSANT = sansCommentaires(readFileSync("components/rappel-achat.tsx", "utf8"));
const FICHE = sansCommentaires(readFileSync("app/produit/[slug]/page.tsx", "utf8"));
const FEUILLE = sansCommentaires(readFileSync("app/marketplace-header.css", "utf8"));

test("il s'efface devant le bloc d'achat ET devant tout autre bouton principal", () => {
  assert.match(COMPOSANT, /document\.querySelectorAll\("#acheter, main \.bouton\.bouton-primaire:not\(\[data-rappel-achat\] \*\)"\)/);
  // Visible seulement quand AUCUNE cible observée n'est à l'écran.
  assert.match(COMPOSANT, /if \(entree\.isIntersecting\) enVue\.add\(entree\.target\);\s*else enVue\.delete\(entree\.target\);\s*\}\s*setVisible\(enVue\.size === 0\);/);
  assert.match(COMPOSANT, /const \[visible, setVisible\] = useState\(false\);/, "invisible au premier rendu : aucun décalage, rien sans JavaScript");
  assert.match(COMPOSANT, /if \(!visible\) return null;/);
});

test("téléphone seulement, et aucun état d'achat dans le composant", () => {
  assert.match(COMPOSANT, /<div data-rappel-achat className="rappel-achat [^"]*\bmd:hidden\b[^"]*">/);
  assert.doesNotMatch(COMPOSANT, /fetch\(|\/api\/|BuyButton|checkout/i);
});

test("la feuille le pose au-dessus de la barre, sous les menus, sans règle display", () => {
  const regle = FEUILLE.match(/\.rappel-achat \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(regle, "règle .rappel-achat introuvable");
  assert.match(regle, /position: fixed;/);
  assert.match(regle, /bottom: calc\(--spacing\(14\) \+ 1px \+ env\(safe-area-inset-bottom, 0px\)\);/);
  assert.match(regle, /z-index: var\(--z-sticky\);/);
  assert.doesNotMatch(regle, /display\s*:/, "une règle display ici l'emporterait sur md:hidden");
  // La hauteur d'une entrée de la barre est bien celle que le décalage suppose.
  assert.match(FEUILLE, /\.barre-nav-lien \{[^}]*min-height: --spacing\(14\);/);
});

test("fiche : un lien vers #acheter, le prix de la zone de prix, absent sans rail", () => {
  const bloc = FICHE.match(/\{!aucunRail && \(\s*<RappelAchat>([\s\S]*?)<\/RappelAchat>\s*\)\}/)?.[1] ?? "";
  assert.ok(bloc, "le rappel doit être commandé par `!aucunRail`");
  assert.match(bloc, /<a href="#acheter" className="bouton bouton-primaire bouton-compact shrink-0">/);
  assert.doesNotMatch(bloc, /<button|onClick/);
  // Même source de prix que la zone de prix : flash s'il y en a un.
  assert.match(bloc, /<Prix montant=\{flash \? flash\.prixFlashHtg : product\.priceHTG\}/);
  assert.match(FICHE, /data-zone-prix[\s\S]{0,4000}?<Prix montant=\{flash \? flash\.prixFlashHtg : product\.priceHTG\} \/>/);
  assert.match(bloc, /physical && physical\.variants\.length > 1 && !flash \? <>\{t\(lang, "product\.price\.from"\)\}/);
  assert.match(FICHE, /id="acheter"/);
});

test("le libellé court existe dans les quatre langues, sans prix ni flèche", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const d = DICT[lang] as Record<string, string>;
    assert.ok(d["product.cta.sticky"], `${lang} : product.cta.sticky manquant`);
    assert.doesNotMatch(d["product.cta.sticky"], /\{price\}|↑/u);
    assert.ok(d["product.cta.bottom"].startsWith(d["product.cta.sticky"]), `${lang} : le libellé court doit rester celui du bouton de bas de page`);
  }
});
