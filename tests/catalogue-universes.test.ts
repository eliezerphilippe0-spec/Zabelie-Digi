import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogueUniverse, CATALOGUE_UNIVERSES, universeHref } from "../lib/catalogue-universes";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE } from "../lib/product-kind";

test("chaque univers sélectionne le type canonique attendu", () => {
  assert.equal(CATALOGUE_UNIVERSES.objets.kind, KIND_PHYSICAL);
  assert.equal(CATALOGUE_UNIVERSES.numerique.kind, KIND_FILE);
  assert.equal(CATALOGUE_UNIVERSES.services.kind, KIND_SERVICE);
  for (const key of ["objets", "numerique", "services"] as const) {
    const query = new URL(universeHref(key), "https://zabelie.com").searchParams;
    assert.equal(catalogueUniverse(query.get("univers")), key);
  }
});

test("un paramètre inconnu ou hérité ne sélectionne jamais un univers", () => {
  for (const value of [undefined, null, "", "constructor", "__proto__", "toString", "numerique&cat=Photo", ["numerique"]]) {
    assert.equal(catalogueUniverse(value), undefined);
  }
});
