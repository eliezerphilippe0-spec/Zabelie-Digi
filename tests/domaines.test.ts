import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMAT_DOMAINE, cheminSurDomaine, enregistrementsDns, estHoteZabelie, hoteDe, normaliserDomaine, resoudreDomaine } from "../lib/domaines";
import { domainePointeVersZabelie } from "../lib/domaine-sonde";

/**
 * DOMAINE PERSONNALISÉ (0125) — ce qui doit rester vrai. L'éligibilité est
 * éprouvée en SQL (`supabase/tests/seller_domains.test.sql`), le routage de
 * bout en bout en e2e (`e2e/parcours-physique-domaine.spec.ts`).
 */

const SITE = "https://zabelie.com";

test("DM1 — zabelie.com n'est JAMAIS pris pour un domaine vendeur, quelle que soit la configuration", () => {
  for (const h of ["zabelie.com", "www.zabelie.com", "x.zabelie.com", "zabelie-git-main.vercel.app", "localhost", "127.0.0.1", ""]) {
    assert.equal(estHoteZabelie(h, "http://localhost:3000"), true, `${h} traité comme domaine vendeur`);
  }
  assert.equal(estHoteZabelie("preprod.exemple.org", "https://preprod.exemple.org"), true, "l'hôte configuré compte aussi");
  assert.equal(estHoteZabelie("www.preprod.exemple.org", "https://preprod.exemple.org"), true);
  for (const h of ["boutik-mari.ht", "zabelie.com.evil.ht", "evilzabelie.com"]) {
    assert.equal(estHoteZabelie(h, SITE), false, `${h} pris pour Zabelie`);
  }
  assert.equal(hoteDe("Boutik-Mari.HT:443"), "boutik-mari.ht");
  assert.equal(hoteDe("boutik-mari.ht."), "boutik-mari.ht");
  assert.equal(cheminSurDomaine("/"), "boutique");
  for (const c of ["/produit/x", "/connexion", "/api/checkout", "/boutik/x"]) assert.equal(cheminSurDomaine(c), "zabelie");
});

test("DM2 — la saisie du vendeur est normalisée comme en base ; le format est celui de la contrainte SQL", () => {
  assert.equal(normaliserDomaine("  HTTPS://WWW.Boutik-Mari.HT/accueil "), "boutik-mari.ht");
  assert.equal(normaliserDomaine("boutik-mari.ht."), "boutik-mari.ht");
  for (const v of ["localhost", "a..b.com", "-x.com", "x.c", "zabelie.com", "shop.zabelie.com", "x.vercel.app", "é.com", "a b.com"]) {
    assert.equal(normaliserDomaine(v), null, `${v} accepté`);
  }
  const sql = readFileSync("supabase/migrations/0125_zabelie_seller_domains.sql", "utf8");
  const contrainte = sql.match(/domaine ~ '([^']+)'/)![1];
  assert.equal(contrainte, FORMAT_DOMAINE.source, "le code et la base divergent sur le format");
  assert.deepEqual(enregistrementsDns("boutik-mari.ht").map((r) => `${r.type} ${r.nom}`), ["A @", "CNAME www"]);
});

type Appel = { url: string; init: RequestInit | undefined };
function fauxFetch(reponse: () => Response | Promise<Response>) {
  const appels: Appel[] = [];
  const f = (async (url: string, init?: RequestInit) => { appels.push({ url, init }); return reponse(); }) as unknown as typeof fetch;
  return { f, appels };
}
const CONFIG = { url: "https://projet.supabase.co", key: "cle-publique" };

test("DM3 — le proxy résout l'hôte par la RPC publique, et ne sert rien dans le doute", async () => {
  const ok = fauxFetch(() => Response.json("atelye-lakay"));
  assert.equal(await resoudreDomaine("www.boutik-mari.ht", CONFIG, ok.f), "atelye-lakay");
  assert.equal(ok.appels[0].url, "https://projet.supabase.co/rest/v1/rpc/zabelie_domaine_boutik");
  assert.deepEqual(JSON.parse(String(ok.appels[0].init?.body)), { p_hote: "boutik-mari.ht" }, "www retiré avant la requête");

  for (const [nom, rep] of [
    ["inconnu", () => Response.json(null)],
    // Une erreur PostgREST dont le corps ressemble à un slug : seul le statut l'écarte.
    ["panne", () => Response.json("atelye-lakay", { status: 500 })],
    ["slug forgé", () => Response.json("../admin")],
    ["réseau", () => { throw new Error("coupure"); }],
  ] as const) {
    assert.equal(await resoudreDomaine("boutik-mari.ht", CONFIG, fauxFetch(rep).f), null, nom);
  }
  const jamais = fauxFetch(() => Response.json("x"));
  assert.equal(await resoudreDomaine("pas un hôte", CONFIG, jamais.f), null);
  assert.equal(await resoudreDomaine("boutik-mari.ht", null, jamais.f), null);
  assert.equal(jamais.appels.length, 0, "aucune requête pour une forme invalide ou sans configuration");
});

test("DM4 — l'activation exige que le domaine atteigne CE proxy, pas une simple redirection", async () => {
  const vers = (status: number, headers: Record<string, string>) => fauxFetch(() => new Response(null, { status, headers })).f;
  const signe = { "x-zabelie-domaine": "boutik-mari.ht", location: "http://localhost:3000/zabelie-sonde-domaine" };
  process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
  try {
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", vers(308, signe))).ok, true);
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", vers(308, { location: signe.location }))).ok, false, "redirection de registraire sans signature");
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", vers(308, { ...signe, "x-zabelie-domaine": "autre.ht" }))).ok, false, "signature d'un autre domaine");
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", vers(308, { ...signe, location: "https://ailleurs.ht/" }))).ok, false, "redirige ailleurs");
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", vers(200, signe))).ok, false);
    assert.equal((await domainePointeVersZabelie("boutik-mari.ht", fauxFetch(() => { throw new Error("dns"); }).f)).ok, false);
  } finally {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  }
});

test("DM5 — branchements : proxy avant la session, admin sonde avant de décider, vendeur par sa session", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  const branche = proxy.indexOf("if (!estHoteZabelie(hote)) {");
  assert.ok(branche > 0 && branche < proxy.indexOf("await updateSession(request)"), "le domaine vendeur est traité avant toute session");
  assert.match(proxy, /if \(cheminSurDomaine\(request\.nextUrl\.pathname\) === "zabelie"\) \{\s*const renvoi = NextResponse\.redirect\([^;]*siteUrl\(\)\), 308\);\s*[\s\S]{0,200}renvoi\.headers\.set\("x-zabelie-domaine", hote\);\s*return renvoi;/);
  assert.match(proxy, /const slug = await resoudreDomaine\(hote, config\);[\s\S]{0,600}const boutique = slug\s*\? NextResponse\.rewrite\(new URL\(`\/boutik\/\$\{slug\}`[\s\S]{0,200}: NextResponse\.rewrite\(new URL\("\/404", request\.url\), \{ status: 404/);

  const admin = readFileSync("app/api/admin/domaines/route.ts", "utf8");
  const sonde = admin.search(/if \(activer\) \{\s*const sonde = await domainePointeVersZabelie\(ligne\.domaine\);\s*if \(!sonde\.ok\) \{\s*return /);
  assert.ok(sonde > 0 && sonde < admin.indexOf('rpc("zabelie_domaine_decider"'), "la sonde passe AVANT la décision");
  assert.match(admin, /if \(!me \|\| me\.role !== "admin"\) return/);

  const vendeur = readFileSync("app/api/account/domain/route.ts", "utf8");
  assert.match(vendeur, /rpc\("zabelie_domaine_demander", \{ p_user: user\.id,/, "l'identité vient de la session, jamais du corps");
  assert.match(vendeur, /rpc\("zabelie_domaine_retirer", \{ p_user: user\.id \}/);
});
