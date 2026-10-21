import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLISH_DRAFT_PREFIX,
  PUBLISH_DRAFT_LIMITS,
  cleanPublishCategories,
  initialPublishDraft,
  publishDraftKey,
  publishReviewKey,
  validPublishDraft,
  type PublishFields,
} from "../lib/publish-draft";
import { KIND_FILE, KIND_SERVICE, KIND_PHYSICAL } from "../lib/product-kind";
import { PREFIXE_BROUILLON, purgerBrouillons } from "../lib/digital-authoring/local-draft-purge";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const LEAF = "00000000-0000-4000-8000-000000000011";
const OTHER_LEAF = "00000000-0000-4000-8000-000000000012";
const CATEGORIES = Object.freeze([{ value: "Digital & services" }, { value: "Maison" }]);
const LEAVES = Object.freeze([
  { id: LEAF, departement: "Digital & services" },
  { id: OTHER_LEAF, departement: "Maison" },
]);

function completed() {
  const draft = initialPublishDraft(ACTOR, KIND_SERVICE);
  draft.form = {
    kind: KIND_SERVICE, title: "Retouche photo", category: CATEGORIES[0].value, categoryId: LEAF,
    priceHTG: "1000", description: "Corriger la lumière d’une photo fournie.", deliveryDays: "0",
    serviceIncludes: "Une photo\nUne correction",
  };
  return draft;
}

test("publication drafts have independent account/type keys and fresh mutable fields", () => {
  const file = initialPublishDraft(ACTOR, KIND_FILE);
  assert.equal(PUBLISH_DRAFT_PREFIX, "zabelie:publish:v1:");
  assert.equal(publishDraftKey(ACTOR, KIND_FILE), `${PUBLISH_DRAFT_PREFIX}${ACTOR}:${KIND_FILE}`);
  assert.equal(new Set([
    publishDraftKey(ACTOR, KIND_FILE), publishDraftKey(ACTOR, KIND_SERVICE), publishDraftKey(OTHER, KIND_FILE),
  ]).size, 3);
  assert.equal(publishReviewKey(ACTOR, KIND_FILE), `zabelie:publish-review:v1:${ACTOR}:${KIND_FILE}`);
  assert.equal(publishReviewKey(ACTOR, KIND_FILE).startsWith(PUBLISH_DRAFT_PREFIX), false);
  assert.equal(new Set([
    publishReviewKey(ACTOR, KIND_FILE), publishReviewKey(ACTOR, KIND_SERVICE), publishReviewKey(OTHER, KIND_FILE),
  ]).size, 3, "a durable marker cannot be shared across accounts or product types");
  assert.deepEqual(file, {
    v: 1, actorId: ACTOR,
    form: { title: "", category: "", categoryId: "", priceHTG: "", description: "", deliveryDays: "", serviceIncludes: "", kind: KIND_FILE },
    verificationRequired: false,
  });
  assert.equal(validPublishDraft(file, ACTOR, KIND_FILE), true);
  file.form.title = "Un autre travail";
  assert.equal(initialPublishDraft(ACTOR, KIND_FILE).form.title, "");
});

test("a complete or unfinished draft round-trips without numeric conversion or lost review state", () => {
  const draft = completed();
  draft.verificationRequired = true;
  const restored: unknown = JSON.parse(JSON.stringify(draft));
  assert.equal(validPublishDraft(restored, ACTOR, KIND_SERVICE), true);
  assert.deepEqual(restored, draft);
  for (const value of ["", "0", "100.0", "1e2", "2147483647.4"]) {
    draft.form.priceHTG = value;
    draft.form.deliveryDays = value;
    assert.equal(validPublishDraft(draft, ACTOR, KIND_SERVICE), true, `editing string ${value}`);
  }
});

test("restoration refuses another account, another type, an old version or an invalid identity", () => {
  const draft = completed();
  assert.equal(validPublishDraft(draft, OTHER, KIND_SERVICE), false);
  assert.equal(validPublishDraft(draft, ACTOR, KIND_FILE), false);
  assert.equal(validPublishDraft({ ...draft, actorId: OTHER }, ACTOR, KIND_SERVICE), false);
  assert.equal(validPublishDraft({ ...draft, v: 2 }, ACTOR, KIND_SERVICE), false);
  assert.equal(validPublishDraft(initialPublishDraft("visitor", KIND_FILE), "visitor", KIND_FILE), false);
  assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, kind: KIND_PHYSICAL } }, ACTOR, KIND_SERVICE), false);
});

test("malformed storage and fields are refused rather than coerced", () => {
  const draft = completed();
  for (const value of [null, false, 1, "draft", [], [draft], {}, { ...draft, form: null }, { ...draft, form: [] }]) {
    assert.equal(validPublishDraft(value, ACTOR, KIND_SERVICE), false);
  }
  for (const verificationRequired of [undefined, null, 0, 1, "false", "true"]) {
    assert.equal(validPublishDraft({ ...draft, verificationRequired }, ACTOR, KIND_SERVICE), false);
  }
  for (const field of ["title", "category", "categoryId", "priceHTG", "description", "deliveryDays", "serviceIncludes", "kind"]) {
    for (const value of [undefined, null, 100, false, [], {}]) {
      assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, [field]: value } }, ACTOR, KIND_SERVICE), false, field);
    }
  }
});

test("extra fields including attestations, authentication and upload state invalidate the snapshot", () => {
  const draft = completed();
  for (const field of ["policyOk", "policyAccepted", "consent", "access_token", "signedUrl", "loading"]) {
    assert.equal(validPublishDraft({ ...draft, [field]: true }, ACTOR, KIND_SERVICE), false, `envelope ${field}`);
    assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, [field]: true } }, ACTOR, KIND_SERVICE), false, `form ${field}`);
  }
  for (const field of Object.keys(draft)) {
    const missing: Record<string, unknown> = { ...draft };
    delete missing[field];
    assert.equal(validPublishDraft(missing, ACTOR, KIND_SERVICE), false, `missing ${field}`);
  }
});

test("text is bounded to the existing server payload sizes and small browser input buffers", () => {
  const draft = completed();
  const limits: Record<string, number> = {
    title: 140, category: 256, categoryId: 36, priceHTG: 64, description: 5000, deliveryDays: 64,
    serviceIncludes: 10 * 140 + 9,
  };
  assert.deepEqual(PUBLISH_DRAFT_LIMITS, limits);
  for (const [field, limit] of Object.entries(limits)) {
    assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, [field]: "a".repeat(limit) } }, ACTOR, KIND_SERVICE), true, `accept ${field} boundary`);
    assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, [field]: "a".repeat(limit + 1) } }, ACTOR, KIND_SERVICE), false, `reject ${field} overflow`);
  }
  for (const categoryId of ["x".repeat(37), `${LEAF}x`]) {
    assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, categoryId } }, ACTOR, KIND_SERVICE), false);
  }
  for (const categoryId of ["", "services-repair"]) {
    assert.equal(validPublishDraft({ ...draft, form: { ...draft.form, categoryId } }, ACTOR, KIND_SERVICE), true,
      "the current taxonomy, not this storage shape check, decides membership");
  }
});

test("a closed or missing category clears only its selection, preserving all seller work", () => {
  const form = Object.freeze(completed().form);
  for (const categories of [[], [{ value: "Rayon retiré" }]]) {
    assert.deepEqual(cleanPublishCategories(form, categories, LEAVES), { ...form, category: "", categoryId: "" });
    assert.equal(form.category, CATEGORIES[0].value);
    assert.equal(form.categoryId, LEAF);
  }
});

test("a missing or reparented subcategory is cleared without replacing the department or text", () => {
  const form = completed().form;
  for (const leaves of [[], [{ id: LEAF, departement: "Maison" }], [{ id: OTHER_LEAF, departement: CATEGORIES[0].value }]]) {
    assert.deepEqual(cleanPublishCategories(form, CATEGORIES, leaves), { ...form, categoryId: "" });
  }
  assert.equal(form.categoryId, LEAF);
});

test("active taxonomy and optional empty subcategory preserve exactly the draft fields", () => {
  const form = completed().form;
  const restored = cleanPublishCategories(form, CATEGORIES, LEAVES);
  assert.deepEqual(restored, form);
  assert.notEqual(restored, form);
  const departmentOnly: PublishFields = { ...form, categoryId: "" };
  assert.deepEqual(cleanPublishCategories(departmentOnly, CATEGORIES, []), departmentOnly);
  assert.deepEqual(cleanPublishCategories({ ...form, category: "" }, CATEGORIES, LEAVES), { ...form, category: "", categoryId: "" });
});

function storedKeys(keys: string[]) {
  const values = new Map(keys.map(key => [key, "preserved-value"]));
  return {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => { values.delete(key); },
    entries: () => [...values.entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

test("account changes purge other publication text while preserving all uncertainty markers, checkout and Studio", () => {
  const mine = [publishDraftKey(ACTOR, KIND_FILE), publishDraftKey(ACTOR, KIND_SERVICE)];
  const retained = [
    ...mine, publishReviewKey(ACTOR, KIND_FILE), publishReviewKey(ACTOR, KIND_SERVICE),
    publishReviewKey(OTHER, KIND_FILE), publishReviewKey(OTHER, KIND_SERVICE),
    `zabelie:checkout-attempt:${OTHER}:product`, `zabelie:checkout-review:${OTHER}:product`,
    `zabelie:checkout-retry:${OTHER}:product`, `zabelie:recipient:${OTHER}:product`,
    `${PREFIXE_BROUILLON}${OTHER}:project`, "unrelated-preference",
  ];
  const stale = [
    publishDraftKey(OTHER, KIND_FILE), publishDraftKey(OTHER, KIND_SERVICE),
    `${PUBLISH_DRAFT_PREFIX}${ACTOR}-different-account:${KIND_FILE}`,
  ];
  const storage = storedKeys([...retained, ...stale]);
  assert.equal(purgerBrouillons(storage, ACTOR, PUBLISH_DRAFT_PREFIX), stale.length);
  assert.deepEqual(storage.entries(), storedKeys(retained).entries());
  assert.equal(purgerBrouillons(storage, ACTOR, PUBLISH_DRAFT_PREFIX), 0, "repeated navigation is idempotent");
});

test("logout removes all private publication fields without erasing durable review or payment recovery identities", () => {
  const publication = [
    publishDraftKey(ACTOR, KIND_FILE), publishDraftKey(ACTOR, KIND_SERVICE),
    publishDraftKey(OTHER, KIND_FILE), publishDraftKey(OTHER, KIND_SERVICE),
  ];
  const retained = [
    publishReviewKey(ACTOR, KIND_FILE), publishReviewKey(ACTOR, KIND_SERVICE),
    publishReviewKey(OTHER, KIND_FILE), publishReviewKey(OTHER, KIND_SERVICE),
    `zabelie:checkout-attempt:${ACTOR}:product`, `zabelie:checkout-review:${ACTOR}:product`,
    `zabelie:checkout-retry:${ACTOR}:product`, `zabelie:recipient:${ACTOR}:product`,
    `${PREFIXE_BROUILLON}${ACTOR}:project`, "unrelated-preference",
  ];
  const storage = storedKeys([...publication, ...retained]);
  assert.equal(purgerBrouillons(storage, null, PUBLISH_DRAFT_PREFIX), publication.length);
  assert.deepEqual(storage.entries(), storedKeys(retained).entries());
});
