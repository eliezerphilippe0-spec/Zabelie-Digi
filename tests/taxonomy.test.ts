import test from "node:test";
import assert from "node:assert/strict";
import { agregerFacettes } from "../lib/taxonomy";

/**
 * Le regroupement des rayons, éprouvé sans base.
 *
 * En local il n'y a pas de Supabase : tout `getCategoryFacets` rend une liste
 * vide, et une capture d'écran ne prouverait rien. Le cœur est donc sorti de
 * la requête pour être exercé sur des cas construits — c'est là que vivent
 * les vraies fautes : un niveau 3 compté deux fois, un parent absent qui fait
 * disparaître un rayon, un rayon vide qui s'affiche quand même.
 */

const CATS = [
  { id: "d1", slug: "fren-oto", label_fr: "Freinage", label_kr: "Fren", level: 3, parent_id: "p1" },
  { id: "d2", slug: "filtrasyon-oto", label_fr: "Filtration", label_kr: "Filtrasyon", level: 3, parent_id: "p1" },
  { id: "p1", slug: "pyes-detache-oto", label_fr: "Pièces détachées auto", label_kr: "Pyès detache oto", level: 2, parent_id: "r" },
  { id: "p2", slug: "kawotchou-jant", label_fr: "Pneus & jantes", label_kr: "Kawotchou", level: 2, parent_id: "r" },
];

test("les niveaux 3 remontent sur leur parent, et les comptes s'additionnent", () => {
  const f = agregerFacettes(
    [
      { category_id: "d1" },
      { category_id: "d1" },
      { category_id: "d2" },
      { category_id: "p2" },
    ],
    CATS,
    "fr",
  );
  assert.deepEqual(
    f,
    [
      { slug: "pyes-detache-oto", label: "Pièces détachées auto", count: 3 },
      { slug: "kawotchou-jant", label: "Pneus & jantes", count: 1 },
    ],
    "2 freins + 1 filtration doivent faire 3 sous le parent commun",
  );
});

test("un rayon SANS produit n'apparaît jamais (V-13)", () => {
  const f = agregerFacettes([{ category_id: "p2" }], CATS, "fr");
  assert.deepEqual(f.map((x) => x.slug), ["kawotchou-jant"]);
  assert.equal(
    f.some((x) => x.slug === "pyes-detache-oto"),
    false,
    "un parent sans produit propre ni descendant peuplé ne doit pas s'afficher",
  );
});

test("parent absent du lot → le rayon enfant est conservé, pas perdu", () => {
  // Le parent n'est pas dans `cats` (il n'a lui-même aucun produit et n'a
  // donc pas été chargé). Perdre l'enfant rendrait le rayon inatteignable.
  const f = agregerFacettes([{ category_id: "d1" }], [CATS[0]], "fr");
  assert.deepEqual(f, [{ slug: "fren-oto", label: "Freinage", count: 1 }]);
});

test("Kreyòl-first : le libellé suit la langue", () => {
  const f = agregerFacettes([{ category_id: "p2" }], CATS, "ht");
  assert.equal(f[0].label, "Kawotchou");
});

test("libellé créole manquant → repli sur le français, jamais du vide", () => {
  const sansKr = [{ ...CATS[3], label_kr: "" }];
  const f = agregerFacettes([{ category_id: "p2" }], sansKr, "ht");
  assert.equal(f[0].label, "Pneus & jantes");
});

test("tri alphabétique, insensible aux accents du français", () => {
  const f = agregerFacettes(
    [{ category_id: "p1" }, { category_id: "p2" }],
    CATS,
    "fr",
  );
  assert.deepEqual(f.map((x) => x.label), ["Pièces détachées auto", "Pneus & jantes"]);
});
