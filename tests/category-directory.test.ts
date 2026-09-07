import { test } from "node:test";
import assert from "node:assert/strict";
import { filterCategoryDirectory } from "../lib/category-directory";
import type { RayonMenu } from "../lib/taxonomy";

const node = (label: string, enfants: RayonMenu[] = []): RayonMenu => ({ label, slug: label, href: `/catalogue?cat=${encodeURIComponent(label)}`, vide: true, enfants });
const tree = [node("Mode", [node("Vêtements", [node("Robes"), node("Écharpes")])]), node("Maison")];
test("la recherche sans accent conserve tous les ancêtres de la sous-catégorie", () => {
  const result = filterCategoryDirectory(tree, " ECHARPES ");
  assert.equal(result[0].label, "Mode");
  assert.equal(result[0].enfants[0].label, "Vêtements");
  assert.deepEqual(result[0].enfants[0].enfants.map(row => row.label), ["Écharpes"]);
  assert.equal(tree[0].enfants[0].enfants.length, 2);
});
test("un parent trouvé conserve ses enfants et leurs URLs", () => {
  assert.deepEqual(filterCategoryDirectory(tree, "mode"), [tree[0]]);
  assert.deepEqual(filterCategoryDirectory(tree, ""), tree);
  assert.deepEqual(filterCategoryDirectory(tree, "inconnu"), []);
});
