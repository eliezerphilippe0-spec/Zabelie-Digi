import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as apiKeys from "../lib/api-keys";
import { SCOPES, SCOPES_PAR_DEFAUT, SCOPE_PREPARER } from "../lib/api-keys";
import * as fichePreparee from "../lib/fiche-preparee";
import {
  FICHES_PREPAREES_MAX_EN_ATTENTE, FICHES_PREPAREES_PAR_HEURE, FICHE_PREPAREE_JOURS, PARAM_PREPAREE,
  cheminFichePreparee, descriptionPreparee, lireIdPreparee, titrePrepare,
} from "../lib/fiche-preparee";
import { lireFichePreparee } from "../lib/fiche-preparee-serveur";
import { ErreurApi } from "../lib/api/v1/handlers";
import { PrepareProductInput, PrepareProductOutput, SELLER_ENDPOINTS, operationEcrit, prepareProduct } from "../lib/api/v1/seller";
import { sellerOpenApiDocument } from "../lib/api/v1/seller-openapi";
import { outilsVendeurMcp } from "../lib/mcp/serveur";
import { MESSAGES } from "../lib/api/v1/messages";
import { DICT } from "../lib/i18n";
import { PRODUCT_KINDS } from "../lib/product-kind";
import { database, loadRoute } from "./helpers/route-harness";

/**
 * FICHE PRÉPARÉE PAR UN ASSISTANT (lot 3b, 0171).
 *
 * Ce que ces tests tiennent, dans l'ordre d'importance :
 *
 *   1. un assistant ne crée JAMAIS de produit : `prepare_product` n'écrit que
 *      dans `zabelie_fiches_preparees`, et ne touche ni `products` ni
 *      l'attestation de politique ;
 *   2. la portée `products:prepare` n'est jamais donnée par défaut ;
 *   3. le dépôt est cloisonné au vendeur de la clé, la reprise au vendeur de
 *      la session ;
 *   4. l'outil MCP ne se dit pas « lecture seule ».
 *
 * La base, elle, est éprouvée par `supabase/tests/fiches_preparees.test.sql`.
 */

const VENDEUR = "11111111-1111-4111-8111-111111111111";
const CLE_ID = "55555555-5555-4555-8555-555555555555";
const FICHE = "66666666-6666-4666-8666-666666666666";
const LANGUES = ["fr", "ht", "en", "es"] as const;
const SQL = readFileSync("supabase/migrations/0171_zabelie_fiches_preparees.sql", "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gm, "");

/** Faux client de service : note chaque table touchée, chaque ligne déposée, chaque RPC. */
function fauxDepot({ erreur = null as null | { code: string }, quota = true as boolean } = {}) {
  const tables: string[] = [];
  const lignes: Record<string, unknown>[] = [];
  const rpcs: { nom: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc(nom: string, args: Record<string, unknown>) {
      rpcs.push({ nom, args });
      return { abortSignal: async () => ({ data: quota, error: null }) };
    },
    from(table: string) {
      tables.push(table);
      return {
        insert(ligne: Record<string, unknown>) {
          lignes.push(ligne);
          return { select: () => ({ single: async () => (erreur ? { data: null, error: erreur } : { data: { id: FICHE, kind: ligne.kind, expires_at: "2026-11-18T10:00:00.000Z" }, error: null }) }) };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { client, tables, lignes, rpcs };
}

// ── 1. Un assistant ne crée jamais de produit ───────────────────────────────

test("prepare_product dépose UNE ligne dans zabelie_fiches_preparees, pour le vendeur de la clé, et rien ailleurs", async () => {
  const f = fauxDepot();
  const sortie = await prepareProduct(
    { kind: "fichier", title: "Gid pou vann sou entènèt", description: "Yon PDF 40 paj.", priceHtg: 500 },
    { admin: f.client, sellerId: VENDEUR, keyId: CLE_ID },
  );
  assert.deepEqual(f.tables, ["zabelie_fiches_preparees"], "une seule table touchée, et ce n'est pas `products`");
  assert.deepEqual(f.lignes, [{
    seller_id: VENDEUR, api_key_id: CLE_ID, kind: "fichier", title: "Gid pou vann sou entènèt", description: "Yon PDF 40 paj.", price_htg: 500,
  }]);
  // Aucune attestation de politique : elle reste au vendeur.
  assert.deepEqual(f.rpcs.map((r) => r.nom), ["zabelie_rate_limit"]);
  const v = PrepareProductOutput.parse(sortie);
  assert.equal(v.published, false);
  assert.equal(v.id, FICHE);
  assert.match(v.url, new RegExp(`/vendre\\?nouveau=numerique&${PARAM_PREPAREE}=${FICHE}#formulaire$`));
});

test("le corps de prepareProduct ne nomme ni `products` ni l'attestation de politique", () => {
  const src = sansCommentaires(readFileSync("lib/api/v1/seller.ts", "utf8"));
  const debut = src.indexOf("export async function prepareProduct");
  const fin = src.indexOf("export const SELLER_HANDLERS");
  assert.ok(debut > 0 && fin > debut, "prepareProduct introuvable");
  const corps = src.slice(debut, fin);
  assert.match(corps, /\.from\("zabelie_fiches_preparees"\)\s*\.insert\(\{\s*seller_id: ctx\.sellerId,/);
  assert.equal([...corps.matchAll(/\.from\(/g)].length, 1, "une seule table dans prepareProduct");
  assert.doesNotMatch(corps, /zabelie_record_policy_acceptance|policyAccepted|creerBrouillonProduit|"products"/);
  // La création de produit, elle, exige toujours l'acceptation du vendeur.
  assert.match(readFileSync("lib/product-draft.ts", "utf8"), /if \(body\.policyAccepted !== true\) \{\s*return NextResponse\.json\(\s*\{ error: t\(lang, "api\.policy\.required"\), code: "policy_required" \}/);
});

test("le type choisit le formulaire ; un type inconnu est refusé avant tout dépôt", async () => {
  assert.equal(cheminFichePreparee("fichier", FICHE), `/vendre?nouveau=numerique&preparee=${FICHE}#formulaire`);
  assert.equal(cheminFichePreparee("service", FICHE), `/vendre?nouveau=prestation&preparee=${FICHE}#formulaire`);
  assert.equal(cheminFichePreparee("physical", FICHE), `/vendre/physique?preparee=${FICHE}`);
  // Chaque type de l'énumération a son formulaire : en ajouter un sans branche ferait rougir ceci.
  for (const kind of PRODUCT_KINDS) assert.ok(cheminFichePreparee(kind, FICHE), `${kind} : aucun formulaire`);
  assert.equal(new Set(PRODUCT_KINDS.map((k) => cheminFichePreparee(k, FICHE))).size, PRODUCT_KINDS.length);

  const f = fauxDepot();
  await assert.rejects(
    prepareProduct({ kind: "abonnement", title: "x" } as never, { admin: f.client, sellerId: VENDEUR }),
    (e) => e instanceof ErreurApi && e.code === "invalid_input" && e.field === "kind",
  );
  assert.deepEqual(f.tables, []);
  for (const kind of PRODUCT_KINDS) assert.ok(PrepareProductInput.safeParse({ kind, title: "x" }).success);
  assert.ok(!PrepareProductInput.safeParse({ kind: "abonnement", title: "x" }).success);
});

test("l'entrée est fermée : ni champ en trop, ni prix négatif ou décimal, ni titre vide", () => {
  const ok = { kind: "service", title: "Leson gita" };
  assert.ok(PrepareProductInput.safeParse(ok).success);
  for (const mauvais of [
    { ...ok, title: "" }, { ...ok, title: "x".repeat(141) }, { ...ok, description: "x".repeat(5001) },
    { ...ok, priceHtg: -1 }, { ...ok, priceHtg: 12.5 }, { ...ok, priceHtg: "500" }, { ...ok, priceHtg: 2147483648 },
    { ...ok, policyAccepted: true }, { ...ok, sellerId: VENDEUR }, { ...ok, status: "published" }, { ...ok, category: "livres" },
  ]) assert.ok(!PrepareProductInput.safeParse(mauvais).success, JSON.stringify(mauvais).slice(0, 80));
});

test("le texte reçu est ramené à du texte ; un titre qui n'est que du balisage est refusé", async () => {
  assert.equal(titrePrepare("  <b>Sak   pay</b>\n fèt alamen "), "Sak pay fèt alamen");
  assert.equal(titrePrepare("&lt;script&gt;alert(1)&lt;/script&gt;Sak"), "Sak");
  // Espace de largeur nulle et marque de direction : écrits par code, jamais en clair dans le source.
  assert.equal(titrePrepare(`Sak${String.fromCharCode(0x200b, 0x202e)} pay`), "Sak pay");
  assert.equal(titrePrepare("<br>"), "");
  assert.equal(titrePrepare(42), "");
  assert.equal(descriptionPreparee("<p>Liy 1</p><p>Liy 2</p>"), "Liy 1\nLiy 2");
  assert.equal(descriptionPreparee("   "), null);
  assert.equal(descriptionPreparee(undefined), null);

  const f = fauxDepot();
  await assert.rejects(
    prepareProduct({ kind: "fichier", title: "<br>" }, { admin: f.client, sellerId: VENDEUR }),
    (e) => e instanceof ErreurApi && e.code === "invalid_input" && e.field === "title",
  );
  assert.deepEqual(f.tables, []);

  const g = fauxDepot();
  await prepareProduct({ kind: "physical", title: "<i>Sandal</i> kwi" }, { admin: g.client, sellerId: VENDEUR });
  assert.deepEqual(g.lignes, [{ seller_id: VENDEUR, api_key_id: null, kind: "physical", title: "Sandal kwi", description: null, price_htg: null }]);
});

test("cadence par VENDEUR, plafond dit comme un état, panne dite comme une panne", async () => {
  const quota = fauxDepot({ quota: false });
  await assert.rejects(
    prepareProduct({ kind: "fichier", title: "x" }, { admin: quota.client, sellerId: VENDEUR, keyId: CLE_ID }),
    (e) => e instanceof ErreurApi && e.code === "rate_limited",
  );
  assert.deepEqual(quota.tables, [], "rien n'est déposé quand la cadence est dépassée");
  // La clé de cadence porte le VENDEUR, pas la clé d'API : cinq clés ne font pas cinq quotas.
  assert.deepEqual(quota.rpcs[0].args, { p_key: `fiche_preparee:${VENDEUR}`, p_limit: FICHES_PREPAREES_PAR_HEURE, p_window_seconds: 3600 });

  await assert.rejects(
    prepareProduct({ kind: "fichier", title: "x" }, { admin: fauxDepot({ erreur: { code: "ZB171" } }).client, sellerId: VENDEUR }),
    (e) => e instanceof ErreurApi && e.code === "unsupported_state" && e.message === "prepared_limit",
  );
  await assert.rejects(
    prepareProduct({ kind: "fichier", title: "x" }, { admin: fauxDepot({ erreur: { code: "42P01" } }).client, sellerId: VENDEUR }),
    (e) => e instanceof ErreurApi && e.code === "internal" && e.message === "unavailable",
  );
});

// ── 2. La portée n'est jamais donnée par défaut ─────────────────────────────

test("products:prepare : exigée par le seul prepare_product, jamais par défaut, choisie à la création", async () => {
  assert.equal(SELLER_ENDPOINTS.prepare_product.scope, SCOPE_PREPARER);
  for (const [nom, e] of Object.entries(SELLER_ENDPOINTS)) {
    assert.equal(e.scope === SCOPE_PREPARER, nom === "prepare_product", `${nom} : portée ${e.scope}`);
  }
  assert.ok((SCOPES as readonly string[]).includes(SCOPE_PREPARER));
  assert.ok(!(SCOPES_PAR_DEFAUT as readonly string[]).includes(SCOPE_PREPARER));

  const creer = async (corps: unknown, erreur: null | { code: string; message: string } = null) => {
    const db = database(() => (erreur ? { data: null, error: erreur } : { data: { id: CLE_ID, name: "n", prefix: "zb_live_abc123", scopes: [], created_at: "x" }, error: null }));
    const route = loadRoute("app/api/account/api-keys/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: VENDEUR } } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
      "@/lib/api-keys": apiKeys,
    });
    const res = await route.POST(new Request("https://zabelie.test/api/account/api-keys", { method: "POST", body: JSON.stringify(corps) }));
    const insert = db.queries[0]?.steps.find(([m]) => m === "insert")?.[1][0] as { scopes: string[] } | undefined;
    return { status: res.status, scopes: insert?.scopes };
  };
  assert.deepEqual(await creer({ name: "Mon site" }), { status: 201, scopes: [...SCOPES_PAR_DEFAUT] });
  assert.deepEqual(await creer({ name: "Assistant", prepare: true }), { status: 201, scopes: [...SCOPES_PAR_DEFAUT, SCOPE_PREPARER] });
  // Seul `true` compte : une chaîne, un nombre, une liste de portées fournie par le client ne donnent rien.
  for (const prepare of ["true", 1, ["products:prepare"], { on: true }]) {
    assert.deepEqual(await creer({ name: "x", prepare }), { status: 201, scopes: [...SCOPES_PAR_DEFAUT] }, String(prepare));
  }
  assert.deepEqual(await creer({ name: "x", scopes: ["products:prepare", "webhooks:manage"] }), { status: 201, scopes: [...SCOPES_PAR_DEFAUT] });
  // Migration 0171 absente : la base refuse la portée, la route le dit en 503, sans clé créée.
  assert.equal((await creer({ name: "x", prepare: true }, { code: "23514", message: "check" })).status, 503);
});

test("l'écran des clés : la case est décochée d'office, et la clé qui prépare le dit", () => {
  const src = readFileSync("components/api-keys-manager.tsx", "utf8");
  assert.match(src, /const \[preparer, setPreparer\] = useState\(false\);/);
  assert.match(src, /body: JSON\.stringify\(\{ name: nom, prepare: preparer \}\)/);
  assert.match(src, /<input type="checkbox"[^>]*checked=\{preparer\}[^>]*aria-describedby="cle-preparer-aide"/);
  assert.match(src, /setNouvelle\(corps\.key\); setNom\(""\); setPreparer\(false\);/);
  assert.match(src, /\{c\.prepare && <p[^>]*>\{labels\.prepareBadge\}<\/p>\}/);
  assert.match(readFileSync("app/tableau-de-bord/api/page.tsx", "utf8"), /prepare: Array\.isArray\(k\.scopes\) && k\.scopes\.includes\(SCOPE_PREPARER\),/);
});

// ── 3. Cloisonnement de la lecture et de la reprise ─────────────────────────

test("lireIdPreparee : un UUID, ou rien", () => {
  assert.equal(lireIdPreparee(FICHE), FICHE);
  assert.equal(lireIdPreparee(FICHE.toUpperCase()), FICHE);
  assert.equal(lireIdPreparee([FICHE, "autre"]), FICHE);
  for (const non of [undefined, null, "", "1", `${FICHE}x`, `${FICHE}'; drop table`, 42, {}, "../../etc"]) assert.equal(lireIdPreparee(non), null, String(non));
});

test("lecture : le vendeur de la session, une fiche non expirée, et le nom de SA clé", async () => {
  const ligne = (o: Record<string, unknown> = {}) => ({
    id: FICHE, kind: "service", title: "Leson gita", description: null, price_htg: 750,
    expires_at: "2026-11-18T10:00:00.000Z", reprise_at: null, api_key_id: CLE_ID, ...o,
  });
  const maintenant = new Date("2026-11-11T10:00:00.000Z");
  const lire = async (fiche: unknown, cle: unknown = { name: "Assistant" }) => {
    const db = database((q) => ({ data: q.table === "zabelie_fiches_preparees" ? fiche : cle, error: null }));
    const r = await lireFichePreparee(db as unknown as SupabaseClient, VENDEUR, FICHE, maintenant);
    return { r, db };
  };
  const { r, db } = await lire(ligne());
  assert.deepEqual(r, {
    chemin: `/vendre?nouveau=prestation&preparee=${FICHE}#formulaire`,
    fiche: { id: FICHE, titre: "Leson gita", description: "", prixHtg: 750, cle: "Assistant", dejaReprise: false },
  });
  // Les DEUX lectures portent le vendeur de la session, en plus de la RLS.
  for (const q of db.queries) {
    assert.ok(q.steps.some(([m, a]) => m === "eq" && a[0] === "seller_id" && a[1] === VENDEUR), `${q.table} lu sans filtre vendeur`);
  }
  assert.equal((await lire(null)).r, null, "fiche inconnue ou d'autrui");
  assert.equal((await lire(ligne({ expires_at: "2026-11-11T10:00:00.000Z" }))).r, null, "expirée à l'instant");
  assert.equal((await lire(ligne({ expires_at: "2026-11-01T10:00:00.000Z" }))).r, null, "expirée");
  assert.equal((await lire(ligne({ kind: "abonnement" }))).r, null, "type inconnu");
  assert.equal((await lire(ligne({ reprise_at: "2026-11-10T10:00:00.000Z" }))).r?.fiche.dejaReprise, true);
  assert.equal((await lire(ligne({ api_key_id: null }))).r?.fiche.cle, null);
  assert.equal((await lire(ligne({ price_htg: null }))).r?.fiche.prixHtg, null);
});

test("reprise : session exigée, identifiant validé, mise à jour cloisonnée au vendeur de la session", async () => {
  const charger = (user: { id: string } | null, erreur: unknown = null, bloque: Response | null = null) => {
    const db = database(() => ({ data: null, error: erreur }));
    const route = loadRoute("app/api/account/fiches-preparees/[id]/reprise/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/auth": { requireActiveAccount: async () => bloque },
      "@/lib/fiche-preparee": fichePreparee,
    });
    const appeler = (id: string) => route.POST(new Request("https://zabelie.test/x", { method: "POST" }), { params: Promise.resolve({ id }) });
    return { db, appeler };
  };
  const anonyme = charger(null);
  assert.equal((await anonyme.appeler(FICHE)).status, 401);
  assert.equal(anonyme.db.queries.length, 0);

  const suspendu = charger({ id: VENDEUR }, null, Response.json({ error: "suspendu" }, { status: 403 }));
  assert.equal((await suspendu.appeler(FICHE)).status, 403);
  assert.equal(suspendu.db.queries.length, 0);

  const mauvais = charger({ id: VENDEUR });
  assert.equal((await mauvais.appeler("pas-un-uuid")).status, 404);
  assert.equal(mauvais.db.queries.length, 0);

  const ok = charger({ id: VENDEUR });
  const res = await ok.appeler(FICHE);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  const [q] = ok.db.queries;
  assert.equal(q.table, "zabelie_fiches_preparees");
  const etapes = q.steps.map(([m, a]) => `${m}:${JSON.stringify(a)}`);
  assert.equal(q.steps[0][0], "update");
  assert.deepEqual(Object.keys(q.steps[0][1][0] as object), ["reprise_at"], "seule la reprise s'écrit");
  assert.ok(etapes.includes(`eq:["id","${FICHE}"]`));
  assert.ok(etapes.includes(`eq:["seller_id","${VENDEUR}"]`), "mise à jour sans filtre vendeur");
  assert.ok(etapes.includes(`is:["reprise_at",null]`));

  assert.equal((await charger({ id: VENDEUR }, { code: "42P01" }).appeler(FICHE)).status, 503);
});

test("pages : la fiche est lue avec le client de SESSION, et le vendeur est celui de la session", () => {
  const vendre = readFileSync("app/vendre/page.tsx", "utf8");
  assert.match(vendre, /const prepareeLue = idPreparee \? await lireFichePreparee\(supabase, user\.id, idPreparee\) : null;/);
  assert.match(vendre, /const supabase = await createClient\(\);\s*const \{\s*data: \{ user \},\s*\} = await supabase\.auth\.getUser\(\);/);
  assert.match(vendre, /if \(prepareeLue && \(!nouveau \|\| cheminFichePreparee\(nouveau, prepareeLue\.fiche\.id\) !== prepareeLue\.chemin\)\) redirect\(prepareeLue\.chemin\);/);
  const physique = readFileSync("app/vendre/physique/page.tsx", "utf8");
  assert.match(physique, /const pricingClient = await createClient\(\);/);
  assert.match(physique, /const prepareeLue = user && idPreparee \? await lireFichePreparee\(pricingClient, user\.id, idPreparee\) : null;/);
  for (const page of [vendre, physique]) {
    assert.doesNotMatch(page, /lireFichePreparee\(\s*(admin|createAdminClient\(\))/, "jamais le client de service pour lire une fiche préparée");
    assert.match(page, /\{prepareeAbsente && <MessageErreur className="mb-4">\{t\(lang, "prepared\.missing"\)\}<\/MessageErreur>\}/);
  }
});

test("formulaires : la reprise passe par l'import (accord, politique), le prix ne s'ajoute qu'après", () => {
  const fichier = readFileSync("components/publish-form.tsx", "utf8");
  assert.match(fichier, /function reprendrePreparee\(fiche: FicheRecue\): boolean \{\s*if \(!appliquerImport\(fiche\)\) return false;\s*const prix = fiche\.prixHtg;\s*if \(typeof prix === "number" && Number\.isSafeInteger\(prix\) && prix >= 0\) setForm\(/);
  assert.match(fichier, /\{importLabels && preparee && <FichePreparee [^>]*onReprendre=\{reprendrePreparee\} \/>\}/);
  const physique = readFileSync("components/physical-product-form.tsx", "utf8");
  // Un prix déjà saisi par le vendeur n'est pas écrasé, et un article physique ne se propose pas à 0.
  assert.match(physique, /function reprendrePreparee\(fiche: FicheRecue\): boolean \{\s*if \(!appliquerImport\(fiche\)\) return false;\s*const prix = fiche\.prixHtg;\s*if \(typeof prix === "number" && Number\.isSafeInteger\(prix\) && prix >= 1 && !price\) setPrice\(/);
  assert.match(physique, /\{importLabels && preparee && <FichePreparee [^>]*onReprendre=\{reprendrePreparee\} \/>\}/);

  const bloc = readFileSync("components/fiche-preparee.tsx", "utf8");
  // Le formulaire décide d'abord ; la reprise n'est signalée au serveur que s'il a accepté.
  assert.match(bloc, /if \(!onReprendre\(\{ titre: fiche\.titre, description: fiche\.description, marque: null, prixHtg: fiche\.prixHtg \}\)\) return;\s*setFait\(true\);[\s\S]{0,400}fetch\(`\/api\/account\/fiches-preparees\/\$\{fiche\.id\}\/reprise`, \{ method: "POST" \}\)/);
  assert.match(bloc, /<button type="button" className="bouton bouton-secondaire mt-3" disabled=\{disabled\} onClick=\{reprendre\}>/, "l'action principale du formulaire reste l'envoi");
  assert.doesNotMatch(bloc, /bouton-primaire|type="submit"|policy/i);
});

// ── 4. L'outil MCP et le contrat ────────────────────────────────────────────

test("MCP : prepare_product ne se dit pas en lecture seule ; les autres outils vendeur, si", () => {
  assert.equal(operationEcrit("prepare_product"), true);
  for (const nom of Object.keys(SELLER_ENDPOINTS).filter((n) => n !== "prepare_product")) assert.equal(operationEcrit(nom), false, nom);
  for (const non of ["", "toString", "constructor", "search_products"]) assert.equal(operationEcrit(non), false, non);
  for (const lang of LANGUES) {
    for (const o of outilsVendeurMcp(lang)) {
      if (o.name === "prepare_product") {
        assert.deepEqual(o.annotations, { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
      } else {
        assert.deepEqual(o.annotations, { readOnlyHint: true, idempotentHint: true, openWorldHint: false });
      }
    }
  }
});

test("la description dit, dans chaque langue, que rien n'est créé et que le vendeur envoie lui-même", () => {
  const descriptions = LANGUES.map((lang) => {
    const doc = sellerOpenApiDocument(lang) as unknown as { paths: Record<string, { post: { description: string } }> };
    const depot = doc.paths["/api/v1/seller/prepare_product"].post.description;
    assert.match(depot, /products:prepare/);
    assert.match(depot, /\burl\b/);
    assert.match(depot, new RegExp(`(?<![0-9])${FICHES_PREPAREES_MAX_EN_ATTENTE}(?![0-9])`), `${lang} : plafond absent`);
    assert.match(depot, new RegExp(`(?<![0-9])${FICHE_PREPAREE_JOURS}(?![0-9])`), `${lang} : durée absente`);
    // Les lectures ne portent pas cette mention.
    assert.ok(!doc.paths["/api/v1/seller/seller_products"].post.description.includes(depot.slice(-40)));
    assert.equal(outilsVendeurMcp(lang).find((o) => o.name === "prepare_product")!.description, depot);
    return depot;
  });
  assert.equal(new Set(descriptions).size, LANGUES.length, "la mention doit être traduite");
  assert.match(descriptions[0], /Ne crée PAS de produit/);
  assert.match(descriptions[1], /Li PA kreye pwodwi/);
  assert.match(descriptions[2], /Does NOT create a product/);
  assert.match(descriptions[3], /NO crea un producto/);
});

test("les bornes du code sont celles de la migration", () => {
  assert.match(SQL, new RegExp(`if v_attente >= ${FICHES_PREPAREES_MAX_EN_ATTENTE} then`));
  assert.match(SQL, new RegExp(`expires_at\\s+timestamptz not null default \\(now\\(\\) \\+ interval '${FICHE_PREPAREE_JOURS} days'\\)`));
  assert.match(SQL, /where seller_id = new\.seller_id and reprise_at is null and expires_at > now\(\);/);
  assert.match(SQL, /alter table zabelie_fiches_preparees enable row level security;/);
  assert.match(SQL, /revoke insert, update, delete on zabelie_fiches_preparees from authenticated;/);
  for (const lang of LANGUES) {
    assert.match(MESSAGES.prepared_limit[lang], new RegExp(`(?<![0-9])${FICHE_PREPAREE_JOURS}(?![0-9])`), lang);
  }
});

test("les textes existent dans les quatre langues", () => {
  const cles = [
    "prepared.title", "prepared.hint", "prepared.hintNoKey", "prepared.price", "prepared.cta", "prepared.done", "prepared.already", "prepared.missing",
    "apikeys.prepare", "apikeys.prepare.hint", "apikeys.prepare.badge",
  ];
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    for (const cle of cles) assert.ok(d[cle] && d[cle].length > 3, `${lang} : ${cle}`);
    assert.match(d["prepared.hint"], /\{key\}/u, `${lang} : {key} absent`);
    assert.match(d["prepared.price"], /\{price\}/u, `${lang} : {price} absent`);
  }
  assert.equal(new Set(LANGUES.map((l) => (DICT[l] as Record<string, string>)["prepared.cta"])).size, LANGUES.length);
});
