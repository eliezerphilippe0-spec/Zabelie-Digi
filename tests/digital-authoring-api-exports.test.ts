import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as api from "../lib/digital-authoring/api";
import * as revision from "../lib/digital-authoring/revision";
import * as quality from "../lib/digital-authoring/quality";
import * as exportMod from "../lib/digital-authoring/export";
import * as guidePdf from "../lib/digital-authoring/pdf/guide-pdf";
import * as digitalStudio from "../lib/digital-studio";
import * as buckets from "../lib/storage-buckets";

/**
 * Studio de création éditoriale — export PDF et approbation de l'export exact
 * (tâche 4.3). Session, base, stockage et limiteur sont des doublures : on
 * vérifie ce qui part au stockage (les octets RÉELS du moteur, au chemin
 * adressé par le contenu), ce qui part à la base (empreinte et taille
 * calculées par le serveur), et que rien ne part quand une garde refuse.
 */

const MOI = "00000000-0000-4000-8000-0000000000a1";
const PROJET = "00000000-0000-4000-8000-0000000000b1";
const EXPORT = "00000000-0000-4000-8000-0000000000e1";
const HASH = "a".repeat(64);
const PROJET_PRET = {
  id: PROJET,
  titre: "Gid vann manje",
  langue: "ht",
  contenu: {
    objectif: "Vann plis",
    sections: [
      { id: "00000000-0000-4000-8000-0000000000d1", titre: "Kòmanse", resultat: "Konnen kote pou kòmanse", corps: "Premye etap la se konnen kliyan ou." },
      { id: "00000000-0000-4000-8000-0000000000d2", titre: "Kontinye", resultat: "Kenbe kliyan yo", corps: "Dezyèm etap la se rete an kontak." },
    ],
  },
  revision: 5,
  plan_approuve_revision: 2,
  revision_approuvee: 5,
  archived_at: null,
};

type Opts = {
  active?: boolean;
  user?: boolean;
  projet?: Record<string, unknown> | null;
  nom?: string;
  limite?: boolean;
  depotErreur?: boolean;
  enregistrerErreur?: { code?: string; message?: string };
  cheminDivergent?: boolean;
  exportLigne?: Record<string, unknown> | null;
  rpcErreur?: { code?: string; message?: string };
};

function fixture(o: Opts = {}) {
  const depots: Array<{ bucket: string; chemin: string; octets: Uint8Array; options: Record<string, unknown> }> = [];
  const signatures: Array<{ bucket: string; chemin: string; secondes: number; options: unknown }> = [];
  const rpcsAdmin: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const rpcsSession: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const limites: string[] = [];
  const db = database((q: Query) => {
    if (q.table === api.TABLE_PROJETS) return { data: o.projet === undefined ? PROJET_PRET : o.projet, error: null };
    if (q.table === "profiles") return { data: { display_name: o.nom ?? "Vandè Tès" }, error: null };
    if (q.table === exportMod.TABLE_EXPORTS) {
      return { data: o.exportLigne === undefined ? { chemin: `${MOI}/${PROJET}/${HASH}.pdf`, extrait_chemin: `${MOI}/${PROJET}/${"b".repeat(64)}-extrait.pdf` } : o.exportLigne, error: null };
    }
    throw new Error(`table inattendue ${q.table}`);
  });
  const admin = {
    storage: {
      from: (bucket: string) => ({
        upload: async (chemin: string, octets: Uint8Array, options: Record<string, unknown>) => {
          depots.push({ bucket, chemin, octets, options });
          return o.depotErreur ? { data: null, error: { message: "refus" } } : { data: { path: chemin }, error: null };
        },
        createSignedUrl: async (chemin: string, secondes: number, options: unknown) => {
          signatures.push({ bucket, chemin, secondes, options });
          return { data: { signedUrl: `https://stockage.test/${chemin}?token=t` }, error: null };
        },
      }),
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcsAdmin.push({ fn, args });
      const ligne = {
        id: EXPORT, project_id: PROJET, seller_id: MOI, revision: args.p_revision, moteur: args.p_moteur,
        chemin: o.cheminDivergent ? "ailleurs.pdf" : `${MOI}/${PROJET}/${args.p_empreinte}.pdf`,
        extrait_chemin: `${MOI}/${PROJET}/${args.p_extrait_empreinte}-extrait.pdf`,
        empreinte: args.p_empreinte, taille: args.p_taille, pages: args.p_pages,
        extrait_empreinte: args.p_extrait_empreinte, extrait_taille: args.p_extrait_taille, extrait_pages: args.p_extrait_pages,
        created_at: "2026-10-16T12:00:00Z", approuve_le: null,
      };
      return { single: async () => (o.enregistrerErreur ? { data: null, error: o.enregistrerErreur } : { data: ligne, error: null }) };
    },
  };
  const session = {
    auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: MOI } } }) },
    from: db.from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcsSession.push({ fn, args });
      return o.rpcErreur ? { data: null, error: o.rpcErreur } : { data: "2026-10-16T12:05:00Z", error: null };
    },
  };
  const deps = {
    "next/server": {
      NextResponse: {
        json: Response.json,
        redirect: (url: string, status: number) => new Response(null, { status, headers: { location: url } }),
      },
    },
    "@/lib/supabase/server": { createClient: async () => session },
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
    "@/lib/digital-authoring/flags": { creationActive: () => o.active !== false, lireEnvCreation: () => ({}) },
    "@/lib/digital-authoring/revision": revision,
    "@/lib/digital-authoring/quality": quality,
    "@/lib/digital-authoring/api": api,
    "@/lib/digital-authoring/export": exportMod,
    "@/lib/digital-authoring/pdf/guide-pdf": guidePdf,
  };
  const creation = loadRoute("app/api/digital-authoring/projects/[id]/exports/route.ts", deps);
  const detail = loadRoute("app/api/digital-authoring/exports/[id]/route.ts", deps);
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
  return {
    db, depots, signatures, rpcsAdmin, rpcsSession, limites,
    creer: (corps: unknown, id = PROJET) =>
      creation.POST(new Request("https://z.test/x", { method: "POST", body: JSON.stringify(corps) }), ctx(id)),
    ouvrir: (requete = "document=guide", id = EXPORT) => detail.GET(new Request(`https://z.test/x?${requete}`), ctx(id)),
    approuver: (corps: unknown, id = EXPORT) =>
      detail.POST(new Request("https://z.test/x", { method: "POST", body: JSON.stringify(corps) }), ctx(id)),
  };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));
const simple = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/** Les octets que le moteur rend pour ce projet : ce que la route doit déposer. */
function attendu(nom = "Vandè Tès") {
  const projet = api.projetPourEditeur(PROJET_PRET)!;
  const g = exportMod.guidePourPdf(projet, nom);
  const pdf = guidePdf.rendreGuidePdf(g);
  const extrait = guidePdf.rendreExtraitPdf(g);
  assert.ok(pdf.ok && extrait.ok);
  return { pdf, extrait };
}

test("création : les octets réels du moteur, au chemin adressé par le contenu, puis la ligne", async () => {
  const f = fixture();
  const r = await f.creer({ revision: 5 });
  assert.equal(r.status, 201);
  const { pdf, extrait } = attendu();
  if (!pdf.ok || !extrait.ok) throw new Error("rendu");
  assert.deepEqual(f.depots.map((d) => [d.bucket, d.chemin]), [
    [buckets.AUTHORING_BUCKET, `${MOI}/${PROJET}/${pdf.empreinte}.pdf`],
    [buckets.AUTHORING_BUCKET, `${MOI}/${PROJET}/${extrait.empreinte}-extrait.pdf`],
  ]);
  assert.deepEqual(Buffer.from(f.depots[0].octets), Buffer.from(pdf.octets), "le fichier déposé est celui du moteur");
  assert.equal(f.depots[0].options.contentType, "application/pdf");
  assert.deepEqual(simple(f.rpcsAdmin), [{
    fn: "zabelie_authoring_enregistrer_export",
    args: {
      p_seller: MOI, p_projet: PROJET, p_revision: 5, p_moteur: exportMod.MOTEUR_PDF,
      p_empreinte: pdf.empreinte, p_taille: pdf.octets.length, p_pages: pdf.pages,
      p_extrait_empreinte: extrait.empreinte, p_extrait_taille: extrait.octets.length, p_extrait_pages: extrait.pages,
    },
  }]);
  const d = await json(r);
  assert.equal(d.export.empreinte, pdf.empreinte);
  assert.equal(d.export.taille, pdf.octets.length);
  assert.ok(!JSON.stringify(d).includes(MOI + "/"), "le chemin de stockage ne sort jamais vers le navigateur");
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(f.limites, [`authoring:export:${MOI}`]);
});

test("création : deux rendus de la même révision, mêmes octets, mêmes chemins", async () => {
  const a = fixture();
  const b = fixture();
  await a.creer({ revision: 5 });
  await b.creer({ revision: 5 });
  assert.deepEqual(a.depots.map((d) => d.chemin), b.depots.map((d) => d.chemin));
  assert.deepEqual(simple(a.rpcsAdmin), simple(b.rpcsAdmin));
});

test("création : rien n'est rendu, déposé ni enregistré quand une garde refuse", async () => {
  const cas: Array<[string, Opts, unknown, number, string]> = [
    ["drapeau éteint", { active: false }, { revision: 5 }, 404, ""],
    ["anonyme", { user: false }, { revision: 5 }, 401, ""],
    ["révision mal typée", {}, { revision: "5" }, 400, ""],
    ["débit", { limite: true }, { revision: 5 }, 429, ""],
    ["introuvable", { projet: null }, { revision: 5 }, 404, ""],
    ["archivé", { projet: { ...PROJET_PRET, archived_at: "2026-10-16T00:00:00Z" } }, { revision: 5 }, 409, "archive"],
    ["texte modifié depuis", { projet: { ...PROJET_PRET, revision: 6 } }, { revision: 5 }, 409, "conflit"],
    ["guide non approuvé", { projet: { ...PROJET_PRET, revision_approuvee: null } }, { revision: 5 }, 409, "authoring_guide_non_approuve"],
    ["approbation ancienne", { projet: { ...PROJET_PRET, revision: 6, revision_approuvee: 5 } }, { revision: 6 }, 409, "authoring_guide_non_approuve"],
    ["bloquant écrit hors de l'écran", { projet: { ...PROJET_PRET, contenu: { ...PROJET_PRET.contenu, sections: [{ ...PROJET_PRET.contenu.sections[0], corps: "TODO" }] } } }, { revision: 5 }, 422, "guide_pas_pret"],
  ];
  for (const [nom, opts, corps, statut, code] of cas) {
    const f = fixture(opts);
    const r = await f.creer(corps);
    assert.equal(r.status, statut, nom);
    if (code) assert.equal((await json(r)).code, code, nom);
    assert.equal(f.depots.length + f.rpcsAdmin.length, 0, `${nom} : rien ne doit partir`);
  }
  const f = fixture();
  assert.equal((await f.creer({ revision: 5 }, "pas-un-id")).status, 404);
  assert.equal(f.db.queries.length + f.depots.length, 0);
});

test("création : un dépôt refusé n'enregistre rien ; un chemin divergent ne répond pas « prêt »", async () => {
  const depot = fixture({ depotErreur: true });
  assert.equal((await depot.creer({ revision: 5 })).status, 502);
  assert.equal(depot.rpcsAdmin.length, 0);
  const divergent = fixture({ cheminDivergent: true });
  assert.equal((await divergent.creer({ revision: 5 })).status, 500);
  const perimee = fixture({ enregistrerErreur: { code: "40001", message: "authoring_revision_perimee" } });
  const r = await perimee.creer({ revision: 5 });
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, "authoring.conflit");
  const brut = fixture({ enregistrerErreur: { code: "23505", message: "duplicate key value violates unique constraint zabelie_authoring_exports_unique" } });
  const r2 = await brut.creer({ revision: 5 });
  assert.ok(!JSON.stringify(await json(r2)).includes("zabelie_authoring_exports_unique"), "jamais de message brut");
});

test("création : un nom de vendeur avec un émoji ne bloque pas l'export", async () => {
  const f = fixture({ nom: "Marie " + String.fromCodePoint(0x1f33a) + " Joseph" });
  assert.equal((await f.creer({ revision: 5 })).status, 201);
  assert.equal(exportMod.auteurPourPdf("Marie " + String.fromCodePoint(0x1f33a) + " Joseph"), "Marie Joseph");
});

test("lien : URL signée de cinq minutes, aperçu ou téléchargement, jamais en cache", async () => {
  const f = fixture();
  const r = await f.ouvrir("document=guide");
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), `https://stockage.test/${MOI}/${PROJET}/${HASH}.pdf?token=t`);
  assert.equal(r.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(simple(f.signatures), [{ bucket: buckets.AUTHORING_BUCKET, chemin: `${MOI}/${PROJET}/${HASH}.pdf`, secondes: 300 }]);
  const t = fixture();
  await t.ouvrir("document=extrait&telecharger=1");
  assert.deepEqual(simple(t.signatures[0].options), { download: "extrait.pdf" });
  assert.ok(t.signatures[0].chemin.endsWith("-extrait.pdf"));
});

test("lien : l'export d'un autre (invisible sous la RLS) est introuvable, rien n'est signé", async () => {
  const autre = fixture({ exportLigne: null });
  assert.equal((await autre.ouvrir()).status, 404);
  assert.equal(autre.signatures.length, 0);
  const mauvais = fixture();
  assert.equal((await mauvais.ouvrir("document=brief")).status, 400);
  assert.equal((await mauvais.ouvrir("document=guide", "pas-un-id")).status, 404);
  assert.equal(mauvais.signatures.length, 0);
});

test("approbation : l'empreinte montrée part à la base ; refus traduits", async () => {
  const f = fixture();
  const r = await f.approuver({ empreinte: HASH });
  assert.equal(r.status, 200);
  assert.equal((await json(r)).approuveLe, "2026-10-16T12:05:00Z");
  assert.deepEqual(simple(f.rpcsSession), [{ fn: "zabelie_authoring_approuver_export", args: { p_export: EXPORT, p_empreinte: HASH } }]);
  for (const empreinte of [undefined, "", "A".repeat(64), "a".repeat(63)]) {
    const g = fixture();
    assert.equal((await g.approuver({ empreinte })).status, 400, String(empreinte));
    assert.equal(g.rpcsSession.length, 0);
  }
  for (const [message, statut, cle] of [
    ["authoring_empreinte_differente", 409, "authoring.export.empreinte"],
    ["authoring_export_perime", 409, "authoring.export.perime"],
    ["authoring_export_introuvable", 404, "authoring.export.introuvable"],
  ] as const) {
    const g = fixture({ rpcErreur: { code: "P0001", message } });
    const x = await g.approuver({ empreinte: HASH });
    assert.equal(x.status, statut, message);
    assert.equal((await json(x)).error, cle, message);
  }
});

test("la clé de service ne sert qu'au limiteur, au stockage et à l'enregistrement (C1-A)", () => {
  const creation = readFileSync("app/api/digital-authoring/projects/[id]/exports/route.ts", "utf8");
  const usages = [...creation.matchAll(/\badmin\b[\s\n]*\.?([a-zA-Z]+)?/g)].map((m) => m[0].replace(/\s+/g, ""));
  assert.ok(usages.length > 0);
  assert.deepEqual([...new Set(usages)].sort(), ["admin", "admin.rpc", "admin.storage"].sort(), JSON.stringify(usages));
  assert.equal((creation.match(/admin\s*\.rpc\(/g) ?? []).length, 1);
  assert.ok(/admin\s*\.rpc\("zabelie_authoring_enregistrer_export"/.test(creation));
  const detail = readFileSync("app/api/digital-authoring/exports/[id]/route.ts", "utf8");
  assert.equal((detail.match(/createAdminClient\(\)/g) ?? []).length, 1);
  assert.ok(/createAdminClient\(\)\s*\.storage\.from\(AUTHORING_BUCKET\)\s*\.createSignedUrl/.test(detail), "seule la signature d'URL");
  assert.ok(!/admin\.from\(/.test(creation + detail), "aucune lecture de table par la clé de service");
});
