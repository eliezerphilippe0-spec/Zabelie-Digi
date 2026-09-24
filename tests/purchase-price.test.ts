import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readPurchasePrice } from "../lib/purchase-price";
import { KIND_PHYSICAL, KIND_FILE } from "../lib/product-kind";

const product = { id: "product", kind: KIND_PHYSICAL, price_htg: 1000 } as const;
const first = "55555555-5555-5555-5555-555555555555";
const second = "66666666-6666-6666-6666-666666666666";
const rows = [
  { id: first, product_id: "product", price_htg: 800, active: true },
  { id: second, product_id: "product", price_htg: 1700, active: true },
  { id: "77777777-7777-7777-7777-777777777777", product_id: "other", price_htg: 5, active: true },
  { id: "88888888-8888-8888-8888-888888888888", product_id: "product", price_htg: 5, active: false },
];
function client(data = rows, error = false): SupabaseClient {
  return { from: () => {
    const filters: [string, unknown][] = [];
    const query = { select: () => query, eq: (k: string, v: unknown) => { filters.push([k, v]); return query; },
      limit: async (n: number) => ({ data: data.filter(r => filters.every(([k,v]) => r[k as keyof typeof r] === v)).slice(0,n), error: error ? { code: "offline" } : null }) };
    return query;
  } } as unknown as SupabaseClient;
}
test("purchase uses the selected variant price, including quantities", async () => {
  assert.deepEqual(await readPurchasePrice(client(), product, second, 2), { ok: true, priceHTG: 3400, variantId: second, quantity: 2 });
  assert.equal((await readPurchasePrice(client(), product, first)).ok, true);
});
test("another product, inactive variant and malformed selection cannot supply a price", async () => {
  for (const id of [rows[2].id, rows[3].id, "", 5, {}]) assert.deepEqual(await readPurchasePrice(client(), product, id), { ok: false, code: "variant_invalid" });
});
test("multiple variants require a choice; a single variant can be selected server-side", async () => {
  assert.deepEqual(await readPurchasePrice(client(), product, undefined), { ok: false, code: "variant_required" });
  assert.deepEqual(await readPurchasePrice(client([rows[0]]), product, undefined), { ok: true, priceHTG: 800, variantId: first, quantity: 1 });
});
test("invalid quantities, overflow and unavailable prices cannot create an order", async () => {
  for (const quantity of [0, -1, 1.5, "2", null, 2147483647]) assert.equal((await readPurchasePrice(client(), product, second, quantity)).ok, false);
  assert.deepEqual(await readPurchasePrice(client(rows, true), product, first), { ok: false, code: "price_unavailable" });
});
test("digital purchases keep their price and cannot reserve a physical variant", async () => {
  const digital = { ...product, kind: KIND_FILE, price_htg: 2500 } as const;
  assert.deepEqual(await readPurchasePrice(client(), digital, undefined), { ok: true, priceHTG: 2500, variantId: null, quantity: 1 });
  assert.deepEqual(await readPurchasePrice(client(), digital, first), { ok: false, code: "variant_invalid" });
});
