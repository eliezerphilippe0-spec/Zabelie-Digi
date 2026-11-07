import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DICT } from "../lib/i18n";

/**
 * CARTE PRODUIT ET ÉTIQUETTES — chantier design, Phase 2.3 et 2.4 (V-26).
 *
 * Le brief : image à ratio fixe avec un fond tant qu'elle n'est pas là, prix
 * mis en avant, nom sur deux lignes, toute la carte cliquable, deux colonnes à
 * 360 px, deux badges au plus, jamais « Vendeur vérifié » ni « Livraison
 * locale » (V-26). Ce qui manquait : des étiquettes écrites sur place, et la
 * ligne « Gade pwodui a » qui répétait l'action de la carte entière.
 */

const lire = (p: string) => readFileSync(join(import.meta.dirname, "..", p), "utf8");
const CARTE = lire("components/product-card.tsx");
const CSS = lire("app/globals.css").replace(/\/\*[\s\S]*?\*\//g, " ");

/** La branche « grille » de la carte : tout ce qui n'est pas réservé à `boutique`. */
const ETIQUETTE = /className="etiquette etiquette-(?:image|neutre)\b/g;

test("K1 — la carte entière est la cible, image carrée sur fond, nom sur deux lignes, prix en avant", () => {
  assert.match(CARTE, /return \(\s*<Link\b/, "la racine de la carte est le lien : toute la carte se touche");
  assert.match(CARTE, /relative aspect-square w-full overflow-hidden bg-line/, "ratio fixe, et un fond tant que l'image n'est pas là");
  assert.match(CARTE, /<h3 className=\{`line-clamp-2\b/, "nom limité à deux lignes");
  assert.match(CARTE, /<Prix montant=\{product\.priceHTG\} className="text-base" \/>/, "prix en 16 px, composant de la Phase 1");
  assert.match(lire("app/catalogue/page.tsx"), /grid grid-cols-2 gap-3 sm:grid-cols-3/, "deux colonnes à 360 px");
});

test("K2 — deux étiquettes au plus, en classe du thème, jamais orange", () => {
  const etiquettes = CARTE.match(ETIQUETTE) ?? [];
  assert.equal(etiquettes.length, 2, "type et note ou ventes : deux étiquettes, pas une de plus");
  assert.doesNotMatch(CARTE, /rounded-full bg-chrome\/80 px-2/, "étiquette réécrite à la main");
  for (const [, sel, corps] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!/\.etiquette/.test(sel)) continue;
    assert.doesNotMatch(corps, /--color-(?:brand|accent)/, `« ${sel.trim()} » : l'orange est réservé aux actions et aux prix`);
  }
  assert.match(lire("components/badge-identite.tsx"), /className="etiquette etiquette-neutre"/, "« Identité vérifiée » réutilisé, aux couleurs neutres");
});

test("K3 — « Gade pwodui a » ne vit plus que sur la carte de boutique", () => {
  // La CONDITION, pas le libellé : la ligne doit être derrière `boutique &&`.
  assert.match(CARTE, /\{boutique && labels\.detail && <span/);
  assert.doesNotMatch(CARTE, /home-card-cta/);
  for (const f of ["app/page.tsx", "app/indisponible/page.tsx"]) {
    assert.doesNotMatch(lire(f), /detail: t\(lang, "home\.product\.cta"\)/, `${f} passe encore la ligne à la grille`);
  }
  assert.doesNotMatch(lire("app/home-discovery.css"), /home-card-cta/, "règle CSS sans élément");
});

test("K4 — aucune langue ne promet une livraison locale (V-26)", () => {
  // Pas de `\b` : il ne connaît pas les accents (règle du dépôt).
  const LIVRAISON_LOCALE = /livraison locale|livrezon lokal|local delivery|entrega local/iu;
  for (const [langue, table] of Object.entries(DICT)) {
    for (const [cle, valeur] of Object.entries(table as Record<string, string>)) {
      assert.doesNotMatch(valeur, LIVRAISON_LOCALE, `${langue} ${cle} : Zabelie ne livre pas (docs/26)`);
    }
  }
  assert.ok(LIVRAISON_LOCALE.test("Livrezon lokal") && LIVRAISON_LOCALE.test("Livraison locale"), "le détecteur voit le kreyòl et le français");
});
