import { test } from "node:test";
import assert from "node:assert/strict";
import { purchaseView, purchaseKind, purchasePage, purchaseHref, purchaseIsConfirmed, purchaseStatusKey } from "../lib/purchase-center";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE } from "../lib/product-kind";
import { sellerReadiness } from "../lib/seller-readiness";

test("purchase actions fail closed for unpaid, cancelled, disputed and unknown states", () => {
  for (const status of ["pending", "refunded", "disputed", "cancelled", "future", "", "PAID"]) assert.equal(purchaseIsConfirmed(status), false);
  for (const status of ["paid", "delivered"]) assert.equal(purchaseIsConfirmed(status), true);
  assert.equal(purchaseStatusKey("future"), "purchases.status.unknown");
});
test("purchase filters reject repeated/invalid URL inputs and keep universe in pagination", () => {
  for (const value of [undefined, ["numerique"], "__proto__", "bad"]) assert.equal(purchaseView(value), "tout");
  for (const value of ["0", "-1", "1.5", "Infinity", "1x", ["2"], "999999999999999"]) assert.equal(purchasePage(value), 1);
  assert.equal(purchasePage("12"), 12);
  assert.equal(purchaseKind("numerique"), KIND_FILE);
  assert.equal(purchaseKind("objets"), KIND_PHYSICAL);
  assert.equal(purchaseKind("prestations"), KIND_SERVICE);
  assert.equal(purchaseKind("tout"), null);
  assert.equal(purchaseHref("numerique", 2), "/mes-achats?vue=numerique&page=2");
});
test("seller preparation uses saved content and separates physical, file and service requirements", () => {
  const base = { description: " ", cover_url: null, product_assets: [], delivery_days: null, service_includes: [] };
  assert.deepEqual(sellerReadiness({ ...base, kind: KIND_FILE }, false).map(c => c.complete), [false, false, false]);
  assert.deepEqual(sellerReadiness({ ...base, kind: KIND_FILE, description: "PDF", product_assets: [{ id: "asset" }] }, true).map(c => c.complete), [true, true, true]);
  const service = sellerReadiness({ ...base, kind: KIND_SERVICE, delivery_days: 0, service_includes: ["Consultation"] }, false);
  assert.equal(service.find(c => c.key === "seller.ready.delay")?.complete, true);
  assert.equal(service.some(c => c.key === "seller.ready.asset"), false);
  assert.equal(sellerReadiness({ ...base, kind: KIND_PHYSICAL }, false).length, 2);
});
