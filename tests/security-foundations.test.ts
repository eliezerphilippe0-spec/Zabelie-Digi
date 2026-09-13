import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentSecurityPolicy } from "../lib/content-security-policy";
import { rateLimit } from "../lib/zabelie-rate-limit";
import { receiptAllowsFile, scanDigitalObject, digitalFileIsClean, scanReceiptPath, type ScanReceipt } from "../lib/digital-file-security";
import { freshEngine } from "../scripts/scanner-fichiers";

const now = Date.now();
const receipt: ScanReceipt = { schema: 1, objectId: "object-1", objectVersion: "version-1", sha256: "a".repeat(64), verdict: "clean", scannedAt: new Date(now - 1000).toISOString(), engine: "ClamAV 1.4" };
test("CSP: strict production scripts, injected handlers and foreign base URLs blocked", () => {
  const csp = contentSecurityPolicy("n".repeat(32));
  const script = csp.split(";").find(s => s.trim().startsWith("script-src "))!;
  assert.match(script, /nonce-n+/); assert.match(script, /strict-dynamic/);
  assert.doesNotMatch(script, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /script-src-attr 'none'/); assert.match(csp, /base-uri 'none'/);
  assert.throws(() => contentSecurityPolicy("'; script-src *"));
  assert.match(contentSecurityPolicy("n".repeat(32), true), /unsafe-eval/);
});
for (const [name, data, error] of [["allowed", true, null], ["exhausted", false, null], ["missing", null, null], ["malformed", 1, null], ["unavailable", true, { message: "private" }]] as const) {
  test("Rate limit: " + name, async () => {
    const admin = { rpc: () => ({ abortSignal: (signal: AbortSignal) => { assert.ok(signal); return Promise.resolve({ data, error }); } }) } as unknown as SupabaseClient;
    assert.equal(await rateLimit(admin, "test", 10), name === "allowed");
  });
}
test("Rate limit: exceptions and invalid limits deny access", async () => {
  const admin = { rpc: () => { throw new Error("private"); } } as unknown as SupabaseClient;
  assert.equal(await rateLimit(admin, "test", 10), false);
  assert.equal(await rateLimit(admin, "test", 0), false);
});
test("Receipt: only clean, current, identified bytes are accepted", () => {
  const object = { id: "object-1", version: "version-1" };
  assert.equal(receiptAllowsFile(receipt, object, now), true);
  for (const r of [null, {}, { ...receipt, verdict: "infected" }, { ...receipt, verdict: "error" }, { ...receipt, objectVersion: "old" }, { ...receipt, objectId: "other" }, { ...receipt, sha256: "" }, { ...receipt, scannedAt: new Date(now + 1000).toISOString() }, { ...receipt, scannedAt: new Date(now - 8 * 86400_000).toISOString() }]) assert.equal(receiptAllowsFile(r, object, now), false);
});
function storageFixture(changeVersion = false, scanProof: unknown = receipt) {
  let reads = 0; const writes: { path: string; body: ScanReceipt }[] = [];
  const bucket = {
    info: async () => ({ data: { id: "object-1", version: ++reads > 1 && changeVersion ? "version-2" : "version-1", size: 3 }, error: null }),
    download: async (path: string) => ({ data: path.startsWith("_security/") ? new Blob([JSON.stringify(scanProof)]) : new Blob(["abc"]), error: null }),
    upload: async (path: string, body: string) => { writes.push({ path, body: JSON.parse(body) }); return { error: null }; },
  };
  return { admin: { storage: { from: () => bucket } } as unknown as SupabaseClient, writes };
}
test("Scanner: records the scanned bytes and rejects a concurrent replacement", async () => {
  const good = storageFixture();
  assert.equal(await scanDigitalObject(good.admin, "seller/book.pdf", async bytes => { assert.equal(Buffer.from(bytes).toString(), "abc"); return { verdict: "clean", engine: "ClamAV 1.4" }; }), "clean");
  assert.equal(good.writes[0].body.sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(good.writes[0].path, scanReceiptPath("seller/book.pdf"));
  const changed = storageFixture(true);
  await assert.rejects(scanDigitalObject(changed.admin, "seller/book.pdf", async () => ({ verdict: "clean", engine: "ClamAV 1.4" })), /changed/);
  assert.equal(changed.writes.length, 0);
});
test("Download gate rejects infected and missing receipts", async () => {
  assert.equal(await digitalFileIsClean(storageFixture().admin, "seller/book.pdf"), true);
  assert.equal(await digitalFileIsClean(storageFixture(false, { ...receipt, verdict: "infected" }).admin, "seller/book.pdf"), false);
  assert.equal(await digitalFileIsClean(storageFixture(false, null).admin, "seller/book.pdf"), false);
});
test("ClamAV: stale or unreadable signature dates cannot certify a file", () => {
  assert.equal(freshEngine("ClamAV 1.4/28000/" + new Date(now - 1000).toUTCString(), now), true);
  assert.equal(freshEngine("ClamAV 1.4/28000/" + new Date(now - 4 * 86400_000).toUTCString(), now), false);
  assert.equal(freshEngine("unknown", now), false);
});
