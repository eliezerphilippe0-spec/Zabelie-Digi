import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as schema from "../lib/digital-authoring/schema";
import * as api from "../lib/digital-authoring/api";
import * as revision from "../lib/digital-authoring/revision";
import * as digitalStudio from "../lib/digital-studio";
import * as modeles from "../lib/digital-authoring/modeles";
import * as quality from "../lib/digital-authoring/quality";

/**
 * Studio de création éditoriale — routes des projets (docs/70, tâche 2.2).
 * Session, base et limiteur sont des doublures : on vérifie ce qui part vers
 * la base (jamais une colonne calculée), ce qui revient au navigateur
 * (jamais un message brut de Postgres) et l'ordre des gardes.
 */

const MOI = "00000000-0000-4000-8000-0000000000a1";
const PROJET = "00000000-0000-4000-8000-0000000000b1";
const JETON = "00000000-0000-4000-8000-0000000000c1";
const SECTION = "00000000-0000-4000-8000-0000000000d1";
const BRIEF_COMPLET = { sujet: "Manje", publicDetail: "Machann", probleme: "Kliyan", resultat: "Vant", methode: "Okap", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };
const LIGNE_COMPLETE = { brief: BRIEF_COMPLET, contenu: { objectif: "", sections: [{ id: "00000000-0000-4000-8000-0000000000d1", titre: "Kòmanse", resultat: "", corps: "" }] } };
const CONFIG = { id: true, titre_max: 160, brief_max: 6000, sections_max: 12, section_max: 12000, total_max: 120000, projets_actifs_max: 10 };

type Opts = {
  active?: boolean;
  user?: boolean;
  suspendu?: boolean;
  config?: unknown;
  rpcErreur?: { code?: string; message?: string };
  majLignes?: Array<Record<string, unknown>>;
  actuel?: Record<string, unknown> | null;
  ligne?: Record<string, unknown> | null;
  /** La ligne relue pour l'approbation du guide (tâche 4.2). */
  guide?: Record<string, unknown> | null;
};

const COLONNES_GUIDE = "id, titre, contenu, revision, plan_approuve_revision, archived_at";
/** Un guide approuvable : sections titrées et rédigées, plan approuvé, aucun bloquant. */
const GUIDE_PRET = {
  id: "00000000-0000-4000-8000-0000000000b1",
  titre: "Gid vann manje",
  contenu: { objectif: "Vann plis", sections: [{ id: "00000000-0000-4000-8000-0000000000d1", titre: "Kòmanse", resultat: "Konnen kote pou kòmanse", corps: "Premye etap la se konnen kliyan ou." }] },
  revision: 5,
  plan_approuve_revision: 2,
  archived_at: null,
};

function fixture(o: Opts = {}) {
  const rpcs: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const gardes: Array<{ legal: boolean }> = [];
  let admin = 0;
  const db = database((q: Query) => {
    const maj = q.steps.find(([m]) => m === "update");
    if (q.table === api.TABLE_CONFIG) return { data: o.config === undefined ? CONFIG : o.config, error: null };
    if (q.table === api.TABLE_PROJETS && maj) return { data: o.majLignes ?? [{ revision: 3, derniere_sauvegarde: JETON, updated_at: "t" }], error: null };
    if (q.table === api.TABLE_PROJETS) {
      const colonnes = String(q.steps.find(([m]) => m === "select")?.[1][0] ?? "");
      if (colonnes === "brief, contenu") return { data: o.ligne === undefined ? LIGNE_COMPLETE : o.ligne, error: null };
      if (colonnes === COLONNES_GUIDE) return { data: o.guide === undefined ? GUIDE_PRET : o.guide, error: null };
      if (colonnes === "revision, derniere_sauvegarde, archived_at") return { data: o.actuel === undefined ? { revision: 7, derniere_sauvegarde: "autre", archived_at: null } : o.actuel, error: null };
      return { data: q.steps.some(([m]) => m === "maybeSingle") ? { id: PROJET, titre: "Gid" } : [{ id: PROJET }], error: null };
    }
    throw new Error(`table inattendue ${q.table}`);
  });
  const session = {
    auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: MOI } } }) },
    from: db.from,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcs.push({ fn, args });
      const resultat = o.rpcErreur ? { data: null, error: o.rpcErreur } : { data: { id: PROJET, revision: 1 }, error: null };
      const chaine = { single: () => chaine, then: (oui: (v: unknown) => unknown) => Promise.resolve(resultat).then(oui) };
      return chaine;
    },
  };
  const deps = {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": { createAdminClient: () => { admin++; return { role: "service" }; } },
    "@/lib/auth": {
      requireActiveAccount: async (_id: string, opts?: { legalAcceptance?: boolean }) => {
        gardes.push({ legal: Boolean(opts?.legalAcceptance) });
        return o.suspendu ? Response.json({ error: "api.suspended" }, { status: 403 }) : null;
      },
    },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/api-erreur": {
      erreurAvecLangue: (_l: string, cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }),
    },
    "@/lib/digital-authoring/flags": { creationActive: () => o.active !== false, lireEnvCreation: () => ({}) },
    "@/lib/digital-authoring/schema": schema,
    "@/lib/digital-authoring/api": api,
    "@/lib/digital-authoring/revision": revision,
    "@/lib/digital-studio": digitalStudio,
    "@/lib/digital-authoring/modeles": modeles,
    "@/lib/digital-authoring/quality": quality,
  };
  const liste = loadRoute("app/api/digital-authoring/projects/route.ts", deps);
  const detail = loadRoute("app/api/digital-authoring/projects/[id]/route.ts", deps);
  const ctx = (id = PROJET) => ({ params: Promise.resolve({ id }) });
  const req = (methode: string, corps?: unknown) =>
    new Request("https://z.test/api/digital-authoring/projects", { method: methode, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return {
    db, rpcs, gardes, admin: () => admin,
    lister: () => liste.GET(),
    creer: (corps: unknown) => liste.POST(req("POST", corps)),
    lire: (id?: string) => detail.GET(req("GET"), ctx(id)),
    sauver: (corps: unknown, id?: string) => detail.PATCH(req("PATCH", corps), ctx(id)),
    agir: (corps: unknown, id?: string) => detail.POST(req("POST", corps), ctx(id)),
  };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));
/** Les objets nés dans le contexte `vm` du harnais n'ont pas le même prototype. */
const simple = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const projetValide = { titre: "  Gid vann manje  ", langue: "ht", public: "both", marcheDiaspora: "Miami" };
const sauvegarde = (extra: Record<string, unknown> = {}) => ({
  revisionAttendue: 2, jeton: JETON,
  contenu: { objectif: "", sections: [{ id: SECTION, titre: "Kòmanse", resultat: "", corps: "Tèks" }] },
  ...extra,
});

test("drapeau éteint : 404 partout, aucune requête", async () => {
  const f = fixture({ active: false });
  for (const r of [await f.lister(), await f.creer(projetValide), await f.lire(), await f.sauver(sauvegarde()), await f.agir({ action: "archiver" })]) {
    assert.equal(r.status, 404);
  }
  assert.equal(f.db.queries.length + f.rpcs.length + f.admin(), 0);
});

test("anonyme : 401 ; suspendu : refus canonique ; rien n'est lu ni écrit", async () => {
  const anonyme = fixture({ user: false });
  assert.equal((await anonyme.lister()).status, 401);
  assert.equal((await anonyme.sauver(sauvegarde())).status, 401);
  const suspendu = fixture({ suspendu: true });
  assert.equal((await suspendu.creer(projetValide)).status, 403);
  assert.equal((await suspendu.sauver(sauvegarde())).status, 403);
  assert.equal(anonyme.db.queries.length + suspendu.db.queries.length + suspendu.rpcs.length, 0);
});

test("liste : résumés seulement, jamais le brief ni le texte, réponse privée", async () => {
  const f = fixture();
  const r = await f.lister();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  const colonnes = String(f.db.queries[0].steps.find(([m]) => m === "select")?.[1][0]);
  assert.ok(!/brief|contenu/.test(colonnes), colonnes);
});

test("création : validée et normalisée avant l'appel, acceptation des conditions exigée", async () => {
  const f = fixture();
  const r = await f.creer(projetValide);
  assert.equal(r.status, 201);
  assert.deepEqual(simple(f.rpcs), [{ fn: "zabelie_authoring_creer_projet", args: { p_titre: "Gid vann manje", p_langue: "ht", p_public: "both", p_marche: "Miami" } }]);
  assert.deepEqual(f.gardes, [{ legal: true }]);

  const refuse = fixture();
  const r2 = await refuse.creer({ ...projetValide, public: "haiti" });
  assert.equal(r2.status, 422);
  assert.deepEqual(await json(r2), { error: "authoring.refus.marche", code: "marche_sans_diaspora" });
  assert.equal(refuse.rpcs.length, 0, "aucun appel avec une entrée invalide");
});

test("création : config absente → 503 sans appel ; plafond → 409 traduit", async () => {
  const sansConfig = fixture({ config: null });
  assert.equal((await sansConfig.creer(projetValide)).status, 503);
  assert.equal(sansConfig.rpcs.length, 0);
  const plafond = fixture({ rpcErreur: { code: "P0001", message: "authoring_projets_max" } });
  const r = await plafond.creer(projetValide);
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, "authoring.projetsMax");
});

test("un message brut de Postgres ne sort jamais vers le navigateur", async () => {
  const f = fixture({ rpcErreur: { code: "23505", message: "duplicate key value violates unique constraint zabelie_authoring_projects_pkey" } });
  const r = await f.creer(projetValide);
  const corps = JSON.stringify(await json(r));
  assert.equal(r.status, 500);
  assert.ok(!corps.includes("zabelie_") && !corps.includes("duplicate"), corps);
});

test("sauvegarde : comparaison de révision en base, seules les colonnes éditoriales partent", async () => {
  const f = fixture();
  const r = await f.sauver(sauvegarde({ revision: 99, seller_id: "x", plan_approuve_revision: 9, archived_at: "now" }));
  assert.equal(r.status, 200);
  assert.deepEqual(await json(r), { revision: 3, jeton: JETON, updatedAt: "t" });
  const q = f.db.queries.find((x) => x.steps.some(([m]) => m === "update"))!;
  const envoye = q.steps.find(([m]) => m === "update")![1][0] as Record<string, unknown>;
  assert.deepEqual(Object.keys(envoye).sort(), ["contenu", "derniere_sauvegarde"]);
  const filtres = q.steps.filter(([m]) => m === "eq").map(([, a]) => a);
  assert.deepEqual(filtres, [["id", PROJET], ["revision", 2]]);
});

test("sauvegarde : zéro ligne = conflit avec l'état du serveur, archivé ou introuvable", async () => {
  const conflit = await fixture({ majLignes: [] }).sauver(sauvegarde());
  assert.equal(conflit.status, 409);
  assert.deepEqual(await json(conflit), { error: "authoring.conflit", code: "conflit", revisionServeur: 7, jetonServeur: "autre" });
  const archive = await fixture({ majLignes: [], actuel: { revision: 4, derniere_sauvegarde: null, archived_at: "2026-10-15" } }).sauver(sauvegarde());
  assert.equal(archive.status, 409);
  assert.equal((await json(archive)).error, "authoring.archive");
  const absent = await fixture({ majLignes: [], actuel: null }).sauver(sauvegarde());
  assert.equal(absent.status, 404, "le projet d'un autre est introuvable, pas « interdit »");
});

test("sauvegarde : entrées invalides refusées avant toute écriture", async () => {
  for (const [corps, statut] of [
    [{ ...sauvegarde(), revisionAttendue: 0 }, 400],
    [{ ...sauvegarde(), jeton: "pas-un-uuid" }, 400],
    [{ revisionAttendue: 2, jeton: JETON }, 400],
    [sauvegarde({ contenu: { objectif: "", sections: [{ id: SECTION, titre: "x".repeat(161), resultat: "", corps: "" }] } }), 422],
    [sauvegarde({ brief: { sujet: "x" } }), 422],
  ] as const) {
    const f = fixture();
    assert.equal((await f.sauver(corps)).status, statut, JSON.stringify(corps).slice(0, 60));
    assert.ok(!f.db.queries.some((q) => q.steps.some(([m]) => m === "update")), "rien n'est écrit");
  }
  const f = fixture();
  assert.equal((await f.lire("pas-un-id")).status, 404);
  assert.equal(f.db.queries.length, 0);
});

test("actions : approbation d'une révision exacte, archivage, rien d'autre", async () => {
  const f = fixture();
  assert.equal((await f.agir({ action: "approuver_plan", revision: 3 })).status, 200);
  assert.equal((await f.agir({ action: "archiver" })).status, 200);
  assert.deepEqual(simple(f.rpcs), [
    { fn: "zabelie_authoring_approuver_plan", args: { p_projet: PROJET, p_revision: 3 } },
    { fn: "zabelie_authoring_archiver", args: { p_projet: PROJET } },
  ]);
  for (const corps of [{ action: "approuver_plan" }, { action: "publier" }, { action: "approuver_plan", revision: "3" }]) {
    const g = fixture();
    assert.equal((await g.agir(corps)).status, 400);
    assert.equal(g.rpcs.length, 0);
  }
  const perimee = fixture({ rpcErreur: { code: "40001", message: "authoring_revision_perimee" } });
  const r = await perimee.agir({ action: "approuver_plan", revision: 2 });
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, "authoring.conflit");
});

test("la clé de service ne sert qu'au plafond de débit (décision C1-A)", () => {
  for (const fichier of ["app/api/digital-authoring/projects/route.ts", "app/api/digital-authoring/projects/[id]/route.ts"]) {
    const src = readFileSync(fichier, "utf8");
    const usages = (src.match(/createAdminClient\(\)/g) ?? []).length;
    const limiteur = (src.match(/rateLimit\(createAdminClient\(\)/g) ?? []).length;
    assert.ok(usages > 0, `${fichier} : aucun usage lu — le contrôle regarderait le vide`);
    assert.equal(usages, limiteur, `${fichier} : la clé de service sert ailleurs qu'au limiteur`);
  }
});

test("création avec modèle : le plan part comme une sauvegarde sur la révision 1, dans la langue du guide", async () => {
  const f = fixture();
  const r = await f.creer({ ...projetValide, modele: "activite" });
  assert.equal(r.status, 201);
  assert.equal((await json(r)).modeleApplique, true);
  const q = f.db.queries.find((x) => x.steps.some(([m]) => m === "update"))!;
  const envoye = simple(q.steps.find(([m]) => m === "update")![1][0]) as { contenu: { sections: { titre: string; corps: string }[] } };
  assert.equal(envoye.contenu.sections.length, 7);
  assert.equal(envoye.contenu.sections[0].titre, "Poukisa aktivite sa a ka mache", "guide en kreyòl : plan en kreyòl");
  assert.ok(envoye.contenu.sections.every((s) => s.corps === ""), "le modèle n'écrit aucun texte à la place du créateur");
  assert.deepEqual(simple(q.steps.filter(([m]) => m === "eq").map(([, a]) => a)), [["id", PROJET], ["revision", 1]]);

  const inconnu = fixture();
  assert.equal((await inconnu.creer({ ...projetValide, modele: "roman" })).status, 422);
  assert.equal(inconnu.rpcs.length, 0, "modèle inconnu : rien n'est créé");

  const sans = fixture();
  assert.equal((await sans.creer({ ...projetValide, modele: null })).status, 201);
  assert.ok(!sans.db.queries.some((x) => x.steps.some(([m]) => m === "update")), "sans modèle, aucune écriture de plan");

  const rate = fixture({ majLignes: [] });
  const r3 = await rate.creer({ ...projetValide, modele: "kit" });
  assert.equal(r3.status, 201, "le projet existe même si le plan n'a pas pu être posé");
  assert.equal((await json(r3)).modeleApplique, false);
});

test("sauvegarde : un travail INCOMPLET s'enregistre (brief à moitié rempli, section sans titre)", async () => {
  const f = fixture();
  const briefPartiel = { sujet: "Manje", publicDetail: "", probleme: "", resultat: "", methode: "", exemples: "", prerequis: "", ton: "", limitesMethode: "", notes: "", references: "" };
  const r = await f.sauver(sauvegarde({ brief: briefPartiel, contenu: { objectif: "", sections: [{ id: SECTION, titre: "", resultat: "", corps: "" }] } }));
  assert.equal(r.status, 200, "un brouillon incomplet doit pouvoir être enregistré");
});

test("approbation : brief et plan COMPLETS exigés, relus en base, avant la fonction", async () => {
  const briefVide = fixture({ ligne: { brief: {}, contenu: LIGNE_COMPLETE.contenu } });
  const r1 = await briefVide.agir({ action: "approuver_plan", revision: 3 });
  assert.equal(r1.status, 422);
  assert.deepEqual(await json(r1), { error: "authoring.refus.requis", code: "champ_requis" });
  assert.equal(briefVide.rpcs.length, 0);

  const sansTitre = fixture({ ligne: { brief: BRIEF_COMPLET, contenu: { objectif: "", sections: [{ id: SECTION, titre: "", resultat: "", corps: "" }] } } });
  assert.equal((await sansTitre.agir({ action: "approuver_plan", revision: 3 })).status, 422);
  assert.equal(sansTitre.rpcs.length, 0);

  const absent = fixture({ ligne: null });
  assert.equal((await absent.agir({ action: "approuver_plan", revision: 3 })).status, 404);
  assert.equal(absent.rpcs.length, 0);
});

test("approbation du guide : fiche-test refaite en base, révision exacte, responsabilité expresse", async () => {
  const approuver = { action: "approuver_guide", revision: 5, responsabilite: true };
  const f = fixture();
  const ok = await f.agir(approuver);
  assert.equal(ok.status, 200, "des conseils (guide court) n'empêchent pas l'approbation");
  assert.deepEqual(simple(f.rpcs), [
    { fn: "zabelie_authoring_approuver_revision", args: { p_projet: PROJET, p_revision: 5, p_responsabilite: true } },
  ]);
  assert.ok(f.gardes.every((g) => g.legal), "conditions acceptées exigées");

  // Responsabilité : seul `true` passe, et rien n'est lu avant.
  for (const responsabilite of [undefined, false, "true", 1]) {
    const g = fixture();
    const r = await g.agir({ action: "approuver_guide", revision: 5, responsabilite });
    assert.equal(r.status, 422, String(responsabilite));
    assert.equal((await json(r)).code, "authoring_responsabilite_requise");
    assert.equal(g.rpcs.length + g.db.queries.filter((q) => q.table === api.TABLE_PROJETS).length, 0);
  }
  // Révision absente ou mal typée : 400, sans appel.
  for (const revision of [undefined, "5", 0, 1.5]) {
    const g = fixture();
    assert.equal((await g.agir({ action: "approuver_guide", revision, responsabilite: true })).status, 400);
    assert.equal(g.rpcs.length, 0);
  }
});

test("approbation du guide : un bloquant en base rend la fiche, sans appeler la fonction", async () => {
  const cas: Array<[string, Record<string, unknown> | null, number, string]> = [
    ["marqueur oublié", { ...GUIDE_PRET, contenu: { ...GUIDE_PRET.contenu, sections: [{ ...GUIDE_PRET.contenu.sections[0], corps: "TODO : fini sa." }] } }, 422, "guide_pas_pret"],
    ["simulation", { ...GUIDE_PRET, contenu: { ...GUIDE_PRET.contenu, sections: [{ ...GUIDE_PRET.contenu.sections[0], corps: "[SIMULASYON] Bouyon." }] } }, 422, "guide_pas_pret"],
    ["section vide", { ...GUIDE_PRET, contenu: { ...GUIDE_PRET.contenu, sections: [{ ...GUIDE_PRET.contenu.sections[0], corps: "  " }] } }, 422, "guide_pas_pret"],
    ["caractère sans dessin", { ...GUIDE_PRET, titre: "Gid " + String.fromCodePoint(0x1f600) }, 422, "guide_pas_pret"],
    ["plan jamais approuvé", { ...GUIDE_PRET, plan_approuve_revision: null }, 422, "guide_pas_pret"],
    ["texte modifié depuis", { ...GUIDE_PRET, revision: 6 }, 409, "conflit"],
    ["archivé", { ...GUIDE_PRET, archived_at: "2026-10-16T00:00:00Z" }, 409, "archive"],
    ["introuvable", null, 404, ""],
  ];
  for (const [nom, guide, statut, code] of cas) {
    const f = fixture({ guide });
    const r = await f.agir({ action: "approuver_guide", revision: 5, responsabilite: true });
    assert.equal(r.status, statut, nom);
    const d = await json(r);
    if (code) assert.equal(d.code, code, nom);
    if (code === "guide_pas_pret") {
      assert.ok(d.fiche.bloquants > 0 && d.fiche.preparation === "pas_pret", nom);
      assert.ok(d.fiche.controles.some((c: { niveau: string }) => c.niveau === "bloquant"), nom);
    }
    assert.equal(f.rpcs.length, 0, `${nom} : la fonction ne doit pas être appelée`);
  }
});

test("approbation du guide : les refus de la base (0146) sont traduits, jamais bruts", async () => {
  const cas: Array<[string, number, string]> = [
    ["authoring_marqueur_simulation", 422, "authoring.approbation.pasPret"],
    ["authoring_guide_incomplet", 422, "authoring.approbation.pasPret"],
    ["authoring_guide_sans_plan", 409, "authoring.approbation.sansPlan"],
    ["authoring_responsabilite_requise", 422, "authoring.approbation.responsabilite"],
    ["authoring_revision_perimee", 409, "authoring.conflit"],
  ];
  for (const [message, statut, cle] of cas) {
    const f = fixture({ rpcErreur: { code: "P0001", message } });
    const r = await f.agir({ action: "approuver_guide", revision: 5, responsabilite: true });
    assert.equal(r.status, statut, message);
    assert.equal((await json(r)).error, cle, message);
  }
});
