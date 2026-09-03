import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { jsonLdProduit } from "../lib/jsonld-produit";
import type { ProductView } from "../lib/products";

/**
 * LE BALISAGE PRODUIT NE DIT QUE CE QUE LA BASE TIENT.
 *
 * Quatre décisions, chacune éprouvée par un cas où elle rougirait :
 *   • pas de note sur zéro avis ;
 *   • le prix est celui affiché (flash compris), en HTG ;
 *   • un fichier ou une prestation est « en stock » par nature, un physique
 *     suit son stock réel ;
 *   • la page rend ce balisage, calculé à partir des MÊMES sources qu'elle.
 */

const base = (sur: Partial<ProductView> = {}): ProductView => ({
  id: "p1",
  slug: "cours-francisation",
  title: "Cours de francisation",
  creator: "Marie Jacmel",
  creatorId: "s1",
  kind: "service",
  category: "Sèvis",
  priceHTG: 300,
  sales: 0,
  ratingAvg: null,
  ratingCount: 0,
  accent: "from-accent to-brand",
  coverUrl: null,
  blurb: "Dix séances en ligne.",
  deliveryDays: 7,
  serviceIncludes: [],
  ...sur,
});

test("J1 — zéro avis → aucun AggregateRating (une note inventée serait une pénalité)", () => {
  const ld = jsonLdProduit(base(), { prixHtg: 300, disponible: null });
  assert.equal(ld["@type"], "Product");
  assert.ok(!("aggregateRating" in ld), "aggregateRating ne doit pas exister à 0 avis");
});

test("J2 — un avis payé → AggregateRating, bornes 1..5, compte exact", () => {
  const ld = jsonLdProduit(base({ ratingAvg: 4.5, ratingCount: 2 }), { prixHtg: 300, disponible: null }) as {
    aggregateRating: Record<string, string>;
  };
  assert.deepEqual(ld.aggregateRating, {
    "@type": "AggregateRating",
    ratingValue: "4.5",
    reviewCount: "2",
    bestRating: "5",
    worstRating: "1",
  });
});

test("J3 — le prix est celui affiché (flash compris), en HTG, en chaîne", () => {
  const ld = jsonLdProduit(base({ priceHTG: 1000 }), { prixHtg: 750, disponible: null }) as {
    url: string;
    offers: Record<string, string>;
  };
  assert.equal(ld.offers.price, "750", "le prix flash affiché prime sur priceHTG");
  assert.equal(ld.offers.priceCurrency, "HTG");
  assert.equal(ld.offers.url, ld.url);
});

test("J4 — disponibilité : fichier et prestation en stock par nature ; physique suit son stock", () => {
  const dispo = (p: ProductView, d: boolean | null) =>
    (jsonLdProduit(p, { prixHtg: 100, disponible: d }) as { offers: { availability: string } }).offers.availability;
  // ⚠️ Le type téléchargeable s'appelle `fichier` dans l'union (pas `file`) :
  // la première version du test écrivait "file", tsc l'a refusé, et J4 était
  // rouge sur le vrai code — donc les mutations de ce fichier ne prouvaient
  // rien avant cette ligne. Le témoin d'abord.
  assert.match(dispo(base({ kind: "fichier" }), false), /InStock$/, "un fichier ne s'épuise pas, même si on lui passe false");
  assert.match(dispo(base({ kind: "service" }), false), /InStock$/, "une prestation se réserve");
  assert.match(dispo(base({ kind: "physical" }), true), /InStock$/);
  assert.match(dispo(base({ kind: "physical" }), false), /OutOfStock$/, "un physique à zéro le DIT");
  assert.match(dispo(base({ kind: "physical" }), null), /InStock$/, "stock inconnu ≠ rupture");
});

test("J5 — image et catégorie seulement si elles existent (pas de champ vide)", () => {
  const sans = jsonLdProduit(base({ coverUrl: null, category: "" }), { prixHtg: 1, disponible: null });
  assert.ok(!("image" in sans) && !("category" in sans));
  const avec = jsonLdProduit(base({ coverUrl: "https://x/y.jpg" }), { prixHtg: 1, disponible: null });
  assert.equal(avec.image, "https://x/y.jpg");
});

/* ── J6 — CROISEMENT : la page rend le balisage depuis les MÊMES sources ── */
test("J6 — /produit/[slug] calcule le JSON-LD depuis flash et physical, et le rend", () => {
  const page = readFileSync(join(import.meta.dirname, "..", "app/produit/[slug]/page.tsx"), "utf8");
  assert.match(
    page,
    /const jsonLd = jsonLdProduit\(product, \{\s*prixHtg: flash \? flash\.prixFlashHtg : product\.priceHTG,\s*disponible: physical \? physical\.variants\.some\(\(v\) => v\.available > 0\) : null,\s*\}\);/,
    "le prix et le stock du balisage doivent être ceux de la page — flash et variantes"
  );
  assert.match(
    page,
    /<script\s+type="application\/ld\+json"\s+dangerouslySetInnerHTML=\{\{ __html: JSON\.stringify\(jsonLd\) \}\}/,
    "le balisage doit être RENDU, pas seulement calculé"
  );
});
