import { test } from "node:test";
import assert from "node:assert/strict";
import { getMonCashAvailability, MONCASH_AVAILABILITY_LABELS } from "../lib/payment-availability";
import { LANGS, t } from "../lib/i18n";
const credentials = { NODE_ENV: "test" as const, MONCASH_CLIENT_ID: "test-id", MONCASH_CLIENT_SECRET: "test-secret" };
test("public payment availability never presents missing or invalid credentials as live", () => {
  for (const env of [
    { NODE_ENV: "test" as const },
    { ...credentials, MONCASH_MODE: "production", MONCASH_CLIENT_ID: " " },
    { ...credentials, MONCASH_MODE: "production", MONCASH_CLIENT_SECRET: "" },
    { ...credentials, MONCASH_MODE: "invalid" },
  ]) assert.equal(getMonCashAvailability(env), "unavailable");
});
test("sandbox including the default mode remains distinct from production", () => {
  assert.equal(getMonCashAvailability(credentials), "sandbox");
  assert.equal(getMonCashAvailability({ ...credentials, MONCASH_MODE: "sandbox" }), "sandbox");
  assert.equal(getMonCashAvailability({ ...credentials, MONCASH_MODE: "production" }), "production");
  assert.equal(getMonCashAvailability({ ...credentials, MONCASH_MODE: " production " }), "production");
});
test("every availability state has a distinct translated public label", () => {
  for (const lang of LANGS) {
    const labels = Object.values(MONCASH_AVAILABILITY_LABELS).map(key => t(lang, key));
    assert.equal(new Set(labels).size, 3);
    for (const label of labels) assert.ok(label && !label.includes("test-secret") && !label.startsWith("availability."));
  }
});
