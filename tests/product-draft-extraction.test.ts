import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as productKind from "../lib/product-kind";

/**
 * TÂCHE 5.1 DU STUDIO : EXTRAIRE SANS CHANGER DE COMPORTEMENT.
 *
 * La création d'un brouillon (`app/api/products/route.ts`) et la confirmation
 * d'un livrable (`app/api/products/asset/route.ts`) vivent maintenant dans
 * `lib/product-draft.ts` et `lib/product-asset-confirm.ts`, pour que
 * « Soumettre à la revue » (5.2) passe par EXACTEMENT les mêmes règles.
 *
 * Ce fichier garde trois choses : que les routes APPELLENT les fonctions
 * partagées (sinon les gardes qui lisent lib/ deviendraient décoratives),
 * que chaque refus de l'ancienne route rend la même réponse, et que ce qui
 * part vers la base ou le stockage n'a pas changé. Avant la fusion, les mêmes
 * scénarios ont été rejoués contre l'ancienne route de main : réponses
 * identiques.
 */

/** Les objets nés dans le bac à sable du harnais ont un autre prototype : on compare leur valeur. */
const v = (x: unknown) => JSON.parse(JSON.stringify(x));

const MOI = "00000000-0000-4000-8000-0000000000a1";
const PRODUIT = "00000000-0000-4000-8000-0000000000c1";
const SOUS_RAYON = "00000000-0000-4000-8000-0000000000d1";

test("E1 — les deux routes appellent les fonctions partagées", () => {
  const creation = readFileSync("app/api/products/route.ts", "utf8");
  assert.match(creation, /const resultat = await creerBrouillonProduit\(\{ req, lang, supabase, user, body \}\);/);
  assert.match(creation, /if \(resultat instanceof Response\) return resultat;\s*\n\s*return NextResponse\.json\(\{ slug: resultat\.slug, status: resultat\.status \}\);/,
    "la route ne rend que le slug et le statut, comme avant l'extraction");
  const actif = readFileSync("app/api/products/asset/route.ts", "utf8");
  assert.match(actif, /return confirmerLivrable\(\{ admin, lang, user, product, productId, body, safeName, ext \}\);/);
  // La propriété, le brouillon et la cadence restent vérifiés AVANT, dans la route.
  assert.match(actif, /product\.seller_id !== user\.id[\s\S]*product\.status !== "draft"[\s\S]*rateLimit\(admin, `digital-upload:\$\{user\.id\}`, 30\)[\s\S]*return confirmerLivrable/);
});

type Scenario = { rpcErreur?: { code?: string; message?: string } | null; limiteOk?: boolean; profilExiste?: boolean; insertErreur?: { code: string; message: string } };

function brouillon(s: Scenario = {}) {
  const ecritures: Query[] = [];
  const rpcs: [string, unknown][] = [];
  const db = database((q) => {
    if (q.table === "profiles" && q.steps.some(([m]) => m === "select")) return { data: s.profilExiste === false ? null : { id: MOI }, error: null };
    if (q.table === "products") {
      if (s.insertErreur) return { data: null, error: s.insertErreur };
      return { data: { id: PRODUIT, slug: "gid-vann-manje-abcde", status: "draft" }, error: null };
    }
    return { data: null, error: null };
  });
  const admin = {
    ...db,
    async rpc(nom: string, args: unknown) { rpcs.push([nom, args]); return { error: s.rpcErreur ?? null }; },
  };
  const mod = loadRoute("lib/product-draft.ts", {
    "@/lib/product-categories": {
      normalizeCategory: async (_s: unknown, c: unknown) => (c === "edikasyon" ? "Éducation" : null),
      normalizeSousRayon: async (_s: unknown, id: unknown) =>
        id === undefined || id === null ? { ok: true, id: null } : id === SOUS_RAYON ? { ok: true, id } : { ok: false },
    },
    "@/lib/product-kind": productKind,
    "@/lib/zabelie-rate-limit": { rateLimit: async () => s.limiteOk !== false },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/payment-utils": { slugify: () => "gid-vann-manje" },
    "@/lib/geo/country-backfill": { backfillCountry: async () => undefined, countryFromRequest: () => null },
    "@/lib/policy": { POLICY_VERSION: "produits-interdits-v4" },
    "@/lib/pg-errors": { isMissingFunction: (e: { code?: string } | null) => e?.code === "PGRST202" },
  });
  const appeler = (body: Record<string, unknown>, lienProjet?: string) =>
    mod.creerBrouillonProduit({ req: new Request("http://x/api/products"), lang: "fr", supabase: {}, user: { id: MOI, email: "vande@example.ht" }, body, lienProjet }) as Promise<unknown>;
  return { appeler, queries: db.queries, rpcs, ecritures };
}

const BASE = { title: "Gid vann manje", description: "Yon gid", kind: productKind.KIND_FILE, category: "edikasyon", priceHTG: 750.4, policyAccepted: true };

async function refus(r: unknown) {
  assert.ok(r instanceof Response, "un refus doit rester une réponse HTTP");
  return { status: r.status, corps: await r.json() };
}

test("E2 — chaque refus de l'ancienne route rend la même réponse", async () => {
  const cas: [string, Record<string, unknown>, Scenario, number, Record<string, unknown>][] = [
    ["titre vide", { ...BASE, title: "  " }, {}, 400, { error: "api.price.invalid" }],
    ["type physique", { ...BASE, kind: productKind.KIND_PHYSICAL }, {}, 400, { error: "api.price.invalid" }],
    ["prix négatif", { ...BASE, priceHTG: -1 }, {}, 400, { error: "api.price.invalid" }],
    ["délai hors bornes", { ...BASE, kind: productKind.KIND_SERVICE, deliveryDays: 400 }, {}, 400, { error: "api.delivery.days" }],
    ["rayon inconnu", { ...BASE, category: "nimpòt" }, {}, 400, { error: "api.category.unknown" }],
    ["sous-rayon d'un autre rayon", { ...BASE, categoryId: "00000000-0000-4000-8000-0000000000ff" }, {}, 400, { error: "api.category.unknown", code: "subcategory_invalid" }],
    ["sans attestation", { ...BASE, policyAccepted: false }, {}, 400, { error: "api.policy.required", code: "policy_required" }],
    ["attestation indisponible", BASE, { rpcErreur: { code: "PGRST202" } }, 503, { error: "api.publish.failed", code: "policy_unavailable" }],
    ["cadence dépassée", BASE, { limiteOk: false }, 429, { error: "api.publish.limited" }],
  ];
  for (const [nom, body, s, status, corps] of cas) {
    const b = brouillon(s);
    const r = await refus(await b.appeler(body));
    assert.equal(r.status, status, nom);
    assert.deepEqual(r.corps, corps, nom);
    assert.ok(!b.queries.some((q) => q.table === "products"), `${nom} : aucune fiche ne doit être créée`);
  }
  // Sans attestation, rien n'est consigné au nom du vendeur.
  const sans = brouillon();
  await sans.appeler({ ...BASE, policyAccepted: false });
  assert.equal(sans.rpcs.length, 0);
});

test("E3 — le succès : même écriture en base, et l'id en plus pour la 5.2", async () => {
  const b = brouillon();
  const r = (await b.appeler({ ...BASE, categoryId: SOUS_RAYON })) as Record<string, unknown>;
  assert.ok(!(r instanceof Response));
  assert.deepEqual(v(r), { id: PRODUIT, slug: "gid-vann-manje-abcde", status: "draft" });
  // L'attestation part AVANT la fiche, avec la version du serveur.
  assert.deepEqual(v(b.rpcs), [["zabelie_record_policy_acceptance", { p_user_id: MOI, p_version: "produits-interdits-v4" }]]);
  // La promotion ne touche que les acheteurs.
  const promotion = b.queries.find((q) => q.table === "profiles" && q.steps.some(([m]) => m === "update"));
  assert.deepEqual(v(promotion?.steps), [["update", [{ role: "creator" }]], ["eq", ["id", MOI]], ["eq", ["role", "buyer"]]]);
  const insertion = b.queries.find((q) => q.table === "products");
  const [methode, [ligne]] = insertion!.steps[0] as [string, [Record<string, unknown>]];
  assert.equal(methode, "insert");
  assert.match(String(ligne.slug), /^gid-vann-manje-[a-z0-9]{1,5}$/);
  assert.deepEqual(v({ ...ligne, slug: "…" }), {
    seller_id: MOI, slug: "…", title: "Gid vann manje", description: "Yon gid", kind: productKind.KIND_FILE,
    category: "Éducation", category_id: SOUS_RAYON, price_htg: 750, delivery_days: null, service_includes: null, status: "draft",
  });
  assert.deepEqual(v(insertion!.steps.slice(1)), [["select", ["id, slug, status"]], ["single", []]]);
});

test("E4 — un service garde le « jour même » et sa liste bornée", async () => {
  const b = brouillon({ profilExiste: false });
  await b.appeler({ ...BASE, kind: productKind.KIND_SERVICE, deliveryDays: 0, serviceIncludes: [" Konsiltasyon ", 3, "", "Swivi"] });
  const ligne = (b.queries.find((q) => q.table === "products")!.steps[0][1] as Record<string, unknown>[])[0];
  assert.equal(ligne.delivery_days, 0);
  assert.deepEqual(v(ligne.service_includes), ["Konsiltasyon", "Swivi"]);
  // Profil absent : créé directement en créateur, comme avant.
  const creation = b.queries.find((q) => q.table === "profiles" && q.steps.some(([m]) => m === "insert"));
  assert.deepEqual(v(creation?.steps[0]), ["insert", [{ id: MOI, display_name: "vande", role: "creator" }]]);
});

function livrable(objet: { name: string; metadata: { size?: number } } | null, existant = false, erreurInsertion: { code: string } | null = null) {
  const supprimes: string[][] = [];
  const db = database((q) => {
    if (q.table === "product_assets" && q.steps.some(([m]) => m === "maybeSingle")) return { data: existant ? { id: "x" } : null };
    if (q.table === "product_assets") return { error: erreurInsertion };
    return { data: null, error: null };
  });
  const admin = {
    ...db,
    storage: {
      from: () => ({
        list: async () => ({ data: objet ? [objet] : [], error: null }),
        remove: async (chemins: string[]) => { supprimes.push(chemins); return { error: null }; },
      }),
    },
  };
  const mod = loadRoute("lib/product-asset-confirm.ts", { "@/lib/storage-buckets": { DIGITAL_BUCKET: "product-files" } });
  const chemin = `${MOI}/${PRODUIT}/liv-00000000-0000-4000-8000-000000000001.pdf`;
  const appeler = (path = chemin) =>
    mod.confirmerLivrable({ admin, lang: "fr", user: { id: MOI }, product: { id: PRODUIT }, productId: PRODUIT, body: { path }, safeName: "gid.pdf", ext: "pdf" });
  return { appeler, chemin, queries: db.queries, supprimes };
}

const PROJET = "00000000-0000-4000-8000-0000000000b1";

test("E6 — « Soumettre à la revue » : le lien vers le projet, et lui seul en plus (5.2)", async () => {
  const b = brouillon();
  await b.appeler(BASE, PROJET);
  const ligne = (b.queries.find((q) => q.table === "products")!.steps[0][1] as Record<string, unknown>[])[0];
  assert.equal(ligne.zabelie_authoring_project_id, PROJET);
  assert.equal(ligne.status, "draft", "la soumission ne publie pas");
  // Sans lien, la colonne n'est même pas nommée : la route classique marche sur un schéma sans 0148.
  const classique = brouillon();
  await classique.appeler(BASE);
  const sans = (classique.queries.find((q) => q.table === "products")!.steps[0][1] as Record<string, unknown>[])[0];
  assert.ok(!("zabelie_authoring_project_id" in sans));

  // L'index unique refuse la seconde fiche du même projet : la réponse le dit, pour que la soumission la retrouve.
  const doublon = { code: "23505", message: "duplicate key value violates unique constraint" };
  let r = await refus(await brouillon({ insertErreur: doublon }).appeler(BASE, PROJET));
  assert.deepEqual(r, { status: 409, corps: { error: "authoring.soumission.dejaSoumis", code: "authoring_deja_soumis" } });
  // Hors soumission, la même erreur garde l'ancienne réponse.
  r = await refus(await brouillon({ insertErreur: doublon }).appeler(BASE));
  assert.deepEqual(r, { status: 500, corps: { error: doublon.message } });
});

test("E5 — la confirmation d'un livrable rend les mêmes réponses", async () => {
  const nom = "liv-00000000-0000-4000-8000-000000000001.pdf";
  const hors = livrable({ name: nom, metadata: { size: 10 } });
  let r = await hors.appeler(`${MOI}/autre/liv-00000000-0000-4000-8000-000000000001.pdf`);
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "Chemin invalide" });

  r = await livrable(null).appeler();
  assert.equal(r.status, 404);

  for (const taille of [0, 50 * 1024 * 1024 + 1]) {
    const l = livrable({ name: nom, metadata: { size: taille } });
    r = await l.appeler();
    assert.equal(r.status, 422, `taille ${taille}`);
    assert.deepEqual(v(l.supprimes), [[l.chemin]], "un objet hors contrat est retiré du stockage");
    assert.ok(!l.queries.some((q) => q.steps.some(([m]) => m === "insert")), "et ne laisse aucune ligne");
  }

  const deja = livrable({ name: nom, metadata: { size: 2048 } }, true);
  r = await deja.appeler();
  assert.deepEqual(await r.json(), { ok: true, file_name: "gid.pdf" });
  assert.ok(!deja.queries.some((q) => q.steps.some(([m]) => m === "insert")), "pas de ligne en double");

  const neuf = livrable({ name: nom, metadata: { size: 2048 } });
  r = await neuf.appeler();
  assert.deepEqual(await r.json(), { ok: true, file_name: "gid.pdf" });
  const insertion = neuf.queries.find((q) => q.steps.some(([m]) => m === "insert"))!;
  assert.deepEqual(v(insertion.steps[0]), ["insert", [{ product_id: PRODUIT, storage_path: neuf.chemin, file_name: "gid.pdf", size_bytes: 2048 }]],
    "la taille est celle de l'objet réellement écrit");

  r = await livrable({ name: nom, metadata: { size: 2048 } }, false, { code: "23505" }).appeler();
  assert.deepEqual(await r.json(), { ok: true, file_name: "gid.pdf" }, "une confirmation concurrente reste un succès");
  const ambigu = livrable({ name: nom, metadata: { size: 2048 } }, false, { code: "XX000" });
  r = await ambigu.appeler();
  assert.equal(r.status, 409);
  assert.deepEqual(v(ambigu.supprimes), [], "un échec ambigu conserve l'objet");
});
