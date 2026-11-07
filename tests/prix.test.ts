import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Prix } from "../components/prix";
import { formatHTG } from "../lib/sample-data";

/**
 * LE COMPOSANT DE PRIX — brief design, Phase 1.3, V-25 A1.
 *
 * Il ne doit changer que l'APPARENCE. Le chiffre qu'on lit, celui qu'un acheteur
 * compare à son solde MonCash, reste celui de `formatHTG` au caractère près :
 * sur le chemin de l'argent, un composant de présentation qui reformaterait un
 * nombre serait le pire endroit où introduire un écart.
 */

const rendu = (montant: number, className?: string) => renderToStaticMarkup(createElement(Prix, { montant, className }));
const texte = (html: string) => html.replace(/<[^>]+>/g, "");

test("P1 — le texte lu est exactement celui de formatHTG", () => {
  for (const m of [0, 5, 950, 1500, 25000, 1234567]) {
    assert.equal(texte(rendu(m)), formatHTG(m), `écart pour ${m}`);
  }
});

test("P2 — la devise est séparée du nombre, et les classes portent le rôle", () => {
  const html = rendu(1500, "text-xl");
  assert.match(html, /^<span class="prix numeric text-xl">/);
  assert.match(html, /<span class="prix-devise">HTG<\/span><\/span>$/);
  // Le nombre n'est PAS dans la balise de la devise.
  assert.doesNotMatch(/<span class="prix-devise">(.*?)<\/span>/.exec(html)?.[1] ?? "", /\d/);
});

test("P3 — `.prix` : Manrope 800, tabulaire, orange de texte ; devise plus légère, jamais sous 12 px", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const prix = /\.prix\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(prix, /font-family: var\(--font-heading\)/);
  assert.match(prix, /font-weight: 800/);
  assert.match(prix, /font-variant-numeric: tabular-nums/);
  assert.match(prix, /color: var\(--color-accent\)/, "A1 : `--color-brand` rendrait 3,56:1 en texte sur crème");
  const devise = /\.prix-devise\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(devise, /font-size: max\(var\(--text-xs\), 0\.75em\)/);
  assert.match(devise, /font-weight: 600/);
});

test("P4 — les prix d'achat passent par le composant, partout où un acheteur décide", () => {
  /* Ce qui commande : le composant lié au bon montant, pas sa seule présence. */
  const SITES: [string, RegExp][] = [
    ["components/product-card.tsx", /<Prix montant=\{product\.priceHTG\}/],
    ["components/home-featured.tsx", /<Prix montant=\{product\.priceHTG\}/],
    ["components/ventes-flash.tsx", /<Prix montant=\{o\.prixFlashHtg\}/],
    ["components/product-offers.tsx", /<Prix montant=\{offer\.price_htg\}/],
    ["app/panier/page.tsx", /<Prix montant=\{l\.product!\.price_htg\}/],
    ["app/panier/page.tsx", /<Prix montant=\{total\}/],
    ["app/produit/[slug]/page.tsx", /<Prix montant=\{flash \? flash\.prixFlashHtg : product\.priceHTG\}/],
  ];
  for (const [f, motif] of SITES) {
    assert.match(readFileSync(f, "utf8"), motif, `${f} n'affiche plus ce prix par <Prix>`);
  }
});

test("P5 — le prix en gros ne repasse pas par une écriture nue sur la carte", () => {
  assert.doesNotMatch(readFileSync("components/product-card.tsx", "utf8"), /formatHTG\(product\.priceHTG\)/);
});
