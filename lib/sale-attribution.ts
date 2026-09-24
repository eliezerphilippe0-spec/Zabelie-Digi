import { createHmac, timingSafeEqual } from "node:crypto";
export const SALE_SOURCE_COOKIE = "zabelie_sale_sources";
type Visit = { product: string; expires: number };

function signature(payload: string, key: string) {
  return createHmac("sha256", key).update("zabelie-sale-source-v1:" + payload).digest("base64url");
}
function readVisits(token: string | undefined, key: string, now: number): Visit[] {
  if (!token || !key || token.length > 3800) return [];
  try {
    const [payload, received, extra] = token.split(".");
    if (extra || !payload || !received) return [];
    const expected = Buffer.from(signature(payload, key));
    const actual = Buffer.from(received);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return [];
    const visits: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!Array.isArray(visits) || visits.length > 20) return [];
    return visits.filter((v): v is Visit => v && typeof v.product === "string" &&
      /^[a-zA-Z0-9-]{1,64}$/.test(v.product) && Number.isSafeInteger(v.expires) && v.expires > now);
  } catch { return []; }
}
/** Only the server discovery redirect creates this proof. No checkout JSON
 * field or arbitrary Referer may select a higher marketplace commission.
 * First discovery expiry is not extended by refreshing or reopening a link. */
export function recordDiscovery(token: string | undefined, product: string, days: number, key: string, now = Date.now()): string {
  if (!key || !/^[a-zA-Z0-9-]{1,64}$/.test(product) || !Number.isInteger(days) || days < 1 || days > 30) throw new Error("invalid_sale_attribution");
  const visits = readVisits(token, key, now);
  if (!visits.some(v => v.product === product)) visits.push({ product, expires: now + days * 86_400_000 });
  const payload = Buffer.from(JSON.stringify(visits.slice(-20))).toString("base64url");
  return payload + "." + signature(payload, key);
}
export function attributedSource(token: string | undefined, product: string, key: string, now = Date.now()): "direct" | "discovery" {
  return readVisits(token, key, now).some(v => v.product === product) ? "discovery" : "direct";
}

