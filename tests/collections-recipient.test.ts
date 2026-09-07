import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeRecipient } from "../lib/order-recipient";
import { collectionKind, UUID_RE } from "../lib/collections";
const valid = { name: " Marie ", phone: "+509 3412-3456", locality: " Jacmel ", note: "Matin", consent: true };
test("recipient normalized before persistence; an explicit permission is required", () => {
  assert.deepEqual(normalizeRecipient(valid), { full_name: "Marie", phone: "34123456", locality: "Jacmel", note: "Matin" });
  for (const bad of [null, [], {}, { ...valid, consent: false }, { ...valid, consent: "true" }, { ...valid, phone: "abc34123456" }, { ...valid, phone: "12345678" }, { ...valid, name: "A" }, { ...valid, name: "A".repeat(101) }, { ...valid, locality: "x" }, { ...valid, note: "x".repeat(501) }]) assert.equal(normalizeRecipient(bad), null);
});
test("collection whitelist cannot become a caller-selected table", () => {
 assert.equal(collectionKind("favorites"), "favorites"); assert.equal(collectionKind("shops"), "shops");
 for (const bad of ["profiles", "__proto__", [], null]) assert.equal(collectionKind(bad), null);
 assert.equal(UUID_RE.test("id.or.user_id.eq.other"), false);
});
