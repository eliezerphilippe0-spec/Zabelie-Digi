import test from "node:test";
import assert from "node:assert/strict";
import { ListCategoriesOutput, SlugSchema } from "../lib/api/v1/schemas";

/**
 * Le contrat de l'API v1 et les adresses kreyòl (docs/78, 2026-10-29) :
 * `list_categories` répondait 500 en production parce que 9 rayons sur 83
 * portent un accent et que `SlugSchema` n'acceptait que l'ASCII.
 */

// Accent EN FRONTIÈRE (fin ou début de mot) : les seules positions qui trompent un motif ASCII.
const KREYOL = ["luil-motè", "krem-kò", "sewòm", "pwoteksyon-solè", "bè-luil-natirèl", "très-kwochè", "ekoutè", "kou-ak-fòmasyon", "konsèy-ak-jesyon", "èske"];
const FRANCAIS = ["café", "marché", "santé", "côté", "déjà", "élève"];

test("SlugSchema : les adresses kreyòl et françaises du catalogue sont acceptées", () => {
  for (const s of [...KREYOL, ...FRANCAIS, "formation-en-ia-4fcvl", "bebeto"]) assert.ok(SlugSchema.safeParse(s).success, s);
});

test("SlugSchema : majuscule, espace, séparateurs et balisage restent refusés (connu-négatif)", () => {
  for (const s of ["Luil-motè", "luil motè", "a/b", "a_b", "a.b", "<script>", "", "x".repeat(201)]) {
    assert.equal(SlugSchema.safeParse(s).success, false, JSON.stringify(s));
  }
});

test("list_categories : une page qui contient un rayon accentué respecte le contrat de sortie", () => {
  const page = {
    type: "category_list",
    categories: [
      { id: "8ca8c488-1643-4bff-bf61-70f8e6ba2d2b", slug: "luil-motè", parentId: "4dbd03cc-b742-4382-94ab-b987c877d5e2", level: 3, label: "Luil motè", departmentFilter: null },
      { id: "4dbd03cc-b742-4382-94ab-b987c877d5e2", slug: "oto-moto", parentId: null, level: 1, label: "Oto & moto", departmentFilter: "Auto & moto" },
    ],
    nextCursor: null,
  };
  const r = ListCategoriesOutput.safeParse(page);
  assert.ok(r.success, JSON.stringify(r.success ? null : r.error.issues));
});
