import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyPublicSecurity, PROTECTED_PATHS, OPEN_REDIRECT_PROBES, HIDDEN_PATHS } from "../scripts/verifier-securite-publique.mjs";

const ORIGIN = "https://zabelie.example";
// Un site sain, calqué sur les réponses relevées sur zabelie.com le 2026-10-29 ; chaque mode en casse UNE propriété.
function fixture(mode = "good", leak?: string) {
  let count = 0;
  const seen: string[] = [];
  const fetcher = async (input: unknown) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const path = url.pathname + url.search;
    seen.push(url.origin + path);
    if (url.origin !== ORIGIN) return new Response("ailleurs", { status: 200 });
    if (path === "/") {
      const nonce = "n".repeat(30) + (mode === "reused" ? "0" : ++count);
      return new Response('<script nonce="' + nonce + '" src="/_next/static/chunks/main-abc123.js"></script>', { headers: {
        "content-security-policy": mode === "weak" ? "frame-ancestors 'none'" : "script-src 'nonce-" + nonce + "' 'strict-dynamic'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
        "strict-transport-security": mode === "no-hsts" ? "" : mode === "short-hsts" ? "max-age=86400; includeSubDomains" : "max-age=31536000; includeSubDomains",
        "referrer-policy": mode === "leaky-referrer" ? "unsafe-url" : "strict-origin-when-cross-origin",
        "permissions-policy": mode === "geolocation-allowed" ? "camera=(), microphone=(), geolocation=(self), payment=()" : "camera=(), microphone=(), geolocation=(), payment=()",
        "x-frame-options": mode === "no-xfo" ? "SAMEORIGIN" : "DENY",
      } });
    }
    if (path === "/_next/static/chunks/main-abc123.js.map") return new Response("{}", { status: mode === "source-map" ? 200 : 403 });
    if (HIDDEN_PATHS.includes(path)) return new Response("SECRET=1", { status: leak === path ? 200 : 404 });
    if (path.startsWith("/auth/callback")) {
      return new Response(null, { status: 307, headers: { location: mode === "open-redirect" ? url.searchParams.get("next")! : ORIGIN + "/" } });
    }
    if (path === "//evil.example/") return new Response(null, { status: 308, headers: { location: mode === "protocol-relative" ? "//evil.example/" : "/evil.example/" } });
    const exposed = mode === "public-admin" ? PROTECTED_PATHS[0] : leak;
    return new Response("{}", { status: path === exposed ? 200 : 401 });
  };
  return { fetcher, seen };
}

test("la sonde accepte un site sain et rend la liste complète de ses contrôles", async () => {
  const { fetcher, seen } = fixture();
  const result = await verifyPublicSecurity(ORIGIN, fetcher);
  assert.equal(result.ok, true);
  assert.equal(result.checks.length, 12);
  for (const path of [...PROTECTED_PATHS, ...HIDDEN_PATHS, ...OPEN_REDIRECT_PROBES]) assert.ok(seen.includes(ORIGIN + path), "non interrogé : " + path);
  assert.ok(seen.every((u) => u.startsWith(ORIGIN + "/")), "la sonde n'interroge que le site vérifié, jamais evil.example");
});

for (const [mode, motif] of [
  ["weak", /Script policy/], ["reused", /nonce reused/], ["public-admin", /moncash-verify/],
  ["no-hsts", /HSTS/], ["short-hsts", /HSTS/], ["leaky-referrer", /Referrer-Policy/], ["geolocation-allowed", /geolocation/],
  ["no-xfo", /X-Frame-Options/], ["source-map", /Source map/], ["open-redirect", /Open redirect/], ["protocol-relative", /Open redirect/],
] as const) test("la sonde détecte : " + mode, async () => {
  await assert.rejects(verifyPublicSecurity(ORIGIN, fixture(mode).fetcher), motif);
});

test("chaque API protégée et chaque fichier caché, exposé SEUL, fait échouer la sonde", async () => {
  for (const path of PROTECTED_PATHS) await assert.rejects(verifyPublicSecurity(ORIGIN, fixture("good", path).fetcher), /Protected endpoint/, path);
  for (const path of HIDDEN_PATHS) await assert.rejects(verifyPublicSecurity(ORIGIN, fixture("good", path).fetcher), /Hidden file/, path);
});

test("les listes couvrent les routes relevées pendant l'audit du 2026-10-29", () => {
  for (const p of ["/api/admin/moncash-verify", "/api/account/export", "/api/reconcile", "/api/webhooks/dispatch", "/api/admin/pickup-points", "/api/admin/coherence", "/api/stock/expire"]) {
    assert.ok(PROTECTED_PATHS.includes(p), p);
  }
  assert.ok(PROTECTED_PATHS.some((p) => p.startsWith("/api/download?")));
  assert.deepEqual(HIDDEN_PATHS, ["/.env", "/.git/config"]);
  assert.ok(OPEN_REDIRECT_PROBES.includes("//evil.example/"), "la forme protocole-relative est celle qui trompe new URL(path, origin)");
});

test("le workflow rejoue la sonde CHAQUE JOUR, pas seulement après un déploiement", () => {
  const workflow = readFileSync(".github/workflows/post-deploy.yml", "utf8");
  const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\npermissions:"));
  assert.match(on, /\n\s*schedule:\s*\n\s*- cron: "\d{1,2} \d{1,2} \* \* \*"/);
  assert.match(workflow, /run: node scripts\/verifier-securite-publique\.mjs/);
  assert.doesNotMatch(workflow, /if:\s*github\.event_name/, "aucune étape n'est réservée au push");
  assert.match(workflow, /group: post-deploy-\$\{\{ github\.event_name \}\}/, "une vérification planifiée n'annule pas celle d'un déploiement");
});
