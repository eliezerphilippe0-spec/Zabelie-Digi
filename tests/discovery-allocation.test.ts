
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateHomeRows } from "../lib/home-sections";
import { catalogueHref } from "../lib/catalogue-query";

const products = (count: number, start = 0) => Array.from({ length: count }, (_, n) => ({ id: String(n + start), title: "Same title" }));

test("mixed overlapping rows never repeat an offer, and fill from later candidates", () => {
  const p = products(26);
  const rows = allocateHomeRows([
    { key: "main", items: p, limit: 12, primary: true },
    { key: "next", items: [p[2], p[2], ...p], limit: 6 },
    { key: "last", items: p, limit: 6 },
  ], ["0"]);
  assert.deepEqual(rows.main.map(p => p.id), products(12, 1).map(p => p.id));
  assert.deepEqual(rows.next.map(p => p.id), products(6, 13).map(p => p.id));
  const all = Object.values(rows).flat().map(p => p.id);
  assert.equal(new Set(all).size, 24);
  assert.equal(all.includes("0"), false);
});

test("a hidden row consumes no products, including four or five mobile-only candidates", () => {
  for (const count of [0, 1, 3, 4, 5]) {
    const p = products(8);
    const rows = allocateHomeRows([
      { key: "hidden", items: p.slice(0, count), limit: 6 },
      { key: "visible", items: p, limit: 6 },
    ]);
    assert.deepEqual(rows.hidden, []);
    assert.deepEqual(rows.visible, p.slice(0, 6));
  }
});

test("small catalogues stay visible; offers with identical names stay distinct", () => {
  assert.deepEqual(allocateHomeRows([{ key: "main", items: [], limit: 12, primary: true }]).main, []);
  for (const count of [1, 2, 5]) {
    const p = products(count);
    assert.deepEqual(allocateHomeRows([{ key: "main", items: p, limit: 12, primary: true }]).main, p);
  }
  const p = products(6);
  const original = structuredClone(p);
  assert.equal(allocateHomeRows([{ key: "offers", items: p, limit: 6 }]).offers.length, 6);
  assert.deepEqual(p, original);
});

test("clear a failed query without losing budget, destination, category or sort", () => {
  const url = new URL(catalogueHref({ q: "introuvable", univers: "objets", cat: "Maison", sous: "bureau", min: "0", max: "1500", zd: "nord", zk: "ville", tri: "prix-croissant", page: "4" }, { q: null, page: 1 }), "https://example.test");
  assert.equal(url.searchParams.has("q"), false);
  assert.equal(url.searchParams.has("page"), false);
  for (const [key, value] of Object.entries({ univers: "objets", cat: "Maison", sous: "bureau", min: "0", max: "1500", zd: "nord", zk: "ville", tri: "prix-croissant" })) assert.equal(url.searchParams.get(key), value);
});

test("navigation validates input and clears stale physical zones for digital products", () => {
  assert.equal(catalogueHref({ q: ["a", "b"], tri: "injection", min: "-1" }), "/catalogue");
  const url = new URL(catalogueHref({ univers: "objets", zd: "zone", cat: "Maison", sous: "bureau" }, { univers: "numerique", cat: "Tout", sous: null, max: 0 }), "https://example.test");
  assert.equal(url.searchParams.has("zd"), false);
  assert.equal(url.searchParams.has("cat"), false);
  assert.equal(url.searchParams.has("sous"), false);
  assert.equal(url.searchParams.get("max"), "0");
});
