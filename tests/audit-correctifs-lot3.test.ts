import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { contentSecurityPolicy } from "../lib/content-security-policy";

/** Correctifs de l'audit du 2026-10-29 (docs/78), lot 3 — durcissements sans décision métier. */
const lire = (f: string) => readFileSync(f, "utf8");
const NONCE = "n".repeat(32);
const directive = (csp: string, nom: string) => csp.split("; ").find((d) => d.startsWith(nom + " ")) ?? "";

// ───────────── L8 — la CSP ne connaît que LE projet Supabase de Zabelie ─────────────

test("L8 — CSP : images, médias et API vers le seul projet configuré, jamais *.supabase.co", () => {
  const csp = contentSecurityPolicy(NONCE, false, "https://ddditxykopuxxqzgkqwy.supabase.co");
  for (const d of ["img-src", "media-src", "connect-src"]) {
    assert.ok(directive(csp, d).includes("https://ddditxykopuxxqzgkqwy.supabase.co"), d);
    assert.doesNotMatch(directive(csp, d), /\*\.supabase\.co/, d);
  }
  assert.ok(directive(csp, "connect-src").includes("wss://ddditxykopuxxqzgkqwy.supabase.co"));
  // Connu-négatif : sans projet configuré, aucun hôte Supabase n'est autorisé.
  const nue = contentSecurityPolicy(NONCE);
  assert.doesNotMatch(nue, /supabase/);
  assert.equal(directive(nue, "img-src"), "img-src 'self' data: blob:");
});

function matcher(): RegExp {
  const src = lire("proxy.ts");
  const motif = /matcher: \[[\s\S]*?"(\/\(\(\?![^"]+)"/.exec(src)?.[1];
  assert.ok(motif, "matcher introuvable");
  // Chaîne JS → motif : `\\.` dans le source vaut `\.` dans l'expression.
  return new RegExp("^" + motif.replace(/\\\\/g, "\\") + "$");
}

test("L8 — matcher : une page dont l'adresse finit par .png passe par le proxy ; les vrais fichiers statiques, non", () => {
  const m = matcher();
  for (const p of ["/boutik/x.png", "/produit/photo.jpg", "/createur/a.svg", "/ht/produit/x.webp", "/", "/produit/a", "/api/v1/search"]) {
    assert.ok(m.test(p), `${p} doit passer par le proxy (CSP à nonce)`);
  }
  for (const p of ["/favicon.png", "/apple-touch-icon.png", "/icons/icon-192.png", "/brand/eliezer-portrait.jpg", "/_next/static/chunks/a.js", "/_next/image", "/favicon.ico", "/icon.svg"]) {
    assert.ok(!m.test(p), `${p} est un fichier statique`);
  }
});

// ───────────── L9 — la déconnexion vide l'appareil ─────────────

test("L9 — déconnexion : le navigateur efface stockage local et cache, pas les cookies de langue et de zone", () => {
  const src = lire("app/api/auth/signout/route.ts");
  const pose = src.indexOf(`reponse.headers.set("Clear-Site-Data", '"cache", "storage"');`);
  assert.ok(pose > 0, "Clear-Site-Data absent");
  assert.ok(pose < src.lastIndexOf("return reponse;"), "l'en-tête est posé avant la réponse");
  assert.ok(pose > src.indexOf("const reponse = NextResponse.redirect("), "sur LA réponse rendue");
  assert.doesNotMatch(src, /Clear-Site-Data", '[^']*"cookies"/);
});

// ───────────── L5 — un client ne vide plus le quota de tous ─────────────

test("L5 — API v1 anonyme : borne par visiteur (empreinte de l'adresse) PUIS borne globale de l'endpoint", () => {
  const src = lire("app/api/v1/[endpoint]/route.ts");
  assert.match(src, /const autorise = user\s*\? await rateLimit\(admin, `apiv1:\$\{user\.id\}`, 120\)\s*: \(await rateLimit\(admin, `apiv1:anon:\$\{nom\}:\$\{createHash\("sha256"\)\.update\(clientIp\(req\)\)\.digest\("hex"\)\}`, 60\)\)\s*&& \(await rateLimit\(admin, `apiv1:anon:\$\{nom\}`, 600\)\);\s*if \(!autorise\) \{\s*return erreur\(lang, "rate_limited", "rate_limited"\);/);
  assert.doesNotMatch(src, /clientIp\(req\)\)(?!\.digest)/, "l'adresse ne part jamais en clair dans la clé");
});

test("L5 — la documentation publique ne dit plus « partagé »", () => {
  for (const f of ["lib/api/v1/docs-copy.ts", "lib/api/v1/openapi.ts"]) {
    assert.doesNotMatch(lire(f), /partagé entre|shared by|pataje ant|compartid[ao]s? entre|Quota partagé|Shared quota|Limit pataje|Cuota compartida/, f);
  }
});
