import { test } from "node:test";
import assert from "node:assert/strict";
import { readOfflineListings, rememberListing, OFFLINE_MAX_AGE, OFFLINE_LIMIT } from "../lib/marketplace-offline";
import { parseCommitment, availabilityNeedsReview } from "../lib/product-commitments";
import { marketplaceCopy } from "../lib/marketplace-copy";
import { topupConfiguration } from "../lib/topup-availability";

const now = Date.parse("2026-09-17T12:00:00Z");
const listing = { slug: "lampe-solaire", title: "Lampe solaire", priceHTG: 1500 };
test("offline copies exclude private fields, malformed URLs and stale or future prices", () => {
  const rows = readOfflineListings(JSON.stringify([
    { ...listing, viewedAt: now, token: "private", orderId: "private" },
    { ...listing, slug: "../mes-achats", viewedAt: now },
    { ...listing, slug: "old", viewedAt: now - OFFLINE_MAX_AGE - 1 },
    { ...listing, slug: "future", viewedAt: now + 1 },
    { ...listing, slug: "bad-price", priceHTG: 1.5, viewedAt: now },
  ]), now);
  assert.deepEqual(rows, [{ ...listing, viewedAt: now }]);
  assert.deepEqual(readOfflineListings("broken", now), []);
  assert.deepEqual(readOfflineListings("null", now), []);
});
test("offline storage deduplicates and limits recent offers", () => {
  let rows: ReturnType<typeof readOfflineListings> = [];
  for (let i = 0; i < 30; i++) rows = rememberListing(JSON.stringify(rows), { ...listing, slug: "offer-" + i }, now + i);
  assert.equal(rows.length, OFFLINE_LIMIT);
  const result = rememberListing(JSON.stringify(rows), { ...listing, slug: "offer-29", priceHTG: 2000 }, now + 40);
  assert.equal(result.length, OFFLINE_LIMIT);
  assert.equal(result[0].priceHTG, 2000);
  assert.equal(new Set(result.map(p => p.slug)).size, OFFLINE_LIMIT);
});
const valid = { zones: " Delmas ", pickup: "", delivery_days: 2, fees: "included", next_available: null, confirmAvailability: false };
test("seller declarations validate lengths, dates and integer days", () => {
  assert.equal(parseCommitment(valid, now)?.zones, "Delmas");
  for (const change of [
    { delivery_days: -1 }, { delivery_days: 1.2 }, { delivery_days: 366 },
    { fees: "paid" }, { zones: "x".repeat(301) }, { pickup: "x".repeat(181) },
    { confirmAvailability: "true" }, { next_available: "2027-02-30" },
    { next_available: "2026-01-01" }, { next_available: "2035-01-01" },
  ]) assert.equal(parseCommitment({ ...valid, ...change }, now), null);
  assert.ok(parseCommitment({ ...valid, next_available: "2026-09-18" }, now));
});
test("availability never assumes a missing or old seller declaration is fresh", () => {
  assert.equal(availabilityNeedsReview(null, now), true);
  assert.equal(availabilityNeedsReview("invalid", now), true);
  assert.equal(availabilityNeedsReview(new Date(now - 8 * 86400_000).toISOString(), now), true);
  assert.equal(availabilityNeedsReview(new Date(now - 86400_000).toISOString(), now), false);
});
test("top-up configuration is fail-closed and follows the provider production mode", () => {
  const env = { ZABELIE_TOPUP_FIRSTPARTY_ENABLED: "true", RELOADLY_CLIENT_ID: "id", RELOADLY_CLIENT_SECRET: "secret", RELOADLY_MODE: "production" };
  assert.equal(topupConfiguration(env), "configured");
  assert.equal(topupConfiguration({ ...env, RELOADLY_MODE: "sandbox" }), "sandbox");
  assert.equal(topupConfiguration({ ...env, RELOADLY_MODE: "sandbox", ZABELIE_TOPUP_FIRSTPARTY_ENABLED: undefined }), "sandbox");
  assert.equal(topupConfiguration({ ...env, RELOADLY_MODE: "sandbox", RELOADLY_CLIENT_SECRET: " " }), "unavailable");
  for (const change of [{ RELOADLY_MODE: "live" }, { RELOADLY_MODE: "" }, { RELOADLY_CLIENT_SECRET: " " }, { ZABELIE_TOPUP_FIRSTPARTY_ENABLED: "false" }]) assert.equal(topupConfiguration({ ...env, ...change }), "unavailable");
});
test("all four languages cover every new customer-facing label", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    assert.deepEqual(Object.keys(marketplaceCopy(lang)).sort(), Object.keys(marketplaceCopy("fr")).sort());
    assert.ok(Object.values(marketplaceCopy(lang)).every(s => s.trim()));
  }
});
