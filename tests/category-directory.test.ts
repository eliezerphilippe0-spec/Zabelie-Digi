import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterCategoryDirectory } from "../lib/category-directory";
import { rayonsPeuples } from "../lib/taxonomy";
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

// ── Rayons vides masqués (décision porteur 2026-10-04) ─────────────────────

const n = (label: string, vide: boolean, enfants: RayonMenu[] = []): RayonMenu => ({ label, slug: label, href: `/c/${label}`, vide, enfants });

test("un rayon vide disparaît avec sa descendance ; un rayon peuplé perd ses sous-rayons vides", () => {
  const menu = [
    n("Mode", false, [n("Femme", false, [n("Robes", true), n("Écharpes", false)]), n("Homme", true, [n("Chemises", true)])]),
    n("Auto", true, [n("Pièces", true)]),
  ];
  const vus = rayonsPeuples(menu);
  assert.deepEqual(vus.map((r) => r.label), ["Mode"]);
  assert.deepEqual(vus[0].enfants.map((r) => r.label), ["Femme"]);
  assert.deepEqual(vus[0].enfants[0].enfants.map((r) => r.label), ["Écharpes"]);
  assert.equal(menu[0].enfants.length, 2, "le menu brut n'est pas modifié");
  assert.deepEqual(rayonsPeuples([n("Auto", true)]), []);
  assert.deepEqual(rayonsPeuples(rayonsPeuples(menu)), vus, "idempotent");
});

test("/categories n'affiche que les rayons peuplés, et ne s'indexe pas quand il n'y en a aucun", () => {
  const page = readFileSync("app/categories/page.tsx", "utf8");
  assert.match(page, /const brut = await getMenuRayons\(lang\);\s*const all = rayonsPeuples\(brut\);\s*const rows = filterCategoryDirectory\(all, q\);/);
  assert.match(page, /const vide = rayonsPeuples\(await getMenuRayons\(lang\)\)\.length === 0;[\s\S]{0,200}robots: vide \|\|/);
  assert.doesNotMatch(page, /directory\.empty/, "plus de mention « aucune offre » par rayon");
  // Le menu et le sitemap masquaient déjà : témoin que ce n'est pas régressé.
  assert.match(readFileSync("components/category-chips.tsx", "utf8"), /const pleins = rayons\.filter\(\(r\) => !r\.vide\);/);
  assert.match(readFileSync("app/sitemap.ts", "utf8"), /rayons\.filter\(\(r\) => !r\.vide\)/);
});
