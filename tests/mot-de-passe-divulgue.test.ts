import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { empreinteSha1, motDePasseDivulgue, suffixeDivulgue, PREFIXE_RE } from "../lib/mot-de-passe-divulgue";
import { loadRoute } from "./helpers/route-harness";
import { DICT, LANGS } from "../lib/i18n";

/**
 * Mots de passe divulgués (instruction du porteur, 2026-10-29) — k-anonymat de
 * bout en bout : seuls 5 caractères de l'empreinte quittent l'appareil, la
 * comparaison se fait dans le navigateur.
 */

// SHA-1("password") — valeur publique de référence de Pwned Passwords.
const SHA1_REFERENCE = "5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8";

test("empreinte : SHA-1 hexadécimal majuscule, accents compris (UTF-8)", async () => {
  assert.equal(await empreinteSha1("password"), SHA1_REFERENCE);
  assert.match(await empreinteSha1("Modpas-kreyòl-è"), /^[0-9A-F]{40}$/);
  assert.notEqual(await empreinteSha1("kreyòl"), await empreinteSha1("kreyol"));
});

test("suffixe : trouvé seulement avec un compte > 0 — le remplissage (compte 0) ne compte jamais", () => {
  const suffixe = SHA1_REFERENCE.slice(5);
  const reponse = `0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${suffixe}:10437277\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`;
  assert.equal(suffixeDivulgue(reponse, suffixe), true);
  assert.equal(suffixeDivulgue(reponse, suffixe.toLowerCase()), true, "insensible à la casse");
  assert.equal(suffixeDivulgue(reponse, "FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF"), false, "ligne de remplissage");
  assert.equal(suffixeDivulgue(reponse, "1111111111111111111111111111111111A"), false);
  assert.equal(suffixeDivulgue("", suffixe), false);
});

test("client : n'envoie QUE le préfixe de 5 caractères, à notre route, sans cookie ni corps", async () => {
  const appels: { url: string; init?: RequestInit }[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    appels.push({ url, init });
    return new Response(`${SHA1_REFERENCE.slice(5)}:12\nABCDEF0000000000000000000000000000:0`, { status: 200 });
  }) as unknown as typeof fetch;
  assert.equal(await motDePasseDivulgue("password", fetcher), true);
  assert.equal(appels.length, 1);
  assert.equal(appels[0].url, "/api/auth/fuites/5BAA6");
  assert.equal(appels[0].init?.method, "GET");
  assert.equal(appels[0].init?.credentials, "omit");
  assert.equal(appels[0].init?.body, undefined);
  assert.ok(!JSON.stringify(appels).includes(SHA1_REFERENCE.slice(5)), "le suffixe ne part jamais");
});

test("client : absent des fuites → false ; panne, refus ou délai dépassé → null (on laisse passer)", async () => {
  const absent = (async () => new Response("0018A45C4D1DEF81644B54AB7F969B88D65:3", { status: 200 })) as unknown as typeof fetch;
  assert.equal(await motDePasseDivulgue("password", absent), false);
  const panne = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
  assert.equal(await motDePasseDivulgue("password", panne), null);
  const reseau = (async () => { throw new TypeError("network"); }) as unknown as typeof fetch;
  assert.equal(await motDePasseDivulgue("password", reseau), null);
  const lent = ((_u: string, init?: RequestInit) => new Promise<Response>((_, rejeter) => {
    init?.signal?.addEventListener("abort", () => rejeter(new Error("aborted")));
  })) as unknown as typeof fetch;
  assert.equal(await motDePasseDivulgue("password", lent, 20), null);
});

// ───────────── la route passerelle ─────────────

function route(o: { limite?: boolean; hibp?: () => Promise<Response> } = {}) {
  const sortants: { url: string; init?: RequestInit }[] = [];
  const limites: string[] = [];
  const mod = loadRoute("app/api/auth/fuites/[prefixe]/route.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/zabelie-rate-limit": {
      clientIp: () => "203.0.113.7",
      rateLimit: async (_a: unknown, cle: string) => { limites.push(cle); return o.limite !== false; },
    },
    "@/lib/mot-de-passe-divulgue": { PREFIXE_RE },
    "node:crypto": { createHash: () => ({ update: () => ({ digest: () => "hash-ip" }) }) },
  }, {}, {
    fetch: async (url: string, init?: RequestInit) => { sortants.push({ url, init }); return o.hibp ? o.hibp() : new Response("ABC:1", { status: 200 }); },
    console: { log: () => {} },
  });
  const appeler = (prefixe: string, entetes: Record<string, string> = {}) =>
    mod.GET(new Request(`https://zabelie.test/api/auth/fuites/${prefixe}`, { headers: entetes }), { params: Promise.resolve({ prefixe }) });
  return { appeler, sortants, limites };
}

test("route : un préfixe invalide est refusé AVANT tout débit et tout appel sortant", async () => {
  for (const p of ["5baa6", "5BAA", "5BAA61", "ZZZZZ", "5BAA6/../x", ""]) {
    const r = route();
    assert.equal((await r.appeler(p)).status, 400, p);
    assert.deepEqual(r.sortants, [], p);
    assert.deepEqual(r.limites, [], p);
  }
});

test("route : ne transmet à HIBP que le préfixe — ni cookie, ni autorisation, ni adresse du visiteur", async () => {
  const r = route();
  const reponse = await r.appeler("5BAA6", { cookie: "sb-x-auth-token=secret", authorization: "Bearer jeton", "x-forwarded-for": "203.0.113.7" });
  assert.equal(reponse.status, 200);
  assert.equal(await reponse.text(), "ABC:1");
  assert.equal(r.sortants.length, 1);
  assert.equal(r.sortants[0].url, "https://api.pwnedpasswords.com/range/5BAA6");
  const entetes = JSON.stringify(r.sortants[0].init?.headers ?? {});
  assert.match(entetes, /"Add-Padding":"true"/);
  assert.doesNotMatch(entetes, /secret|jeton|203\.0\.113\.7|cookie|authorization|forwarded/i);
  assert.equal(r.limites[0], "fuites:hash-ip");
});

test("route : débit épuisé → 429 sans appel sortant ; HIBP en panne → 503", async () => {
  const lim = route({ limite: false });
  assert.equal((await lim.appeler("5BAA6")).status, 429);
  assert.deepEqual(lim.sortants, []);
  assert.equal((await route({ hibp: async () => new Response("", { status: 500 }) }).appeler("5BAA6")).status, 503);
  assert.equal((await route({ hibp: async () => { throw new Error("down"); } }).appeler("5BAA6")).status, 503);
});

// ───────────── les formulaires : ce qui COMMANDE ─────────────

test("inscription : le contrôle précède la création du compte et l'arrête", () => {
  const src = readFileSync("components/connexion-form.tsx", "utf8");
  assert.match(src, /if \(await motDePasseDivulgue\(password\)\) \{\s*setMsg\(labels\.passwordLeaked\);\s*return;\s*\}[\s\S]{0,700}await supabase\.auth\.signUp\(/);
  assert.equal((src.match(/motDePasseDivulgue\(password\)/g) ?? []).length, 1);
});

test("réinitialisation : le contrôle précède l'écriture du nouveau mot de passe", () => {
  const src = readFileSync("components/reset-password-form.tsx", "utf8");
  const garde = src.indexOf("if (await motDePasseDivulgue(password))");
  assert.ok(garde > 0 && garde < src.indexOf("writer.auth.updateUser({ password })"));
  assert.match(src, /if \(await motDePasseDivulgue\(password\)\) \{\s*if \(mounted\.current\) setMsg\(labels\.passwordLeaked\);\s*return;\s*\}/);
});

test("le message existe dans les quatre langues et part des deux pages", () => {
  for (const lang of LANGS) assert.ok(DICT[lang]["auth.password.leaked"].length > 30, lang);
  assert.match(readFileSync("app/connexion/page.tsx", "utf8"), /passwordLeaked: t\(lang, "auth\.password\.leaked"\)/);
  assert.match(readFileSync("app/reinitialiser-mot-de-passe/page.tsx", "utf8"), /passwordLeaked: t\(lang, "auth\.password\.leaked"\)/);
});
