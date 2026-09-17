import { createClient } from "@supabase/supabase-js";
import { configPublique } from "@/lib/supabase/config";
import { V1_ENDPOINTS } from "./schemas";
import { V1_AUTHENTIFIES } from "./handlers";

export const MAX_API_BODY_BYTES = 16 * 1024;
export function isPublicEndpoint(name: string) {
  return Object.prototype.hasOwnProperty.call(V1_ENDPOINTS, name) && !V1_AUTHENTIFIES.has(name);
}
/** Public responses never depend on the caller's cookies or Authorization header. */
export function createPublicApiClient() {
  const { url, key } = configPublique();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
export function apiHeaders(publicEndpoint: boolean): Record<string, string> {
  return {
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
    ...(publicEndpoint ? {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Expose-Headers": "Retry-After",
    } : {}),
  };
}
/** Bound the bytes actually read, including bodies without Content-Length. */
export async function readApiBody(req: Request): Promise<unknown> {
  const length = req.headers.get("content-length");
  if (length && Number(length) > MAX_API_BODY_BYTES) throw new Error("body_too_large");
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_API_BODY_BYTES) { await reader.cancel(); throw new Error("body_too_large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
  return text ? JSON.parse(text) : {};
}
