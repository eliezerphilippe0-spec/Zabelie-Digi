import { test } from "node:test";
import assert from "node:assert/strict";
import { readOfflineListings, rememberListing, OFFLINE_MAX_AGE, OFFLINE_LIMIT } from "../lib/marketplace-offline";
import { parseCommitment, availabilityNeedsReview } from "../lib/product-commitments";
import { marketplaceCopy } from "../lib/marketplace-copy";
import { t } from "../lib/i18n";
import { topupConfiguration } from "../lib/topup-availability";
import { prepareCheckoutAttempt, readCheckoutAttempt, clearCheckoutAttempt } from "../lib/use-session-draft";

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

test("pending payment copy names no exclusive operator and promises no automatic confirmation deadline", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const body = t(lang, "pay.wait.body");
    assert.doesNotMatch(body, /MonCash|automati|otomatik|quelques instants|few moments|unos instantes|kèk moman/i);
    assert.ok(body.includes({ fr: "Mes achats", ht: "Acha mwen", en: "My purchases", es: "Mis compras" }[lang]));
    assert.ok(body.includes({ fr: "contactez l’aide", ht: "kontakte èd", en: "contact support", es: "contacta con ayuda" }[lang]));
  }
});

test("checkout attempts survive reload in the same tab without storing purchase details", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    const body = JSON.stringify({ recipient: "Marie Test", phone: "34123456", consent: true });
    const key = await prepareCheckoutAttempt("attempt", body);
    assert.equal(await prepareCheckoutAttempt("attempt", body), key);
    assert.doesNotMatch(values.get("attempt")!, /Marie|34123456|recipient|consent/);
    const saved = JSON.parse(values.get("attempt")!);
    values.set("attempt", JSON.stringify({ ...saved, at: Date.now() - 31 * 60_000 }));
    assert.equal(await prepareCheckoutAttempt("attempt", body), key, "a pending order must not get a new key after its private draft expires");
    values.set("attempt", JSON.stringify({ ...saved, at: Date.now() - 9 * 24 * 60 * 60_000 }));
    assert.equal(readCheckoutAttempt("attempt"), key, "a late reconciler must not turn an unresolved purchase into a new attempt");
    assert.equal(await prepareCheckoutAttempt("attempt", body), key);
    values.set("attempt", JSON.stringify({ ...saved, at: Date.now() + 60_000 }));
    assert.equal(readCheckoutAttempt("attempt"), key, "device clock correction cannot forget an unresolved order");
    assert.equal(await prepareCheckoutAttempt("attempt", body), key);
    values.set("attempt", JSON.stringify({ ...saved, at: null }));
    assert.equal(readCheckoutAttempt("attempt"), null);
    assert.notEqual(await prepareCheckoutAttempt("attempt", body), key);
    values.set("attempt", JSON.stringify(saved));
    assert.notEqual(await prepareCheckoutAttempt("other-buyer", body), key);
    assert.notEqual(await prepareCheckoutAttempt("attempt", body + "changed"), key);
    clearCheckoutAttempt("attempt");
    assert.equal(values.has("attempt"), false);
    values.set("attempt", JSON.stringify({ at: Date.now() - 31 * 60_000, key, fingerprint: "stale" }));
    assert.notEqual(await prepareCheckoutAttempt("attempt", body), key);
    values.set("attempt", "invalid-json");
    assert.equal(readCheckoutAttempt("attempt"), null);
    assert.match(await prepareCheckoutAttempt("attempt", body), /^[0-9a-f-]{36}$/);
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
      getItem: () => { throw new Error("Storage blocked"); },
      setItem: () => { throw new Error("Storage blocked"); },
    } });
    assert.equal(await prepareCheckoutAttempt("attempt", body, key), key);
    assert.equal(readCheckoutAttempt("attempt"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "sessionStorage", original);
    else Reflect.deleteProperty(globalThis, "sessionStorage");
  }
});
