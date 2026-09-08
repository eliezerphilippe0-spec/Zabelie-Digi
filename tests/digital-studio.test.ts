import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDigitalStudio, EMPTY_DIGITAL_STUDIO, digitalAccessAllowed, releaseAllowed, conversionPercent, formatDigitalSize, type DigitalRelease } from "../lib/digital-studio";
import { t, LANGS } from "../lib/i18n";
import { STUDIO_KEYS } from "../lib/digital-studio-labels";
const lesson = { id: "00000000-0000-0000-0000-000000000001", chapter: "Intro", title: "First lesson", body: "Private content", assetId: "", free: false };
test("studio validates complete course drafts and rejects unknown/private injection fields", () => {
  assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, mode: "course", lessons: [lesson] })?.lessons[0].body, "Private content");
  for (const bad of [null, [], { ...EMPTY_DIGITAL_STUDIO, storage_path: "secret" }, { ...EMPTY_DIGITAL_STUDIO, mode: "subscription" }, { ...EMPTY_DIGITAL_STUDIO, include_updates: "false" }]) assert.equal(parseDigitalStudio(bad), null);
});
test("draft bounds prevent duplicate lessons, foreign resources and oversized content", () => {
  for (const lessons of [[lesson, lesson], [{ ...lesson, assetId: "https://evil.test/private" }], [{ ...lesson, body: "x".repeat(12001) }], [{ ...lesson, title: " " }], [{ ...lesson, free: "true" }]]) assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, mode: "course", lessons }), null);
  assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, preview: "x".repeat(6001) }), null);
  assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, faq: [{ question: "Q", answer: " " }] }), null);
});
test("courses cannot be silently exposed through a file/bundle draft", () => {
  assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, mode: "bundle", lessons: [lesson] }), null);
  assert.equal(parseDigitalStudio({ ...EMPTY_DIGITAL_STUDIO, mode: "file", lessons: [lesson] }), null);
});
test("download access rejects every non-confirmed status and other buyers", () => {
  for (const status of ["pending", "cancelled", "refunded", "disputed", "unknown", ""]) assert.equal(digitalAccessAllowed("buyer", { buyer_id: "buyer", status }), false);
  for (const status of ["paid", "delivered"]) {
    assert.equal(digitalAccessAllowed("buyer", { buyer_id: "buyer", status }), true);
    assert.equal(digitalAccessAllowed("intruder", { buyer_id: "buyer", status }), false);
  }
  assert.equal(digitalAccessAllowed("buyer", null), false);
});
test("updates depend on the acquired contract, never a seller’s current checkbox", () => {
  const original = { id: "v1", product_id: "p1", version: 1, manifest: { include_updates: false } } as DigitalRelease;
  const next = { id: "v2", product_id: "p1", version: 2 };
  assert.equal(releaseAllowed(original, original), true);
  assert.equal(releaseAllowed(original, next), false);
  const entitled = { ...original, manifest: { ...original.manifest, include_updates: true } };
  assert.equal(releaseAllowed(entitled, next), true);
  assert.equal(releaseAllowed(entitled, { ...next, product_id: "another-seller" }), false);
  assert.equal(releaseAllowed(entitled, { ...next, version: 0 }), false);
});
test("metrics distinguish no sample from a real zero conversion rate", () => {
  assert.equal(conversionPercent(0, 0), null);
  assert.equal(conversionPercent(0, 4), 0);
  assert.equal(conversionPercent(1, 3), 33.3);
});
test("every new control has a translation in all four languages", () => {
  for (const lang of LANGS) for (const key of STUDIO_KEYS) assert.notEqual(t(lang, `studio.${key}`), `studio.${key}`);
});

test("small file sizes are not presented as empty downloads", () => {
  assert.equal(formatDigitalSize(null, "fr"), "—");
  assert.equal(formatDigitalSize(0, "en"), "—");
  assert.match(formatDigitalSize(1024, "en"), /1/);
  assert.match(formatDigitalSize(2000000, "fr"), /2/);
});
