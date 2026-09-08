import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCatalogueSearch, catalogueCanonical, catalogueIsWorkingView } from "../lib/catalogue-query";
import { parseDigitalDetails, EMPTY_DIGITAL_DETAILS } from "../lib/digital-details";
import { guideLangFromPath, guideLanguagePath } from "../lib/guide-routing";

test("URL filters reject arrays, partial numbers, injection and overflow; free price stays zero", () => {
  const f = parseCatalogueSearch({ min: "0", max: "9999999999999", page: "2junk", tri: "price_htg.desc,secret" });
  assert.equal(f.minPrice, 0); assert.equal(f.maxPrice, undefined); assert.equal(f.page, 1); assert.equal(f.sort, "recent");
  assert.equal(parseCatalogueSearch({ min: ["10", "20"] }).minPrice, undefined);
  assert.equal(parseCatalogueSearch({ min: "-1", max: "10.5" }).maxPrice, undefined);
  assert.equal(parseCatalogueSearch({ min: "900", max: "100" }).priceRangeInvalid, true);
});
test("downloadable universe drops stale physical zones", () => {
  const f = parseCatalogueSearch({ univers: "numerique", zd: "zone", zk: "commune", zq: "quartier" });
  assert.deepEqual([f.zd, f.zk, f.zq], [undefined, undefined, undefined]);
  assert.equal(parseCatalogueSearch({ univers: "objets", zd: "zone" }).zd, "zone");
});
test("paginated catalogue canonical is distinct and filters are noindex", () => {
  const url = catalogueCanonical({ univers: "numerique", cat: "Arts & design", sous: "templates", page: "2", q: "hidden", min: "10" });
  const parsed = new URL(url, "https://zabelie.com");
  assert.equal(parsed.searchParams.get("page"), "2"); assert.equal(parsed.searchParams.get("cat"), "Arts & design");
  assert.equal(parsed.searchParams.has("q"), false); assert.equal(parsed.searchParams.has("min"), false);
  assert.equal(catalogueCanonical({ page: "1" }), "/catalogue");
  for (const input of [{ q: "pdf" }, { zd: "zone" }, { min: "0" }, { tri: "ventes" }]) assert.equal(catalogueIsWorkingView(input), true);
  assert.equal(catalogueIsWorkingView({ page: "2", univers: "numerique" }), false);
});
test("digital facts accept bounded text only and never accept a storage path field", () => {
  assert.deepEqual(parseDigitalDetails({ ...EMPTY_DIGITAL_DETAILS, formats: " PDF " }), { ...EMPTY_DIGITAL_DETAILS, formats: "PDF" });
  for (const input of [null, [], {}, { ...EMPTY_DIGITAL_DETAILS, formats: 3 }, { ...EMPTY_DIGITAL_DETAILS, license: "x".repeat(1201) }, { ...EMPTY_DIGITAL_DETAILS, storage_path: "private.zip" }]) assert.equal(parseDigitalDetails(input), null);
});
test("guide languages are routed only on explicit public guide URLs", () => {
  assert.equal(guideLangFromPath("/guides/ht/produits-numeriques"), "ht");
  for (const path of ["/guides/france", "/guides/de/a", "/api/guides/ht", "/mes-achats"]) assert.equal(guideLangFromPath(path), undefined);
  assert.equal(guideLanguagePath("/guides/ht/produits-numeriques", "en"), "/guides/en/produits-numeriques");
  assert.equal(guideLanguagePath("/panier", "en"), null);
});
