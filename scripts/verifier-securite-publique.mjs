import { pathToFileURL } from "node:url";

/** API qui doivent refuser un visiteur sans session (ou sans secret de cron). */
export const PROTECTED_PATHS = [
  "/api/admin/moncash-verify",
  "/api/download?orderId=00000000-0000-4000-8000-000000000001",
  "/api/account/export",
  "/api/reconcile",
  "/api/webhooks/dispatch",
  "/api/admin/pickup-points",
  "/api/admin/coherence",
  "/api/stock/expire",
];
/** Adresses qui tentent de renvoyer le visiteur hors du site après une redirection. */
export const OPEN_REDIRECT_PROBES = [
  "/auth/callback?next=https://evil.example/x",
  "/auth/callback?next=//evil.example/x",
  "//evil.example/",
];
/** Fichiers qui ne doivent jamais être servis. */
export const HIDDEN_PATHS = ["/.env", "/.git/config"];
const SAFE_REFERRER = ["strict-origin-when-cross-origin", "strict-origin", "same-origin", "no-referrer"];
const ONE_YEAR = 31536000;

export async function verifyPublicSecurity(baseUrl, fetcher = fetch) {
  const origin = new URL(baseUrl).origin;
  // Concaténation et non new URL(path, origin) : "//evil.example/" deviendrait une AUTRE origine.
  const get = (path) => fetcher(new URL(origin + path), { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) });
  const first = await get("/"); const second = await get("/");
  if (!first.ok || !second.ok) throw new Error("Homepage unavailable");
  const nonce = (response) => {
    const policy = response.headers.get("content-security-policy") ?? "";
    const scripts = policy.split(";").map(s => s.trim()).find(s => s.startsWith("script-src ")) ?? "";
    const value = scripts.match(/'nonce-([A-Za-z0-9+/=_-]+)'/)?.[1];
    if (!value || value.length < 20 || !scripts.includes("'strict-dynamic'") || /unsafe-inline|unsafe-eval/.test(scripts)) throw new Error("Script policy is not strict");
    if (!/frame-ancestors 'none'/.test(policy) || response.headers.get("x-content-type-options") !== "nosniff") throw new Error("Missing security headers");
    return value;
  };
  const firstNonce = nonce(first);
  if (firstNonce === nonce(second)) throw new Error("CSP nonce reused between responses");
  const html = await first.text();
  if (!html.includes('nonce="' + firstNonce + '"')) throw new Error("Nonce missing from HTML scripts");

  const hsts = first.headers.get("strict-transport-security") ?? "";
  const maxAge = Number(hsts.match(/max-age=(\d+)/i)?.[1] ?? 0);
  if (maxAge < ONE_YEAR || !/includesubdomains/i.test(hsts)) throw new Error("HSTS missing or shorter than one year");
  if (!SAFE_REFERRER.includes((first.headers.get("referrer-policy") ?? "").trim().toLowerCase())) throw new Error("Referrer-Policy leaks full URLs");
  if (!/(^|,\s*)geolocation=\(\)/.test(first.headers.get("permissions-policy") ?? "")) throw new Error("Permissions-Policy does not deny geolocation");
  if ((first.headers.get("x-frame-options") ?? "").toUpperCase() !== "DENY") throw new Error("X-Frame-Options is not DENY");

  const chunk = html.match(/src="(\/_next\/static\/[^"?]+\.js)"/)?.[1];
  if (!chunk) throw new Error("No Next.js script found to test source maps");
  if ((await get(chunk + ".map")).status === 200) throw new Error("Source map served publicly: " + chunk + ".map");
  for (const path of HIDDEN_PATHS) {
    if ((await get(path)).status === 200) throw new Error("Hidden file served publicly: " + path);
  }
  for (const path of OPEN_REDIRECT_PROBES) {
    const response = await get(path);
    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location && new URL(location, origin).origin !== origin) {
      throw new Error("Open redirect: " + path + " → " + location);
    }
  }
  for (const path of PROTECTED_PATHS) {
    const response = await get(path);
    if (![401, 403].includes(response.status)) throw new Error("Protected endpoint did not deny anonymous access: " + path.split("?")[0] + " (" + response.status + ")");
  }
  return { ok: true, checks: ["strict_csp", "fresh_nonce", "rendered_nonce", "security_headers", "hsts_one_year", "referrer_policy", "permissions_policy", "frame_options", "source_maps_hidden", "hidden_files", "open_redirect_refused", "anonymous_protected_denied"] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.ZABELIE_URL) { console.error("ZABELIE_URL required"); process.exitCode = 1; }
  else verifyPublicSecurity(process.env.ZABELIE_URL).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error instanceof Error ? error.message : "Security verification failed"); process.exitCode = 1;
  });
}
