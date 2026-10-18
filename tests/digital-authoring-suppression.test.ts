import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { database, loadRoute } from "./helpers/route-harness";
import * as api from "../lib/digital-authoring/api";
import * as revision from "../lib/digital-authoring/revision";
import * as quality from "../lib/digital-authoring/quality";
import * as schema from "../lib/digital-authoring/schema";
import * as digitalStudio from "../lib/digital-studio";
import * as buckets from "../lib/storage-buckets";

/**
 * Studio de création éditoriale — suppression d'un projet archivé et purge
 * des comptes fermés (tâche 5.3 ; 0149 ; docs/70 §7.6).
 *
 * Ce que ces tests tiennent : les objets du bucket privé partent AVANT les
 * lignes, et seulement après une vérification qui a réussi ; aucun objet hors
 * du dossier du projet n'est jamais retiré ; une purge échouée au stockage ne
 * supprime aucune ligne.
 */

const v = (x: unknown) => JSON.parse(JSON.stringify(x));
const MOI = "00000000-0000-4000-8000-0000000000a1";
const PROJET = "00000000-0000-4000-8000-0000000000b1";
const A = `${MOI}/${PROJET}/${"a".repeat(64)}.pdf`;
const B = `${MOI}/${PROJET}/${"a".repeat(64)}-extrait.pdf`;

type Journal = { quoi: string; detail?: unknown }[];

function suppression(o: {
  active?: boolean;
  user?: boolean;
  limite?: boolean;
  verification?: { data?: unknown; error?: { code?: string; message?: string } };
  execution?: { error?: { code?: string; message?: string } };
  stockageErreur?: boolean;
} = {}) {
  const journal: Journal = [];
  const session = {
    auth: { getUser: async () => ({ data: { user: o.user === false ? null : { id: MOI } } }) },
    from: database(() => ({ data: null, error: null })).from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      journal.push({ quoi: `rpc:${fn}`, detail: args });
      if (args.p_executer === false) return { data: o.verification?.data ?? [{ chemin: A }, { chemin: B }], error: o.verification?.error ?? null };
      return { data: [], error: o.execution?.error ?? null };
    },
  };
  const admin = {
    storage: {
      from: (bucket: string) => ({
        remove: async (chemins: string[]) => {
          journal.push({ quoi: `remove:${bucket}`, detail: chemins });
          return { data: null, error: o.stockageErreur ? { message: "refus" } : null };
        },
      }),
    },
  };
  const route = loadRoute("app/api/digital-authoring/projects/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => session },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => o.limite !== true },
    "@/lib/api-erreur": {
      erreurAvecLangue: (_l: string, cle: string, status: number, extra?: Record<string, unknown>) => Response.json({ error: cle, ...extra }, { status }),
    },
    "@/lib/digital-studio": digitalStudio,
    "@/lib/storage-buckets": buckets,
    "@/lib/digital-authoring/flags": { creationActive: () => o.active !== false, lireEnvCreation: () => ({}) },
    "@/lib/digital-authoring/schema": schema,
    "@/lib/digital-authoring/revision": revision,
    "@/lib/digital-authoring/quality": quality,
    "@/lib/digital-authoring/api": api,
  });
  const supprimer = (id = PROJET) => route.DELETE(new Request("https://z.test/x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
  return { supprimer, journal };
}

test("D1 — gardes d'entrée : rien n'est vérifié ni retiré avant elles", async () => {
  const cas: [string, Parameters<typeof suppression>[0], string, number, string][] = [
    ["drapeau éteint", { active: false }, PROJET, 404, "api.feature.off"],
    ["identifiant invalide", {}, "x", 404, "authoring.introuvable"],
    ["sans session", { user: false }, PROJET, 401, "api.auth.required"],
    ["cadence dépassée", { limite: true }, PROJET, 429, "api.rate.limited"],
  ];
  for (const [nom, o, id, statut, cle] of cas) {
    const s = suppression(o);
    const r = await s.supprimer(id);
    assert.equal(r.status, statut, nom);
    assert.equal((await r.json()).error, cle, nom);
    assert.deepEqual(s.journal, [], `${nom} : aucun appel`);
  }
});

test("D2 — refus de la base : traduit, et aucun objet retiré", async () => {
  const cas: [string, string, number, string][] = [
    ["projet actif", "authoring_archive_requis", 409, "authoring.suppression.archiveRequis"],
    ["servi aujourd'hui", "authoring_suppression_demain", 409, "authoring.suppression.demain"],
    ["projet d'un autre", "authoring_projet_introuvable", 404, "authoring.introuvable"],
  ];
  for (const [nom, message, statut, cle] of cas) {
    const s = suppression({ verification: { error: { code: "P0001", message } } });
    const r = await s.supprimer();
    assert.equal(r.status, statut, nom);
    assert.deepEqual(await r.json(), { error: cle, code: message }, nom);
    assert.deepEqual(s.journal.map((j) => j.quoi), ["rpc:zabelie_authoring_supprimer_projet"], `${nom} : vérification seule`);
  }
});

test("D3 — succès : vérifier, retirer les PDF du projet, puis supprimer les lignes", async () => {
  const etranger = `00000000-0000-4000-8000-0000000000a2/${PROJET}/x.pdf`;
  const remonte = `${MOI}/${PROJET}/../autre/x.pdf`;
  const s = suppression({ verification: { data: [{ chemin: A }, { chemin: B }, { chemin: etranger }, { chemin: remonte }, { chemin: null }] } });
  const r = await s.supprimer();
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(v(s.journal), [
    { quoi: "rpc:zabelie_authoring_supprimer_projet", detail: { p_projet: PROJET, p_executer: false } },
    { quoi: `remove:${buckets.AUTHORING_BUCKET}`, detail: [A, B] },
    { quoi: "rpc:zabelie_authoring_supprimer_projet", detail: { p_projet: PROJET, p_executer: true } },
  ], "les objets d'abord, et seulement ceux du dossier du projet");

  // Un projet sans PDF : aucun appel au stockage.
  const vide = suppression({ verification: { data: [] } });
  assert.equal((await vide.supprimer()).status, 200);
  assert.deepEqual(vide.journal.map((j) => j.quoi), ["rpc:zabelie_authoring_supprimer_projet", "rpc:zabelie_authoring_supprimer_projet"]);
});

test("D4 — stockage refusé : le projet reste entier ; refus tardif de la base : rendu tel quel", async () => {
  const s = suppression({ stockageErreur: true });
  const r = await s.supprimer();
  assert.equal(r.status, 502);
  assert.deepEqual(s.journal.map((j) => j.quoi), ["rpc:zabelie_authoring_supprimer_projet", `remove:${buckets.AUTHORING_BUCKET}`]);

  const t = suppression({ execution: { error: { code: "P0001", message: "authoring_suppression_demain" } } });
  const r2 = await t.supprimer();
  assert.equal(r2.status, 409);
  assert.equal((await r2.json()).error, "authoring.suppression.demain");
});

// ── La purge des comptes fermés (cron) ─────────────────────────────────────

function purge(o: {
  candidats?: { data?: unknown; error?: { code?: string } };
  stockageErreur?: boolean;
  suppressionErreur?: boolean;
  bail?: boolean;
  env?: Record<string, string>;
} = {}) {
  const journal: Journal = [];
  const admin = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      journal.push({ quoi: `rpc:${fn}`, detail: args });
      if (fn === "zabelie_authoring_purge_candidats") return { data: o.candidats?.data ?? [], error: o.candidats?.error ?? null };
      return { data: (args.p_projets as unknown[]).length, error: o.suppressionErreur ? { code: "XX000" } : null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (chemins: string[]) => {
          journal.push({ quoi: `remove:${bucket}`, detail: chemins.length });
          return { data: null, error: o.stockageErreur ? { message: "refus" } : null };
        },
      }),
    },
  };
  const route = loadRoute("app/api/digital-authoring/purge/route.ts", {
    "@/lib/api-erreur": { erreurTraduite: (cle: string, status: number) => Response.json({ error: cle }, { status }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/pg-errors": { isMissingFunction: (e: { code?: string } | null) => e?.code === "PGRST202" },
    "@/lib/storage-buckets": buckets,
    "@/lib/cron-lease": {
      avecBail: async (_a: unknown, _n: string, _p: string, travail: () => Promise<Response>) =>
        o.bail === false ? { bail: { autorise: false } } : { bail: { autorise: true }, resultat: await travail() },
    },
  }, o.env ?? { CRON_SECRET: "secret-cron" });
  const appeler = (jeton = "secret-cron") => route.GET(new Request("https://z.test/api/digital-authoring/purge", { headers: { authorization: `Bearer ${jeton}` } }));
  return { appeler, journal };
}

test("P1 — la purge : réservée au cron, objets d'abord, lignes ensuite", async () => {
  // Sans le secret : rien ne se lit.
  const intrus = purge();
  assert.equal((await intrus.appeler("faux")).status, 401);
  assert.equal((await purge({ env: {} }).appeler("")).status, 401, "aucun secret configuré : fermé");
  const sansEntete = purge({ env: {} });
  const routeSans = await sansEntete.appeler("x");
  assert.equal(routeSans.status, 401);
  // Ni en-tête ni secret : « absent » ne doit jamais égaler « absent ».
  const nu = loadRoute("app/api/digital-authoring/purge/route.ts", {
    "@/lib/api-erreur": { erreurTraduite: (cle: string, status: number) => Response.json({ error: cle }, { status }) },
    "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("aucune lecture sans autorisation"); } },
  }, {});
  assert.equal((await nu.GET(new Request("https://z.test/api/digital-authoring/purge"))).status, 401);
  assert.deepEqual(intrus.journal, []);

  // 0149 absente : dégradation visible, rien d'autre.
  const absente = purge({ candidats: { error: { code: "PGRST202" } } });
  assert.deepEqual(await (await absente.appeler()).json(), { ok: true, purges: -1 });

  // Rien à purger : un passage qui le dit.
  const rien = purge();
  assert.deepEqual(await (await rien.appeler()).json(), { ok: true, purges: 0 });
  assert.deepEqual(rien.journal.map((j) => j.quoi), ["rpc:zabelie_authoring_purge_candidats"]);

  // Deux projets, l'un sans PDF : les objets, puis les lignes des DEUX projets.
  const deux = purge({ candidats: { data: [{ project_id: "p1", chemins: [A, B] }, { project_id: "p2", chemins: null }] } });
  assert.deepEqual(await (await deux.appeler()).json(), { ok: true, purges: 2 });
  assert.deepEqual(v(deux.journal), [
    { quoi: "rpc:zabelie_authoring_purge_candidats", detail: { p_limite: 200 } },
    { quoi: `remove:${buckets.AUTHORING_BUCKET}`, detail: 2 },
    { quoi: "rpc:zabelie_authoring_purge_comptes_fermes", detail: { p_projets: ["p1", "p2"] } },
  ]);
});

test("P2 — stockage refusé : aucune ligne supprimée ; gros passage découpé ; bail tenu ailleurs", async () => {
  const refus = purge({ candidats: { data: [{ project_id: "p1", chemins: [A] }] }, stockageErreur: true });
  assert.equal((await refus.appeler()).status, 502);
  assert.ok(!refus.journal.some((j) => j.quoi === "rpc:zabelie_authoring_purge_comptes_fermes"), "les lignes restent pour le passage suivant");

  const chemins = Array.from({ length: 1201 }, (_, i) => `${MOI}/p/${i}.pdf`);
  const gros = purge({ candidats: { data: [{ project_id: "p1", chemins }] } });
  await gros.appeler();
  assert.deepEqual(gros.journal.filter((j) => j.quoi.startsWith("remove:")).map((j) => j.detail), [500, 500, 201]);

  const lignes = purge({ candidats: { data: [{ project_id: "p1", chemins: [A] }] }, suppressionErreur: true });
  assert.equal((await lignes.appeler()).status, 500);

  const tenu = purge({ bail: false });
  assert.deepEqual(await (await tenu.appeler()).json(), { ignore: "bail_tenu" });
  assert.deepEqual(tenu.journal, []);
});

test("P3 — la purge est déclarée au cron et ne dépend pas du drapeau du Studio", () => {
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[]).map((c) => c.path);
  assert.ok(crons.includes("/api/digital-authoring/purge"));
  const src = readFileSync("app/api/digital-authoring/purge/route.ts", "utf8");
  assert.doesNotMatch(src, /creationActive|lireEnvCreation/, "un compte fermé se purge même Studio éteint");
});

