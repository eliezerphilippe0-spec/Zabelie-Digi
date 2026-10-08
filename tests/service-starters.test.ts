import { test } from "node:test";
import assert from "node:assert/strict";
import { availableServiceStarters, serviceStarterCopy } from "../lib/service-starters";
import { serviceStarterDraft } from "../lib/service-starter-draft";
import { KIND_SERVICE } from "../lib/product-kind";
import { LANGS } from "../lib/i18n";
import type { OptionSousRayon } from "../lib/product-categories";

const categories = [{ value: "Digital & services", label: "Dijital ak sèvis" }];
const leaves: OptionSousRayon[] = [
  { id: "design-live", slug: "grafik-ak-design", departement: categories[0].value, chemin: "Sèvis › Grafik", level: 3 },
  { id: "repair-live", slug: "reparasyon", departement: categories[0].value, chemin: "Sèvis › Reparasyon", level: 3 },
];

test("service models resolve active taxonomy IDs, never translated category labels", () => {
  const models = availableServiceStarters("ht", categories, leaves);
  assert.equal(models.length, 3);
  assert.deepEqual(models.map(m => m.categoryId), ["design-live", "repair-live", "repair-live"]);
  assert.ok(models.every(m => m.category === "Digital & services"));
  assert.deepEqual(availableServiceStarters("ht", [], leaves), []);
  assert.deepEqual(availableServiceStarters("ht", categories, []), []);
  assert.equal(availableServiceStarters("ht", categories, leaves.slice(0, 1)).length, 1);
  assert.deepEqual(availableServiceStarters("ht", categories, leaves.map(s => ({ ...s, level: 2 }))), []);
  assert.deepEqual(availableServiceStarters("ht", categories, leaves.map(s => ({ ...s, departement: "Closed" }))), []);
});

test("all four languages supply saleable scopes within API limits", () => {
  const titles = new Set<string>();
  for (const lang of LANGS) {
    const text = serviceStarterCopy(lang);
    assert.equal(text.buyerSteps.length, 3);
    for (const value of [text.heading, text.hint, text.confirmReplace, text.buyerTitle, text.sell, ...text.buyerSteps]) assert.ok(value.trim());
    const models = availableServiceStarters(lang, categories, leaves);
    assert.equal(models.length, 3);
    titles.add(models[0].title);
    for (const model of models) {
      assert.ok(model.description.trim());
      assert.ok(model.includes.length > 0 && model.includes.length <= 10);
      assert.ok(model.includes.every(line => line.length <= 140));
    }
  }
  assert.equal(titles.size, 4);
});

test("applying a service scope requires new seller pricing and timing; no automatic publication", () => {
  const model = availableServiceStarters("fr", categories, leaves)[1];
  const draft = serviceStarterDraft(model);
  assert.equal(draft.kind, KIND_SERVICE);
  assert.equal(draft.categoryId, "repair-live");
  assert.equal(draft.priceHTG, "");
  assert.equal(draft.deliveryDays, "");
  assert.equal(draft.serviceIncludes.split("\n").length, 3);
  assert.match(draft.description, /Diagnostic uniquement/);
  assert.match(draft.description, /devis distinct avant toute réparation/);
});
