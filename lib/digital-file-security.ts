import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { DIGITAL_BUCKET } from "@/lib/storage-buckets";
export { DIGITAL_BUCKET };
export const MAX_SCAN_BYTES = 50 * 1024 * 1024;
export const MAX_SCAN_AGE_MS = 7 * 86400_000;
export type ScanVerdict = "clean" | "infected" | "error";
export type ScanReceipt = { schema: 1; objectId: string; objectVersion: string; sha256: string; verdict: ScanVerdict; scannedAt: string; engine: string };
export function scanReceiptPath(path: string): string {
  return `_security/scans/${createHash("sha256").update(path).digest("hex")}.json`;
}
export function receiptAllowsFile(receipt: unknown, object: { id: string; version: string }, now = Date.now()): boolean {
  if (!receipt || typeof receipt !== "object") return false;
  const r = receipt as Partial<ScanReceipt>;
  const age = now - Date.parse(r.scannedAt ?? "");
  return r.schema === 1 && r.verdict === "clean" && !!object.id && !!object.version &&
    r.objectId === object.id && r.objectVersion === object.version &&
    typeof r.sha256 === "string" && /^[a-f0-9]{64}$/.test(r.sha256) &&
    typeof r.engine === "string" && r.engine.startsWith("ClamAV ") &&
    Number.isFinite(age) && age >= 0 && age < MAX_SCAN_AGE_MS;
}
/** Receipts share the private bucket: only service-role can read/write them.
 * Seller upload tokens authorize one server-generated liv-UUID path, never _security.
 * A missing receipt, changed Storage version, expired scan or outage denies access. */
export async function digitalFileIsClean(admin: SupabaseClient, path: string): Promise<boolean> {
  try {
    const bucket = admin.storage.from(DIGITAL_BUCKET);
    const [object, proof] = await Promise.all([bucket.info(path), bucket.download(scanReceiptPath(path), {}, { cache: "no-store" })]);
    if (object.error || !object.data || proof.error || !proof.data || proof.data.size > 8192) return false;
    return receiptAllowsFile(JSON.parse(await proof.data.text()), object.data);
  } catch { return false; }
}
export async function digitalProductIsClean(admin: SupabaseClient, productId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from("product_assets").select("storage_path").eq("product_id", productId);
    if (error || !data?.length) return false;
    for (const file of data) if (!(await digitalFileIsClean(admin, file.storage_path))) return false;
    return true;
  } catch { return false; }
}
/** Runs only in the private worker. The scanner receives bytes, never a signed URL. */
export async function scanDigitalObject(admin: SupabaseClient, path: string, scan: (bytes: Uint8Array) => Promise<{ verdict: ScanVerdict; engine: string }>): Promise<ScanVerdict> {
  const bucket = admin.storage.from(DIGITAL_BUCKET);
  const before = await bucket.info(path);
  if (before.error || !before.data?.id || !before.data.version || !before.data.size || before.data.size > MAX_SCAN_BYTES) throw new Error("Object unavailable for scan");
  const file = await bucket.download(path, {}, { cache: "no-store" });
  if (file.error || !file.data || file.data.size !== before.data.size || file.data.size > MAX_SCAN_BYTES) throw new Error("Object download failed");
  const bytes = new Uint8Array(await file.data.arrayBuffer());
  const result = await scan(bytes);
  const after = await bucket.info(path);
  if (after.error || after.data?.id !== before.data.id || after.data.version !== before.data.version) throw new Error("Object changed during scan");
  const receipt: ScanReceipt = { schema: 1, objectId: before.data.id, objectVersion: before.data.version, sha256: createHash("sha256").update(bytes).digest("hex"), verdict: result.verdict, engine: result.engine, scannedAt: new Date().toISOString() };
  const saved = await bucket.upload(scanReceiptPath(path), JSON.stringify(receipt), { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (saved.error) throw new Error("Scan receipt not saved");
  return result.verdict;
}
