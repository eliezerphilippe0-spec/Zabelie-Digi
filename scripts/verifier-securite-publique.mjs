import { pathToFileURL } from "node:url";
export async function verifyPublicSecurity(baseUrl, fetcher = fetch) {
  const origin = new URL(baseUrl).origin;
  const get = (path) => fetcher(new URL(path, origin), { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15000) });
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
  for (const path of ["/api/admin/moncash-verify", "/api/download?orderId=00000000-0000-4000-8000-000000000001"]) {
    const response = await get(path);
    if (![401, 403].includes(response.status)) throw new Error("Protected endpoint did not deny anonymous access");
  }
  return { ok: true, checks: ["strict_csp", "fresh_nonce", "rendered_nonce", "security_headers", "anonymous_admin_denied", "anonymous_download_denied"] };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.ZABELIE_URL) { console.error("ZABELIE_URL required"); process.exitCode = 1; }
  else verifyPublicSecurity(process.env.ZABELIE_URL).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error instanceof Error ? error.message : "Security verification failed"); process.exitCode = 1;
  });
}
