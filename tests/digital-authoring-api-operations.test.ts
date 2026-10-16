import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as api from "../lib/digital-authoring/api";
import * as operations from "../lib/digital-authoring/operations";
import * as digitalStudio from "../lib/digital-studio";

/**
 * Studio de création éditoriale — routes des opérations (docs/70, tâche 3.2).
 * La base, la session, le limiteur et l'exécuteur sont des doublures : on
 * vérifie ce qui est demandé, dans quel ordre, et ce qui revient au navigateur.
 */

const MOI = "00000000-0000-4000-8000-0000000000a1";
const PROJET = "00000000-0000-4000-8000-0000000000b1";
const OP = "00000000-0000-4000-8000-0000000000e1";
const CLE = "00000000-0000-4000-8000-0000000000c1";
const SECTION = "00000000-0000-4000-8000-0000000000d1";
const CONFIG = { id: true, titre_max: 160, brief_max: 6000, sections_max: 12, section_max: 12000, total_max: 120000 };
const LIGNE = { id: OP, type: "draft", section_id: SECTION, etat: "succeeded", code_erreur: null, resultat: { texte: "Bouyon" }, created_at: "t", revision: { numero: 3 }, bail_jeton: "secret" };

type Opts = {
  active?: boolean; ia?: boolean; user?: boolean;
  demande?: { data?: unknown; error?: { code?: string; message?: string } };
  ligne?: Record<string, unknown> | null;
  annuler?: { code?: string; message?: string };
  executeur?: "ok" | "lance";
};

const simple = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function fixture(o: Opts = {}) {
  const gestes: string[] = [];
  const rpcs: Array<{ fn: string; args: unknown }> = [];
  const db = database((q: Query) => {
    if (q.table === api.TABLE_CONFIG) return { data: CONFIG, error: null };
    if (q.table === api.TABLE_OPERATIONS) {
      gestes.push("lire");
      if (q.steps.some(([m]) => m === "maybeSingle")) return { data: o.ligne === undefined ? LIGNE : o.ligne, error: null };
      return { data: [LIGNE], error: null };
    }
    throw new Error(`table inattendue ${q.table}`);
  });
  const session = {
    auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: MOI } } }) },
    from: db.from,
    rpc(fn: string, args: unknown) {
      rpcs.push({ fn, args });
      gestes.push(fn.replace("zabelie_authoring_", ""));
      let resultat: unknown = { data: null, error: null };
      if (fn === "zabelie_authoring_demander") resultat = { data: o.demande?.data ?? { id: OP, etat: "queued" }, error: o.demande?.error ?? null };
      if (fn === "zabelie_authoring_quota") resultat = { data: { utilisees: 2, maximum: 10 }, error: null };
      if (fn === "zabelie_authoring_annuler") resultat = { data: o.annuler ? null : "cancelled", error: o.annuler ?? null };
      const chaine = { single: () => chaine, maybeSingle: () => chaine, then: (oui: (v: unknown) => unknown) => Promise.resolve(resultat).then(oui) };
      return chaine;
    },
  };
  const executions: string[] = [];
  const deps = {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": { createAdminClient: () => ({ role: "service" }) },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => true },
    "@/lib/api-erreur": { erreurAvecLangue: (_l: string, cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }) },
    "@/lib/digital-studio": digitalStudio,
    "@/lib/digital-authoring/flags": {
      creationActive: () => o.active !== false,
      lireEnvCreation: () => ({}),
      choisirMoteur: () => (o.ia === false ? { ok: false, code: "ia_coupee" } : { ok: true, moteur: "mock" }),
    },
    "@/lib/digital-authoring/provider": { fournisseurEditorial: () => ({ ok: true }) },
    "@/lib/digital-authoring/executor": {
      executerEtape: async (_d: unknown, id: string) => {
        gestes.push("executer");
        executions.push(id);
        if (o.executeur === "lance") throw new Error("base injoignable");
        return "succeeded";
      },
    },
    "@/lib/digital-authoring/operations": operations,
    "@/lib/digital-authoring/api": api,
  };
  const liste = loadRoute("app/api/digital-authoring/operations/route.ts", deps, {}, { console: { error: () => undefined, log: console.log } });
  const detail = loadRoute("app/api/digital-authoring/operations/[id]/route.ts", deps, {}, { console: { error: () => undefined, log: console.log } });
  const ctx = (id = OP) => ({ params: Promise.resolve({ id }) });
  const req = (methode: string, corps?: unknown, url = "https://z.test/api/digital-authoring/operations") =>
    new Request(url, { method: methode, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return {
    gestes, rpcs, executions, db,
    demander: (corps: unknown) => liste.POST(req("POST", corps)),
    lister: (projet = PROJET) => liste.GET(req("GET", undefined, `https://z.test/api/digital-authoring/operations?projet=${projet}`)),
    lire: (id?: string) => detail.GET(req("GET"), ctx(id)),
    annuler: (corps: unknown = { action: "annuler" }) => detail.POST(req("POST", corps), ctx()),
  };
}
const json = async (r: Response) => simple(await r.json());
const demande = { projetId: PROJET, type: "draft", sectionId: SECTION, cle: CLE };

test("drapeau éteint : 404 partout, rien demandé ni exécuté", async () => {
  const f = fixture({ active: false });
  for (const r of [await f.demander(demande), await f.lister(), await f.lire(), await f.annuler()]) assert.equal(r.status, 404);
  assert.equal(f.rpcs.length + f.executions.length, 0);
});

test("IA coupée : aucune demande inscrite, aucun quota consommé (T25)", async () => {
  const f = fixture({ ia: false });
  const r = await f.demander(demande);
  assert.equal(r.status, 503);
  assert.equal((await json(r)).error, "authoring.ia.coupee");
  assert.equal(f.rpcs.length, 0);
});

test("demande : paramètres validés avant la base", async () => {
  for (const mauvais of [
    { ...demande, cle: "x" }, { ...demande, projetId: "x" }, { ...demande, type: "roman" },
    { ...demande, sectionId: "x" }, { ...demande, sectionId: undefined },
  ]) {
    const f = fixture();
    assert.equal((await f.demander(mauvais)).status, 400, JSON.stringify(mauvais));
    assert.equal(f.rpcs.length, 0);
  }
});

test("demande : inscription sous la session, PUIS une étape, puis la lecture ; jamais le jeton de bail", async () => {
  const f = fixture();
  const r = await f.demander(demande);
  assert.equal(r.status, 201);
  assert.deepEqual(f.gestes.slice(0, 2), ["demander", "executer"]);
  assert.deepEqual(simple(f.rpcs[0]), { fn: "zabelie_authoring_demander", args: { p_projet: PROJET, p_type: "draft", p_section: SECTION, p_cle: CLE } });
  const corps = await json(r);
  assert.deepEqual(corps.quota, { utilisees: 2, maximum: 10 });
  assert.equal(corps.operation.resultat.texte, "Bouyon");
  assert.equal(corps.operation.revisionSource, 3);
  assert.ok(!JSON.stringify(corps).includes("secret"), "le jeton de bail ne sort jamais");
});

test("rejeu d'une opération déjà conclue : rien n'est réexécuté (T06)", async () => {
  const f = fixture({ demande: { data: { id: OP, etat: "succeeded" } } });
  assert.equal((await f.demander(demande)).status, 201);
  assert.equal(f.executions.length, 0);
});

test("refus de la base traduits : quotas, plan, clé en conflit", async () => {
  for (const [message, statut, cle] of [
    ["authoring_quota_vendeur", 429, "authoring.ia.quotaVendeur"],
    ["authoring_quota_global", 429, "authoring.ia.quotaGlobal"],
    ["authoring_operations_en_cours", 429, "authoring.ia.enCours"],
    ["authoring_plan_non_approuve", 409, "authoring.ia.planNonApprouve"],
    ["authoring_cle_conflit", 409, "authoring.ia.cleConflit"],
  ] as const) {
    const f = fixture({ demande: { error: { code: "P0001", message } } });
    const r = await f.demander(demande);
    assert.equal(r.status, statut, message);
    assert.equal((await json(r)).error, cle);
    assert.equal(f.executions.length, 0, `${message} : rien n'est exécuté`);
  }
});

test("une étape qui échoue n'efface pas l'inscription : la réponse reste 201", async () => {
  const f = fixture({ executeur: "lance" });
  assert.equal((await f.demander(demande)).status, 201);
});

test("sondage : une opération en attente avance d'une étape ; une terminée non ; celle d'un autre est introuvable", async () => {
  const attente = fixture({ ligne: { ...LIGNE, etat: "queued", resultat: null } });
  assert.equal((await attente.lire()).status, 200);
  assert.deepEqual(attente.executions, [OP]);

  const finie = fixture();
  assert.equal((await finie.lire()).status, 200);
  assert.equal(finie.executions.length, 0);

  const autre = fixture({ ligne: null });
  assert.equal((await autre.lire()).status, 404);
  assert.equal(autre.executions.length, 0);
});

test("annulation : traduite, et seulement l'action connue", async () => {
  assert.equal((await fixture().annuler()).status, 200);
  const partie = fixture({ annuler: { code: "P0001", message: "authoring_operation_non_annulable" } });
  const r = await partie.annuler();
  assert.equal(r.status, 409);
  assert.equal((await json(r)).error, "authoring.ia.nonAnnulable");
  assert.equal((await fixture().annuler({ action: "supprimer" })).status, 400);
});

test("liste : projet exigé, opérations mises en forme, quota joint", async () => {
  assert.equal((await fixture().lister("x")).status, 400);
  const r = await fixture().lister();
  const corps = await json(r);
  assert.equal(corps.operations.length, 1);
  assert.ok(!("bail_jeton" in corps.operations[0]));
});

test("la clé de service ne sert qu'au limiteur et au contrat système de l'exécuteur (C1-A)", () => {
  const permis = [
    /const admin = createAdminClient\(\);/,
    /rateLimit\(admin,/,
    /admin: admin as unknown as ClientSysteme/,
    /admin: createAdminClient\(\) as unknown as ClientSysteme/,
    /^import .*createAdminClient/,
  ];
  for (const fichier of ["app/api/digital-authoring/operations/route.ts", "app/api/digital-authoring/operations/[id]/route.ts"]) {
    const lignes = readFileSync(fichier, "utf8").split("\n")
      .filter((l) => /createAdminClient|\badmin\b/.test(l) && !/^\s*(\*|\/\/)/.test(l));
    assert.ok(lignes.length >= 2, `${fichier} : aucun usage lu`);
    for (const l of lignes) assert.ok(permis.some((m) => m.test(l.trim())), `${fichier} : usage non prévu — ${l.trim()}`);
  }
});

test("mise en forme : aucun résultat avant le succès, jamais le jeton", () => {
  assert.equal(api.operationPourClient({ ...LIGNE, etat: "running", resultat: { texte: "partiel" } })?.resultat, null);
  assert.ok(!("bail_jeton" in (api.operationPourClient(LIGNE) ?? {})));
  assert.equal(api.operationPourClient({ id: OP }), null);
});
