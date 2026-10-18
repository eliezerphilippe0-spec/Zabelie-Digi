import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as api from "../lib/digital-authoring/api";
import * as exportMod from "../lib/digital-authoring/export";
import * as soumission from "../lib/digital-authoring/soumission";
import * as digitalStudio from "../lib/digital-studio";
import * as buckets from "../lib/storage-buckets";
import * as productKind from "../lib/product-kind";

/**
 * Studio de création éditoriale — « Soumettre à la revue » (tâche 5.2).
 *
 * Session, base, stockage et création de brouillon sont des doublures ; la
 * confirmation du livrable est la VRAIE (`lib/product-asset-confirm.ts`) :
 * c'est elle qui doit accepter le chemin déterministe du Studio. On vérifie
 * ce qui part vers la fiche (mêmes règles que `/vendre`, lien vers le
 * projet), ce qui part au stockage (les octets approuvés, et eux seuls), et
 * que rien ne part quand une garde refuse.
 */

const v = (x: unknown) => JSON.parse(JSON.stringify(x));

const MOI = "00000000-0000-4000-8000-0000000000a1";
const PROJET = "00000000-0000-4000-8000-0000000000b1";
const EXPORT = "00000000-0000-4000-8000-0000000000e1";
const PRODUIT = "00000000-0000-4000-8000-0000000000c1";
const OCTETS = new TextEncoder().encode("%PDF-1.4 gid vann manje");
const HASH = createHash("sha256").update(OCTETS).digest("hex");
const ANCIEN = "c".repeat(64);
const CHEMIN_EXPORT = `${MOI}/${PROJET}/${HASH}.pdf`;
const CHEMIN_LIVRABLE = soumission.cheminLivrable(MOI, PRODUIT, HASH);

const PROJET_PRET = {
  id: PROJET,
  titre: "Gid vann manje lakay",
  langue: "ht",
  brief: { resultat: "Fè yon lis pri pou chak pla", prerequis: "Yon telefòn" },
  contenu: {
    objectif: "Vann plis chak semèn",
    sections: [
      { id: "00000000-0000-4000-8000-0000000000d1", titre: "Kòmanse", resultat: "", corps: "Premye etap la se konnen kliyan ou." },
      { id: "00000000-0000-4000-8000-0000000000d2", titre: "Kenbe kliyan", resultat: "", corps: "" },
    ],
  },
  revision: 5,
  plan_approuve_revision: 2,
  revision_approuvee: 5,
  archived_at: null,
};
const EXPORT_APPROUVE = {
  id: EXPORT, project_id: PROJET, revision: 5, empreinte: HASH, chemin: CHEMIN_EXPORT, pages: 34,
  approuve_le: "2026-10-18T10:00:00Z", approuve_empreinte: HASH,
};
const CORPS = { export: EXPORT, prix: 750, rayon: "edikasyon", sousRayon: null, attestation: true };

type Fiche = { id: string; slug: string; status: string };
type Opts = {
  active?: boolean;
  user?: boolean;
  limite?: boolean;
  projet?: Record<string, unknown> | null;
  exportLigne?: Record<string, unknown> | null;
  /** Fiches lues successivement par le lien (la première avant la création). */
  fiches?: (Fiche | null)[];
  ficheErreur?: { code?: string };
  creation?: Fiche | Response;
  livrables?: { id: string; storage_path: string }[];
  exportsProjet?: string[];
  octets?: Uint8Array;
  depotErreur?: boolean;
  /** Le stockage ne liste pas l'objet déposé : la confirmation partagée refuse. */
  listeVide?: boolean;
};

function fixture(o: Opts = {}) {
  const creations: Record<string, unknown>[] = [];
  const telechargements: { bucket: string; chemin: string }[] = [];
  const depots: { bucket: string; chemin: string; octets: Uint8Array; options: Record<string, unknown> }[] = [];
  const limites: string[] = [];
  const fiches = [...(o.fiches ?? [null])];
  let lecturesFiche = 0;

  const session = database((q: Query) => {
    if (q.table === api.TABLE_PROJETS) return { data: o.projet === undefined ? PROJET_PRET : o.projet, error: null };
    if (q.table === exportMod.TABLE_EXPORTS && q.steps.some(([m]) => m === "maybeSingle")) {
      return { data: o.exportLigne === undefined ? EXPORT_APPROUVE : o.exportLigne, error: null };
    }
    if (q.table === exportMod.TABLE_EXPORTS) return { data: (o.exportsProjet ?? [HASH]).map((empreinte) => ({ empreinte })), error: null };
    if (q.table === "products") {
      if (o.ficheErreur) return { data: null, error: o.ficheErreur };
      const f = fiches[Math.min(lecturesFiche, fiches.length - 1)];
      lecturesFiche += 1;
      return { data: f, error: null };
    }
    throw new Error(`table inattendue (session) ${q.table}`);
  });
  const lignesLivrables = o.livrables ?? [];
  const base = database((q: Query) => {
    if (q.table === "zabelie_digital_details" || q.table === "zabelie_digital_studio") return { error: null };
    if (q.table !== "product_assets") throw new Error(`table inattendue (admin) ${q.table}`);
    const methodes = q.steps.map(([m]) => m);
    if (methodes.includes("maybeSingle")) {
      const chemin = q.steps.find(([m, a]) => m === "eq" && a[0] === "storage_path")?.[1][1];
      return { data: lignesLivrables.find((l) => l.storage_path === chemin) ?? null };
    }
    if (methodes.includes("insert") || methodes.includes("delete")) return { error: null };
    return { data: lignesLivrables, error: null };
  });
  const admin = {
    from: base.from,
    storage: {
      from: (bucket: string) => ({
        download: async (chemin: string) => {
          telechargements.push({ bucket, chemin });
          return { data: new Blob([new Uint8Array(o.octets ?? OCTETS)]), error: null };
        },
        upload: async (chemin: string, octets: Uint8Array, options: Record<string, unknown>) => {
          depots.push({ bucket, chemin, octets, options });
          return o.depotErreur ? { data: null, error: { message: "refus" } } : { data: { path: chemin }, error: null };
        },
        list: async (_dossier: string, { search }: { search: string }) => ({
          data: o.listeVide ? [] : [{ name: search, metadata: { size: (o.octets ?? OCTETS).length } }],
          error: null,
        }),
        remove: async () => ({ error: null }),
      }),
    },
  };
  const confirmation = loadRoute("lib/product-asset-confirm.ts", { "@/lib/storage-buckets": buckets });
  const deps = {
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: MOI, email: "vande@example.ht" } } }) },
        from: session.from,
      }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/zabelie-rate-limit": {
      rateLimit: async (_a: unknown, cle: string) => {
        limites.push(cle);
        return o.limite !== true;
      },
    },
    "@/lib/api-erreur": {
      erreurAvecLangue: (_l: string, cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }),
    },
    "@/lib/digital-studio": digitalStudio,
    "@/lib/storage-buckets": buckets,
    "@/lib/product-kind": productKind,
    "@/lib/product-draft": {
      creerBrouillonProduit: async (args: Record<string, unknown>) => {
        creations.push(args);
        return o.creation ?? { id: PRODUIT, slug: "gid-vann-manje-lakay-ab1cd", status: "draft" };
      },
    },
    "@/lib/product-asset-confirm": confirmation,
    "@/lib/digital-authoring/flags": { creationActive: () => o.active !== false, lireEnvCreation: () => ({}) },
    "@/lib/digital-authoring/api": api,
    "@/lib/digital-authoring/export": exportMod,
    "@/lib/digital-authoring/soumission": soumission,
  };
  const route = loadRoute("app/api/digital-authoring/projects/[id]/soumission/route.ts", deps);
  const soumettre = (corps: unknown = CORPS, id = PROJET) =>
    route.POST(new Request("https://z.test/x", { method: "POST", body: JSON.stringify(corps) }), { params: Promise.resolve({ id }) });
  return { soumettre, creations, telechargements, depots, limites, base, session, lectures: () => lecturesFiche };
}

const ecritures = (f: ReturnType<typeof fixture>) =>
  f.base.queries.filter((q) => q.table === "product_assets" && q.steps.some(([m]) => m === "insert" || m === "delete"));
const preremplissages = (f: ReturnType<typeof fixture>) =>
  f.base.queries.filter((q) => q.table === "zabelie_digital_details" || q.table === "zabelie_digital_studio");

test("S1 — gardes d'entrée : rien n'est lu ni écrit avant elles", async () => {
  const cas: [string, Opts, unknown, string, number, string][] = [
    ["drapeau éteint", { active: false }, CORPS, PROJET, 404, "api.feature.off"],
    ["identifiant invalide", {}, CORPS, "pas-un-uuid", 404, "authoring.introuvable"],
    ["sans session", { user: false }, CORPS, PROJET, 401, "api.auth.required"],
    ["export manquant", {}, { ...CORPS, export: "x" }, PROJET, 400, "api.params.invalid"],
    ["prix non numérique", {}, { ...CORPS, prix: "750" }, PROJET, 400, "api.params.invalid"],
    ["rayon vide", {}, { ...CORPS, rayon: " " }, PROJET, 400, "api.params.invalid"],
    ["cadence dépassée", { limite: true }, CORPS, PROJET, 429, "api.rate.limited"],
  ];
  for (const [nom, o, corps, id, statut, cle] of cas) {
    const f = fixture(o);
    const r = await f.soumettre(corps, id);
    assert.equal(r.status, statut, nom);
    assert.equal((await r.json()).error, cle, nom);
    assert.equal(f.creations.length, 0, `${nom} : aucune fiche`);
    assert.equal(f.depots.length + f.telechargements.length, 0, `${nom} : aucun octet`);
  }
  const f = fixture();
  await f.soumettre();
  assert.deepEqual(f.limites, [`authoring:soumission:${MOI}`]);
  // Sans fiche, le prix et le rayon sont exigés : rien n'est créé sans eux.
  const sansPrix = fixture();
  const r = await sansPrix.soumettre({ export: EXPORT, attestation: true });
  assert.equal(r.status, 400);
  assert.equal(sansPrix.creations.length + sansPrix.depots.length, 0);
});

test("S2 — projet et export relus sous le JWT : ceux d'un autre restent introuvables (T03)", async () => {
  const cas: [string, Opts, number, string][] = [
    ["projet d'un autre (RLS)", { projet: null }, 404, "authoring.introuvable"],
    ["projet archivé", { projet: { ...PROJET_PRET, archived_at: "2026-10-01T00:00:00Z" } }, 409, "authoring.archive"],
    ["export d'un autre ou absent", { exportLigne: null }, 404, "authoring.export.introuvable"],
    ["export d'un autre projet", { exportLigne: { ...EXPORT_APPROUVE, project_id: "00000000-0000-4000-8000-0000000000b2" } }, 404, "authoring.export.introuvable"],
    ["export d'une ancienne révision", { exportLigne: { ...EXPORT_APPROUVE, revision: 4 } }, 409, "authoring.export.perime"],
    ["guide modifié depuis l'approbation", { projet: { ...PROJET_PRET, revision: 6 } }, 409, "authoring.export.perime"],
    ["approbation du guide retirée", { projet: { ...PROJET_PRET, revision_approuvee: 4 } }, 409, "authoring.export.perime"],
    ["autre empreinte approuvée", { exportLigne: { ...EXPORT_APPROUVE, approuve_empreinte: ANCIEN } }, 409, "authoring.soumission.nonApprouve"],
    ["PDF non approuvé", { exportLigne: { ...EXPORT_APPROUVE, approuve_le: null, approuve_empreinte: null } }, 409, "authoring.soumission.nonApprouve"],
  ];
  for (const [nom, o, statut, cle] of cas) {
    const f = fixture(o);
    const r = await f.soumettre();
    assert.equal(r.status, statut, nom);
    assert.equal((await r.json()).error, cle, nom);
    assert.equal(f.creations.length, 0, `${nom} : aucune fiche`);
    assert.equal(f.depots.length, 0, `${nom} : aucun dépôt`);
  }
  // La requête d'export est bornée au projet de l'URL, en plus de la RLS.
  const f = fixture();
  await f.soumettre();
  const lecture = f.session.queries.find((q) => q.table === exportMod.TABLE_EXPORTS && q.steps.some(([m]) => m === "maybeSingle"))!;
  assert.deepEqual(v(lecture.steps.filter(([m]) => m === "eq")), [["eq", ["id", EXPORT]], ["eq", ["project_id", PROJET]]]);
});

test("S3 — première soumission : fiche par la fonction partagée, PDF approuvé recopié et confirmé", async () => {
  const f = fixture();
  const r = await f.soumettre({ ...CORPS, sousRayon: "00000000-0000-4000-8000-0000000000f1" });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(await r.json(), { fiche: { slug: "gid-vann-manje-lakay-ab1cd", statut: "draft" }, depose: true });

  // La fiche : mêmes règles que /vendre, type fichier, lien vers CE projet.
  assert.equal(f.creations.length, 1);
  const { body, lienProjet, user } = f.creations[0] as { body: Record<string, unknown>; lienProjet: string; user: { id: string } };
  assert.equal(lienProjet, PROJET);
  assert.equal(user.id, MOI);
  assert.deepEqual(v(body), {
    title: "Gid vann manje lakay",
    description: "Vann plis chak semèn\n\n• Kòmanse\n• Kenbe kliyan",
    kind: productKind.KIND_FILE,
    category: "edikasyon",
    categoryId: "00000000-0000-4000-8000-0000000000f1",
    priceHTG: 750,
    policyAccepted: true,
  });

  // Les octets : lus au bucket privé du Studio, déposés sous la fiche, au chemin déterministe.
  assert.deepEqual(f.telechargements, [{ bucket: buckets.AUTHORING_BUCKET, chemin: CHEMIN_EXPORT }]);
  assert.equal(f.depots.length, 1);
  assert.equal(f.depots[0].bucket, buckets.DIGITAL_BUCKET);
  assert.equal(f.depots[0].chemin, CHEMIN_LIVRABLE);
  assert.ok(Buffer.from(f.depots[0].octets).equals(Buffer.from(OCTETS)));
  assert.deepEqual(v(f.depots[0].options), { contentType: "application/pdf", upsert: true });

  // La VRAIE confirmation a accepté le chemin et inscrit la taille lue au stockage.
  const insertion = ecritures(f).find((q) => q.steps[0][0] === "insert")!;
  assert.deepEqual(v(insertion.steps[0]), ["insert", [{ product_id: PRODUIT, storage_path: CHEMIN_LIVRABLE, file_name: "Gid_vann_manje_lakay.pdf", size_bytes: OCTETS.length }]]);
  assert.ok(!ecritures(f).some((q) => q.steps[0][0] === "delete"), "rien à remplacer");

  // 5.3 : l'atelier numérique pré-rempli, insertion seulement si la ligne manque.
  const [details, atelier] = ["zabelie_digital_details", "zabelie_digital_studio"].map((t) => preremplissages(f).find((q) => q.table === t)!);
  assert.deepEqual(v(details.steps), [["upsert", [{
    product_id: PRODUIT, formats: "PDF", language: "Kreyòl ayisyen", compatibility: "", license: "",
    contents: "34 paj\n• Kòmanse\n• Kenbe kliyan", updates: "",
  }, { onConflict: "product_id", ignoreDuplicates: true }]]]);
  assert.deepEqual(v(atelier.steps), [["upsert", [{
    product_id: PRODUIT, mode: "file", preview: "Kòmanse\n\nPremye etap la se konnen kliyan ou.",
    outcomes: "Fè yon lis pri pou chak pla", prerequisites: "Yon telefòn", include_updates: false, lessons: [], faq: [],
  }, { onConflict: "product_id", ignoreDuplicates: true }]]]);
});

test("S4 — deux soumissions simultanées : la perdante reprend la fiche de la gagnante (T19)", async () => {
  const deja = Response.json({ error: "authoring.soumission.dejaSoumis", code: "authoring_deja_soumis" }, { status: 409 });
  const gagnante = { id: PRODUIT, slug: "gid-vann-manje-lakay-zz9yy", status: "draft" };
  const f = fixture({ fiches: [null, gagnante], creation: deja });
  const r = await f.soumettre();
  assert.equal(r.status, 200, "pas une création : la fiche existait");
  assert.deepEqual(await r.json(), { fiche: { slug: gagnante.slug, statut: "draft" }, depose: true });
  assert.equal(f.creations.length, 1, "une seule tentative d'insertion");
  assert.equal(f.lectures(), 2, "la fiche est relue après le refus d'unicité");
  assert.equal(f.depots[0].chemin, CHEMIN_LIVRABLE, "même chemin que la gagnante : même objet, même ligne");

  // Un autre refus de la création partagée sort tel quel, sans relecture ni dépôt.
  const refus = fixture({ creation: Response.json({ error: "api.policy.required", code: "policy_required" }, { status: 400 }) });
  const r2 = await refus.soumettre({ ...CORPS, attestation: false });
  assert.equal(r2.status, 400);
  assert.deepEqual(await r2.json(), { error: "api.policy.required", code: "policy_required" });
  assert.equal(r2.headers.get("cache-control"), "private, no-store");
  assert.equal(refus.lectures(), 1);
  assert.equal(refus.depots.length, 0);
  assert.equal((refus.creations[0] as { body: { policyAccepted: boolean } }).body.policyAccepted, false, "l'attestation n'est jamais forcée");

  // Unicité annoncée mais fiche introuvable à la relecture : échec franc, pas de seconde fiche.
  const perdue = fixture({ fiches: [null, null], creation: deja });
  const r3 = await perdue.soumettre();
  assert.equal(r3.status, 500);
  assert.equal(perdue.depots.length, 0);
});

test("S5 — reprise après panne : la fiche existe déjà, rien n'est créé deux fois (T20)", async () => {
  const brouillon = { id: PRODUIT, slug: "gid-vann-manje-lakay-ab1cd", status: "draft" };
  // Panne après la création, avant le dépôt : la reprise dépose sans recréer.
  // Le prix et le rayon ne sont plus demandés : la fiche existe.
  const avant = fixture({ fiches: [brouillon] });
  let r = await avant.soumettre({ export: EXPORT });
  assert.equal(r.status, 200);
  assert.equal(avant.creations.length, 0);
  assert.equal(avant.depots.length, 1);

  // Panne après le dépôt et la ligne : ni nouvelle lecture des octets, ni nouvelle ligne.
  const apres = fixture({ fiches: [brouillon], livrables: [{ id: "l1", storage_path: CHEMIN_LIVRABLE }] });
  r = await apres.soumettre();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { fiche: { slug: brouillon.slug, statut: "draft" }, depose: true });
  assert.equal(apres.telechargements.length + apres.depots.length, 0);
  assert.equal(ecritures(apres).length, 0);
});

test("S6 — seuls les octets approuvés partent en vente (T28)", async () => {
  const f = fixture({ octets: new TextEncoder().encode("%PDF-1.4 un autre fichier") });
  const r = await f.soumettre();
  assert.equal(r.status, 409);
  const corps = await r.json();
  assert.equal(corps.error, "authoring.soumission.octets");
  assert.equal(corps.code, "authoring_octets_differents");
  assert.deepEqual(corps.fiche, { slug: "gid-vann-manje-lakay-ab1cd", statut: "draft" }, "l'écran sait qu'une fiche existe");
  assert.equal(f.depots.length, 0);
  assert.equal(ecritures(f).length, 0);
  assert.equal(preremplissages(f).length, 0, "rien n'est pré-rempli sans livrable confirmé");

  const depot = fixture({ depotErreur: true });
  const r2 = await depot.soumettre();
  assert.equal(r2.status, 502);
  assert.equal(ecritures(depot).length, 0, "aucune ligne pour un objet absent");

  // La confirmation partagée refuse (objet introuvable) : son refus sort, rien n'est retiré de la fiche.
  const ancien = soumission.cheminLivrable(MOI, PRODUIT, ANCIEN);
  const perdu = fixture({
    fiches: [{ id: PRODUIT, slug: "s", status: "draft" }], listeVide: true,
    livrables: [{ id: "l-ancien", storage_path: ancien }], exportsProjet: [ANCIEN, HASH],
  });
  const r3 = await perdu.soumettre();
  assert.equal(r3.status, 404);
  assert.equal(r3.headers.get("cache-control"), "private, no-store");
  assert.equal(ecritures(perdu).length, 0, "l'ancien PDF reste tant que le nouveau n'est pas confirmé");
});

test("S7 — une fiche publiée ou retirée n'est pas touchée d'ici", async () => {
  for (const status of ["published", "archived"]) {
    const f = fixture({ fiches: [{ id: PRODUIT, slug: "gid-vann-manje-lakay-ab1cd", status }] });
    const r = await f.soumettre();
    assert.equal(r.status, 200, status);
    assert.deepEqual(await r.json(), { fiche: { slug: "gid-vann-manje-lakay-ab1cd", statut: status }, depose: false });
    assert.equal(f.creations.length + f.telechargements.length + f.depots.length, 0, status);
    assert.equal(ecritures(f).length, 0, status);
    assert.equal(preremplissages(f).length, 0, `${status} : l'atelier d'une fiche publiée ne se touche pas d'ici`);
  }
});

test("S8 — nouveau PDF du même guide : il remplace l'ancien, les autres fichiers du vendeur restent", async () => {
  const ancien = soumission.cheminLivrable(MOI, PRODUIT, ANCIEN);
  const sien = `${MOI}/${PRODUIT}/liv-00000000-0000-4000-8000-000000000009.zip`;
  const f = fixture({
    fiches: [{ id: PRODUIT, slug: "gid-vann-manje-lakay-ab1cd", status: "draft" }],
    livrables: [{ id: "l-ancien", storage_path: ancien }, { id: "l-sien", storage_path: sien }],
    exportsProjet: [ANCIEN, HASH],
  });
  const r = await f.soumettre();
  assert.equal(r.status, 200);
  const ordre = ecritures(f).map((q) => q.steps[0][0]);
  assert.deepEqual(ordre, ["insert", "delete"], "le nouveau est confirmé AVANT le retrait de l'ancien");
  const retrait = ecritures(f).find((q) => q.steps[0][0] === "delete")!;
  assert.deepEqual(v(retrait.steps.slice(1)), [["eq", ["product_id", PRODUIT]], ["in", ["id", ["l-ancien"]]]]);

  // Plafond de fichiers : compté hors des PDF de ce guide.
  const plein = Array.from({ length: digitalStudio.MAX_DIGITAL_FILES }, (_, i) => ({
    id: `l${i}`, storage_path: `${MOI}/${PRODUIT}/liv-00000000-0000-4000-8000-${String(i).padStart(12, "0")}.zip`,
  }));
  const g = fixture({ fiches: [{ id: PRODUIT, slug: "s", status: "draft" }], livrables: plein });
  const r2 = await g.soumettre();
  assert.equal(r2.status, 422);
  assert.equal((await r2.json()).error, "studio.fileLimit");
  assert.equal(g.depots.length, 0);
  // Un ancien PDF de ce guide ne compte pas : il va être remplacé.
  const h = fixture({
    fiches: [{ id: PRODUIT, slug: "s", status: "draft" }],
    livrables: [...plein.slice(1), { id: "l-ancien", storage_path: ancien }],
    exportsProjet: [ANCIEN, HASH],
  });
  assert.equal((await h.soumettre()).status, 200);
});

test("S9 — schéma sans 0148 : refus franc, aucune fiche sans lien", async () => {
  const f = fixture({ ficheErreur: { code: "42703" } });
  const r = await f.soumettre();
  assert.equal(r.status, 503);
  assert.equal(f.creations.length, 0);
});

test("S10 — chemin déterministe, nom de fichier, entrée", () => {
  const id = soumission.uuidDepuisEmpreinte(HASH);
  assert.equal(id, soumission.uuidDepuisEmpreinte(HASH), "même empreinte, même identifiant");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "UUID version 8, variante RFC");
  assert.notEqual(soumission.uuidDepuisEmpreinte(ANCIEN), id);
  assert.throws(() => soumission.uuidDepuisEmpreinte("abc"));
  // Le motif de la confirmation partagée l'accepte.
  assert.match(CHEMIN_LIVRABLE, new RegExp(`^${MOI}/${PRODUIT}/liv-[0-9a-fA-F-]{36}\\.pdf$`));

  assert.equal(soumission.nomDeFichier("Gid vann manje lakay"), "Gid_vann_manje_lakay.pdf");
  assert.equal(soumission.nomDeFichier("Éducation : l'été à Jacmel !"), "Education_l_ete_a_Jacmel.pdf");
  assert.equal(soumission.nomDeFichier("«»"), "guide.pdf");
  assert.ok(soumission.nomDeFichier("a".repeat(300)).length <= 84);

  assert.deepEqual(soumission.lireEntreeSoumission({ ...CORPS, sousRayon: "" }), { exportId: EXPORT, prix: 750, rayon: "edikasyon", sousRayon: null, attestation: true });
  assert.equal(soumission.lireEntreeSoumission({ ...CORPS, attestation: "oui" })?.attestation, false, "seul `true` atteste");
  assert.deepEqual(soumission.lireEntreeSoumission({ export: EXPORT }), { exportId: EXPORT, prix: null, rayon: null, sousRayon: null, attestation: false });
  for (const mauvais of [null, [], { ...CORPS, prix: Number.NaN }, { ...CORPS, prix: "750" }, { ...CORPS, rayon: 4 }, { ...CORPS, sousRayon: 3 }]) {
    assert.equal(soumission.lireEntreeSoumission(mauvais), null);
  }
});

test("S11 — la route garde l'ordre : JWT d'abord, clé de service ensuite, jamais de publication", () => {
  // Sans les commentaires : la prose a le droit de nommer la modération.
  const src = readFileSync("app/api/digital-authoring/projects/[id]/soumission/route.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  assert.ok(src.indexOf("requireActiveAccount(user.id, { legalAcceptance: true })") < src.indexOf("createAdminClient()"));
  assert.ok(src.indexOf("lireFiche()") < src.indexOf("creerBrouillonProduit("), "la fiche est cherchée avant d'être créée");
  assert.ok(src.indexOf("confirmerLivrable(") < src.indexOf(".delete()"), "l'ancien PDF ne part qu'après la confirmation du nouveau");
  assert.doesNotMatch(src, /status:\s*"published"|zabelie_digital_publish|product-status/, "aucune mise en vente d'ici");
  // La lecture de la fiche rattachée passe par la session (RLS), pas par la clé de service.
  assert.match(src, /supabase\.from\("products"\)\.select\("id, slug, status"\)\.eq\(COLONNE_LIEN, id\)/);
});
