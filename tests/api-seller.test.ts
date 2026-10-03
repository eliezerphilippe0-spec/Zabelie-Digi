import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SCOPES } from "../lib/api-keys";
import { ErreurApi } from "../lib/api/v1/handlers";
import {
  SELLER_ENDPOINTS, SELLER_HANDLERS, SellerSalesOutput, SellerProductsOutput, createProductLink, sellerProducts, sellerSales,
} from "../lib/api/v1/seller";

const VENDEUR = "11111111-1111-4111-8111-111111111111";
const AUTRE = "22222222-2222-4222-8222-222222222222";
const P1 = "33333333-3333-4333-8333-333333333333";

/** Faux client de service : enregistre chaque appel de la chaîne, rend `lignes`. */
function faux(lignes: unknown[] | ((filtres: string[]) => unknown[]), erreur: unknown = null) {
  const journal: { table: string; select: string; filtres: string[] }[] = [];
  const client = {
    from(table: string) {
      const j = { table, select: "", filtres: [] as string[] };
      journal.push(j);
      const rendre = () => {
        const data = typeof lignes === "function" ? lignes(j.filtres) : lignes;
        return { data: erreur ? null : data, error: erreur };
      };
      const b: Record<string, unknown> = {
        select(s: string) { j.select = s; return b; },
        eq(c: string, v: unknown) { j.filtres.push(`${c}=${v}`); return b; },
        in(c: string, v: unknown[]) { j.filtres.push(`${c} in ${v.join("|")}`); return b; },
        or(s: string) { j.filtres.push(`or ${s}`); return b; },
        order() { return b; },
        limit(n: number) { j.filtres.push(`limit ${n}`); return b; },
        maybeSingle: async () => { const r = rendre(); return { ...r, data: (r.data as unknown[] | null)?.[0] ?? null }; },
        then(ok: (r: unknown) => unknown) { return Promise.resolve(rendre()).then(ok); },
      };
      return b;
    },
  } as unknown as SupabaseClient;
  return { client, journal };
}

const produit = (o: Record<string, unknown> = {}) => ({
  id: P1, slug: "sak-pay", title: "Sak pay", kind: "physical", status: "published", price_htg: 2500,
  in_stock: true, cover_url: null, created_at: "2026-10-01T10:00:00.000Z", ...o,
});
const vente = (i: number, o: Record<string, unknown> = {}) => ({
  id: `44444444-4444-4444-8444-44444444444${i}`, order_ref: `ZB-${i}`, product_id: P1, amount_htg: 2500, discount_htg: 0,
  status: "paid", zabelie_payment_is_live: true, created_at: `2026-10-0${i}T10:00:00.000Z`, ...o,
});

test("B1 — registre : chaque endpoint a un handler et une portée connue, et réciproquement", () => {
  assert.deepEqual(Object.keys(SELLER_HANDLERS).sort(), Object.keys(SELLER_ENDPOINTS).sort());
  for (const [nom, e] of Object.entries(SELLER_ENDPOINTS)) assert.ok((SCOPES as readonly string[]).includes(e.scope), `${nom} : portée ${e.scope}`);
});

test("B2 — CLOISONNEMENT : chaque requête porte le vendeur de la clé", async () => {
  const p = faux([produit()]);
  await sellerProducts({ limit: 20 }, { admin: p.client, sellerId: VENDEUR });
  const s = faux([vente(1)]);
  await sellerSales({ limit: 20 }, { admin: s.client, sellerId: VENDEUR });
  const l = faux([produit()]);
  await createProductLink({ productId: P1 }, { admin: l.client, sellerId: VENDEUR });
  for (const { table, filtres } of [...p.journal, ...s.journal, ...l.journal]) {
    assert.ok(filtres.includes(`seller_id=${VENDEUR}`) || filtres.includes(`products.seller_id=${VENDEUR}`), `${table} lu sans filtre vendeur : ${filtres}`);
  }
});

test("B3 — une vente ne transporte AUCUNE donnée acheteur, et dit si elle est réelle", async () => {
  const s = faux([vente(1, { zabelie_payment_is_live: false })]);
  const r = await sellerSales({ limit: 20 }, { admin: s.client, sellerId: VENDEUR });
  assert.doesNotMatch(s.journal[0].select, /buyer|recipient|phone|email|address/i);
  assert.ok(SellerSalesOutput.safeParse(r).success);
  assert.equal(r.results[0].live, false);
  const champs = Object.keys(SellerSalesOutput.shape.results.element.shape);
  assert.deepEqual(champs.filter((c) => /buyer|recipient|phone|email|address|name/i.test(c)), []);
  assert.ok(s.journal[0].filtres.some((f) => f === "status in paid|delivered|refunded|disputed"), "les commandes non payées ne sont pas des ventes");
});

test("B4 — lien produit : boutique d'autrui = introuvable ; brouillon et rupture refusés ; sinon l'adresse de la fiche", async () => {
  const autre = faux((f) => (f.includes(`seller_id=${AUTRE}`) ? [produit()] : []));
  await assert.rejects(createProductLink({ productId: P1 }, { admin: autre.client, sellerId: VENDEUR }), (e: ErreurApi) => e.code === "not_found");
  await assert.rejects(createProductLink({ productId: P1 }, { admin: faux([produit({ status: "draft" })]).client, sellerId: VENDEUR }), (e: ErreurApi) => e.code === "unsupported_state");
  await assert.rejects(createProductLink({ productId: P1 }, { admin: faux([produit({ in_stock: false })]).client, sellerId: VENDEUR }), (e: ErreurApi) => e.code === "unsupported_state");
  const ok = await createProductLink({ productId: P1 }, { admin: faux([produit()]).client, sellerId: VENDEUR });
  assert.match(ok.url, /^https?:\/\/[^/]+\/produit\/sak-pay$/);
});

test("B5 — pagination : une ligne de plus que la page donne un curseur, un curseur forgé est refusé", async () => {
  const r = await sellerSales({ limit: 2 }, { admin: faux([vente(3), vente(2), vente(1)]).client, sellerId: VENDEUR });
  assert.equal(r.results.length, 2);
  assert.ok(r.nextCursor);
  const suite = faux([vente(1)]);
  await sellerSales({ limit: 2, cursor: r.nextCursor! }, { admin: suite.client, sellerId: VENDEUR });
  assert.ok(suite.journal[0].filtres.some((f) => f.startsWith("or created_at.lt.2026-10-02")), "la page suivante doit partir de la dernière vente vue");
  await assert.rejects(sellerSales({ limit: 2, cursor: "pas-un-curseur" }, { admin: faux([]).client, sellerId: VENDEUR }), (e: ErreurApi) => e.code === "invalid_input");
  const fin = await sellerProducts({ limit: 5 }, { admin: faux([produit()]).client, sellerId: VENDEUR });
  assert.equal(fin.nextCursor, null);
  assert.ok(SellerProductsOutput.safeParse(fin).success);
});

test("B6 — un brouillon n'a pas d'adresse publique", async () => {
  const r = await sellerProducts({ limit: 5 }, { admin: faux([produit({ status: "draft" })]).client, sellerId: VENDEUR });
  assert.equal(r.results[0].url, null);
});

test("B7 — la route : clé avant tout, portée vérifiée, cadence par clé, aucun CORS", () => {
  const src = readFileSync("app/api/v1/seller/[endpoint]/route.ts", "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const i = (m: RegExp) => { const r = src.search(m); assert.ok(r >= 0, `absent : ${m}`); return r; };
  const cle = i(/const brutCle = lireCle\(req\.headers\);\s*if \(!brutCle\) return erreur\(lang, "unauthenticated"/);
  const resolution = i(/if \(!resolue\) return erreur\(lang, "unauthenticated"/);
  const portee = i(/if \(!resolue\.scopes\.includes\(scope\)\) return erreur\(lang, "forbidden"/);
  const cadence = i(/rateLimit\(admin, `apiv1:seller:\$\{resolue\.keyId\}`/);
  const corps = i(/brut = await readApiBody\(req\)/);
  const handler = i(/\{ admin, sellerId: resolue\.sellerId \}/);
  assert.ok(cle < resolution && resolution < portee && portee < cadence && cadence < corps && corps < handler, "ordre des gardes rompu");
  // Aucun CORS sur le POST (celui qui porte la clé) ; le contrat OpenAPI, public, en a.
  const post = src.slice(src.indexOf("export async function POST"), src.indexOf("export async function GET"));
  assert.ok(post.length > 500, "corps du POST introuvable");
  assert.doesNotMatch(post, /Access-Control-Allow-Origin/);
});

test("B8 — le contrat OpenAPI vendeur couvre exactement le registre, avec authentification", async () => {
  const { sellerOpenApiDocument } = await import("../lib/api/v1/seller-openapi");
  const doc = sellerOpenApiDocument();
  assert.deepEqual(Object.keys(doc.paths).sort(), Object.keys(SELLER_ENDPOINTS).map((n) => `/api/v1/seller/${n}`).sort());
  for (const op of Object.values(doc.paths)) assert.deepEqual(op.post.security, [{ cleApi: [] }]);
  assert.doesNotThrow(() => JSON.stringify(doc));
});

test("B9 — QUATRE LANGUES : chaque message et le contrat existent en fr, ht, en, es ; aucune phrase en dur", async () => {
  const { MESSAGES, LANGUES_API, langueApi, message } = await import("../lib/api/v1/seller-i18n");
  const { TEXTES_OPENAPI, sellerOpenApiDocument } = await import("../lib/api/v1/seller-openapi");
  for (const [cle, textes] of Object.entries(MESSAGES)) {
    for (const l of LANGUES_API) assert.ok((textes as Record<string, string>)[l]?.trim(), `${cle} sans traduction ${l}`);
    assert.equal(new Set(Object.values(textes)).size, 4, `${cle} : deux langues portent le même texte (traduction oubliée ?)`);
  }
  for (const l of LANGUES_API) {
    assert.deepEqual(Object.keys(TEXTES_OPENAPI[l]).sort(), Object.keys(TEXTES_OPENAPI.fr).sort());
    const doc = sellerOpenApiDocument(l);
    assert.equal(doc.info.description, TEXTES_OPENAPI[l].intro);
    assert.deepEqual(Object.keys(doc.paths), Object.keys(sellerOpenApiDocument("fr").paths));
  }
  // Choix de la langue : ?lang= d'abord, puis Accept-Language, sinon français.
  assert.equal(langueApi(new Headers({ "accept-language": "ht-HT,fr;q=0.8" })), "ht");
  assert.equal(langueApi(new Headers({ "accept-language": "de-DE,es;q=0.5" })), "es");
  assert.equal(langueApi(new Headers({ "accept-language": "de" })), "fr");
  assert.equal(langueApi(new Headers({ "accept-language": "en" }), "https://zabelie.com/x?lang=ht"), "ht");
  assert.equal(langueApi(new Headers(), "https://zabelie.com/x?lang=de"), "fr");
  assert.equal(message("ht", "scope_missing", { scope: "sales:read" }), "Kle sa a pa gen dwa sales:read.");

  // La route ne passe JAMAIS une phrase à `erreur` : seulement des clés traduites.
  const route = readFileSync("app/api/v1/seller/[endpoint]/route.ts", "utf8");
  const appels = [...route.matchAll(/erreur\(lang, "[a-z_]+", ([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(appels.length >= 10, `témoin : ${appels.length} appels lus`);
  for (const a of appels) assert.match(a, /^"[a-z_]+"$|^estCleMessage\(e\.message\) \? e\.message : "internal"$/, `message non traduit : ${a}`);
  assert.doesNotMatch(route, /erreur\("[a-z_]+", "/, "ancienne forme, phrase en dur");
  // Les handlers lèvent des CLÉS connues.
  const handlers = readFileSync("lib/api/v1/seller.ts", "utf8");
  const cles = [...handlers.matchAll(/new ErreurApi\("[a-z_]+", "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(cles.length >= 6);
  for (const c of cles) assert.ok(Object.prototype.hasOwnProperty.call(MESSAGES, c), `clé inconnue : ${c}`);
});
