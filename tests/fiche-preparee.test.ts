import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as apiKeys from "../lib/api-keys";
import { SCOPES, SCOPES_PAR_DEFAUT, SCOPE_PREPARER } from "../lib/api-keys";
import * as fichePreparee from "../lib/fiche-preparee";
import {
  FICHES_PREPAREES_MAX_EN_ATTENTE, FICHES_PREPAREES_MAX_TOTAL, FICHES_PREPAREES_PAR_HEURE, FICHE_PREPAREE_JOURS, PARAM_PREPAREE,
  cheminFichePreparee, descriptionPreparee, lireIdPreparee, titrePrepare,
} from "../lib/fiche-preparee";
import { lireFichePreparee, listerFichesPreparees } from "../lib/fiche-preparee-serveur";
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
    // La fenêtre dure une heure : le message le dit, ce n'est pas le « réessayez dans une minute » du quota par clé.
    (e) => e instanceof ErreurApi && e.code === "rate_limited" && e.message === "prepared_hourly",
  );
  assert.deepEqual(quota.tables, [], "rien n'est déposé quand la cadence est dépassée");
  const route = sansCommentaires(readFileSync("app/api/v1/seller/[endpoint]/route.ts", "utf8"));
  assert.match(route, /if \(code === "rate_limited"\) res\.headers\.set\("Retry-After", cle === "prepared_hourly" \? "3600" : "60"\);/);
  for (const lang of LANGUES) assert.match(MESSAGES.prepared_hourly[lang], new RegExp(`(?<![0-9])${FICHES_PREPAREES_PAR_HEURE}(?![0-9])`), lang);
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
  assert.match(fichier, /function reprendrePreparee\(fiche: FicheRecue\): boolean \{\s*if \(!appliquerImport\(fiche\)\) return false;\s*const prix = fiche\.prixHtg;\s*if \(typeof prix === "number" && Number\.isSafeInteger\(prix\) && prix >= 0 && !form\.priceHTG\) setForm\(/);
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
  assert.match(SQL, new RegExp(`if v_total >= ${FICHES_PREPAREES_MAX_TOTAL} then`));
  // Le verrou vient AVANT le comptage : sans lui, deux dépôts simultanés lisent le même compte.
  assert.match(SQL, /perform pg_advisory_xact_lock\(hashtext\('zabelie_fiches_preparees:' \|\| new\.seller_id::text\)\);[\s\S]{0,900}select count\(\*\) filter \(where reprise_at is null\), count\(\*\)\s+into v_attente, v_total/);
  assert.match(SQL, new RegExp(`expires_at\\s+timestamptz not null default \\(now\\(\\) \\+ interval '${FICHE_PREPAREE_JOURS} days'\\)`));
  assert.match(SQL, /into v_attente, v_total\s+from zabelie_fiches_preparees\s+where seller_id = new\.seller_id and expires_at > now\(\);/);
  assert.match(SQL, /alter table zabelie_fiches_preparees enable row level security;/);
  assert.match(SQL, /revoke all on zabelie_fiches_preparees from anon, authenticated;\s*grant select on zabelie_fiches_preparees to authenticated;/);
  for (const lang of LANGUES) {
    for (const n of [FICHE_PREPAREE_JOURS, FICHES_PREPAREES_MAX_EN_ATTENTE, FICHES_PREPAREES_MAX_TOTAL]) {
      assert.match(MESSAGES.prepared_limit[lang], new RegExp(`(?<![0-9])${n}(?![0-9])`), `${lang} : ${n}`);
    }
  }
});

test("les textes existent dans les quatre langues", () => {
  const cles = [
    "prepared.title", "prepared.hint", "prepared.hintNoKey", "prepared.price", "prepared.cta", "prepared.done", "prepared.already", "prepared.missing",
    "apikeys.prepare", "apikeys.prepare.hint", "apikeys.prepare.badge",
    "preparedList.title", "preparedList.intro", "preparedList.empty", "preparedList.open", "preparedList.delete",
    "preparedList.confirmDelete", "preparedList.expires", "preparedList.taken",
  ];
  for (const lang of LANGUES) {
    const d = DICT[lang] as Record<string, string>;
    for (const cle of cles) assert.ok(d[cle] && d[cle].length > 3, `${lang} : ${cle}`);
    assert.match(d["prepared.hint"], /\{key\}/u, `${lang} : {key} absent`);
    assert.match(d["prepared.price"], /\{price\}/u, `${lang} : {price} absent`);
    assert.match(d["preparedList.expires"], /\{date\}/u, `${lang} : {date} absent`);
  }
  assert.equal(new Set(LANGUES.map((l) => (DICT[l] as Record<string, string>)["prepared.cta"])).size, LANGUES.length);
});

// ── 5. Ce que la relecture indépendante du 2026-11-11 a fait corriger ───────

test("un demi-caractère (substitut isolé) est retiré, une paire bien formée est gardée", () => {
  const haut = String.fromCharCode(0xd83d), bas = String.fromCharCode(0xde00);
  assert.equal(titrePrepare(`Sak ${haut}`), "Sak");
  assert.equal(titrePrepare(`${bas}Sak kwi`), "Sak kwi");
  assert.equal(titrePrepare(`Sak ${haut}${bas} kwi`), `Sak ${haut}${bas} kwi`, "un émoji entier reste");
  assert.equal(descriptionPreparee(`Bèl ${haut}`), "Bèl");
  assert.equal(descriptionPreparee(haut), null);
  for (const t of [titrePrepare(`a${haut}b`), descriptionPreparee(`a${bas}b`)!]) assert.equal(t.isWellFormed(), true);
});

test("le type sans formulaire et la cadence sont jugés AVANT le dépôt", () => {
  const src = sansCommentaires(readFileSync("lib/api/v1/seller.ts", "utf8"));
  const corps = src.slice(src.indexOf("export async function prepareProduct"), src.indexOf("export const SELLER_HANDLERS"));
  const type = corps.search(/if \(!cheminFichePreparee\(input\.kind, "[0-9a-f-]{36}"\)\) throw new ErreurApi\("invalid_input", "input_invalid", "kind"\);/);
  const cadence = corps.search(/if \(!\(await rateLimit\(ctx\.admin, `fiche_preparee:\$\{ctx\.sellerId\}`, FICHES_PREPAREES_PAR_HEURE, 3600\)\)\) \{\s*throw new ErreurApi\("rate_limited", "prepared_hourly"\);/);
  const depot = corps.indexOf('.from("zabelie_fiches_preparees")');
  assert.ok(type > 0 && cadence > type && depot > cadence, "ordre : type, cadence, dépôt");
});

test("suppression : session exigée, identifiant validé, cloisonnée au vendeur de la session", async () => {
  const charger = (user: { id: string } | null, ligne: unknown = { id: FICHE }, erreur: unknown = null) => {
    const db = database(() => ({ data: erreur ? null : ligne, error: erreur }));
    const route = loadRoute("app/api/account/fiches-preparees/[id]/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
      "@/lib/fiche-preparee": fichePreparee,
    });
    return { db, appeler: (id: string) => route.DELETE(new Request("https://zabelie.test/x", { method: "DELETE" }), { params: Promise.resolve({ id }) }) };
  };
  const anonyme = charger(null);
  assert.equal((await anonyme.appeler(FICHE)).status, 401);
  assert.equal(anonyme.db.queries.length, 0);

  const mauvais = charger({ id: VENDEUR });
  assert.equal((await mauvais.appeler("pas-un-uuid")).status, 404);
  assert.equal(mauvais.db.queries.length, 0);

  const ok = charger({ id: VENDEUR });
  assert.equal((await ok.appeler(FICHE)).status, 200);
  const [q] = ok.db.queries;
  assert.equal(q.table, "zabelie_fiches_preparees");
  assert.equal(q.steps[0][0], "delete");
  const etapes = q.steps.map(([m, a]) => `${m}:${JSON.stringify(a)}`);
  assert.ok(etapes.includes(`eq:["id","${FICHE}"]`));
  assert.ok(etapes.includes(`eq:["seller_id","${VENDEUR}"]`), "suppression sans filtre vendeur");

  // La fiche d'un autre vendeur ne touche aucune ligne : 404, comme une fiche inconnue.
  assert.equal((await charger({ id: VENDEUR }, null).appeler(FICHE)).status, 404);
  assert.equal((await charger({ id: VENDEUR }, null, { code: "42P01" }).appeler(FICHE)).status, 503);
});

test("révocation d'une clé : ses fiches NON reprises partent avec elle, et un échec du ménage ne masque pas la révocation", async () => {
  const charger = (menageEnErreur = false) => {
    const db = database((q) => (q.table === "zabelie_api_keys" ? { data: { id: CLE_ID }, error: null } : { data: null, error: menageEnErreur ? { code: "42P01" } : null }));
    const route = loadRoute("app/api/account/api-keys/[id]/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: VENDEUR } } }) } }) },
      "@/lib/supabase/admin": { createAdminClient: () => db },
    });
    return { db, appeler: () => route.DELETE(new Request("https://zabelie.test/x", { method: "DELETE" }), { params: Promise.resolve({ id: CLE_ID }) }) };
  };
  const ok = charger();
  assert.equal((await ok.appeler()).status, 200);
  assert.deepEqual(ok.db.queries.map((q) => q.table), ["zabelie_api_keys", "zabelie_fiches_preparees"], "la clé d'abord, le ménage ensuite");
  const menage = ok.db.queries[1];
  assert.equal(menage.steps[0][0], "delete");
  const etapes = menage.steps.map(([m, a]) => `${m}:${JSON.stringify(a)}`);
  assert.ok(etapes.includes(`eq:["api_key_id","${CLE_ID}"]`), "ménage non borné à la clé révoquée");
  assert.ok(etapes.includes(`eq:["seller_id","${VENDEUR}"]`), "ménage sans filtre vendeur");
  assert.ok(etapes.includes(`is:["reprise_at",null]`), "les fiches déjà reprises ne doivent pas partir");

  // Table absente (0171 non appliquée) ou panne : la clé EST révoquée, la réponse le dit.
  assert.equal((await charger(true).appeler()).status, 200);
});

test("liste : les fiches non expirées du vendeur de la session, avec l'adresse du bon formulaire", async () => {
  const maintenant = new Date("2026-11-11T10:00:00.000Z");
  const lignes = [
    { id: FICHE, kind: "physical", title: "Sandal kwi", price_htg: 1500, expires_at: "2026-11-18T10:00:00.000Z", reprise_at: null },
    { id: CLE_ID, kind: "service", title: "Leson gita", price_htg: null, expires_at: "2026-11-17T10:00:00.000Z", reprise_at: "2026-11-10T10:00:00.000Z" },
    { id: VENDEUR, kind: "abonnement", title: "type inconnu", price_htg: 1, expires_at: "2026-11-17T10:00:00.000Z", reprise_at: null },
  ];
  const db = database(() => ({ data: lignes, error: null }));
  const liste = await listerFichesPreparees(db as unknown as SupabaseClient, VENDEUR, maintenant);
  assert.deepEqual(liste, [
    { id: FICHE, titre: "Sandal kwi", prixHtg: 1500, chemin: `/vendre/physique?preparee=${FICHE}`, expireLe: "2026-11-18T10:00:00.000Z", dejaReprise: false },
    { id: CLE_ID, titre: "Leson gita", prixHtg: null, chemin: `/vendre?nouveau=prestation&preparee=${CLE_ID}#formulaire`, expireLe: "2026-11-17T10:00:00.000Z", dejaReprise: true },
  ]);
  const etapes = db.queries[0].steps.map(([m, a]) => `${m}:${JSON.stringify(a)}`);
  assert.ok(etapes.includes(`eq:["seller_id","${VENDEUR}"]`), "liste lue sans filtre vendeur");
  assert.ok(etapes.includes(`gt:["expires_at","${maintenant.toISOString()}"]`), "les expirées ne sont pas listées");
  assert.ok(etapes.includes(`limit:[${FICHES_PREPAREES_MAX_TOTAL}]`));
  // Lecture impossible : `null`, pas une liste vide — la page ne rend alors pas la rubrique.
  assert.equal(await listerFichesPreparees(database(() => ({ data: null, error: { code: "42P01" } })) as unknown as SupabaseClient, VENDEUR), null);

  const page = readFileSync("app/tableau-de-bord/api/page.tsx", "utf8");
  assert.match(page, /const fichesPreparees = await listerFichesPreparees\(supabase, user\.id\);/);
  assert.match(page, /\{fichesPreparees && \(\s*<>\s*<h2 id="fiches-preparees"/);
  const composant = readFileSync("components/fiches-preparees-liste.tsx", "utf8");
  // Rien n'est supprimé sans confirmation, et aucun bouton principal n'est ajouté à l'écran.
  assert.match(composant, /if \(enCours \|\| !window\.confirm\(labels\.confirmDelete\)\) return;\s*setEnCours\(id\);[\s\S]{0,200}fetch\(`\/api\/account\/fiches-preparees\/\$\{id\}`, \{ method: "DELETE" \}\)/);
  assert.doesNotMatch(composant, /bouton-primaire/);
});

test("le retour après connexion ou acceptation légale garde la fiche préparée", () => {
  const vendre = readFileSync("app/vendre/page.tsx", "utf8");
  assert.match(vendre, /const retour = idPreparee\s*\? \(nouveau \? cheminFichePreparee\(nouveau, idPreparee\) : null\) \?\? `\/vendre\?\$\{PARAM_PREPAREE\}=\$\{idPreparee\}`\s*: "\/vendre";/);
  assert.match(vendre, /href=\{`\/connexion\?mode=signup&next=\$\{encodeURIComponent\(retour\)\}`\}/);
  assert.match(vendre, /href=\{`\/connexion\?next=\$\{encodeURIComponent\(retour\)\}`\}/);
  assert.match(vendre, /await requireLegalAccountPage\(user\.id, retour\);/);
  assert.doesNotMatch(vendre, /next=\/vendre"/, "un lien de connexion en dur perdrait la fiche");
  const physique = readFileSync("app/vendre/physique/page.tsx", "utf8");
  assert.match(physique, /const retour = idPreparee \? \(cheminFichePreparee\(KIND_PHYSICAL, idPreparee\) \?\? "\/vendre\/physique"\) : "\/vendre\/physique";\s*if \(user\) await requireLegalAccountPage\(user\.id, retour\);/);
  assert.match(physique, /href=\{`\/connexion\?next=\$\{encodeURIComponent\(retour\)\}`\}/);
});

test("un nom de clé contenant « $& » s'affiche tel quel", () => {
  const src = readFileSync("components/fiche-preparee.tsx", "utf8");
  assert.match(src, /labels\.hint\.replace\("\{key\}", \(\) => fiche\.cle!\)/);
  assert.match(src, /labels\.price\.replace\("\{price\}", \(\) => prixAffiche\)/);
  // La raison, exécutée : une chaîne de remplacement lit « $& » comme « ce qui a été trouvé ».
  assert.equal("clé « {key} »".replace("{key}", "A $& B"), "clé « A {key} B »");
  assert.equal("clé « {key} »".replace("{key}", () => "A $& B"), "clé « A $& B »");
});
