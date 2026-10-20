import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { database, loadRoute, type Query } from "./helpers/route-harness";
import * as essayageAdmin from "../lib/essayage/admin";
import { lireAction, lireTableauEssayage, PLAFOND_MAX, QUOTA_MAX } from "../lib/essayage/admin";

/**
 * ESSAYAGE VIRTUEL — l'administration (tâche 5.1) : la route des gestes du
 * panneau (vraie route, base et session en doublures), la lecture des actions
 * et du tableau, et le branchement de la page.
 */

const ADMIN = "aaaaaaaa-0000-4000-8000-000000000001";
const VENDEUR = "bbbbbbbb-0000-4000-8000-000000000002";

type Opts = { moi?: { id: string; role: string } | null; profil?: { id: string; role: string } | null; retires?: number; panne?: boolean };

function fixture(o: Opts = {}) {
  const ecritures: { table: string; methode: string; valeur: unknown; filtres: unknown[] }[] = [];
  const journal: Record<string, unknown>[] = [];
  const db = database((q: Query) => {
    const methode = q.steps.find(([m]) => ["update", "upsert", "insert", "delete"].includes(m));
    if (methode) {
      ecritures.push({ table: q.table, methode: methode[0], valeur: JSON.parse(JSON.stringify(methode[1][0])), filtres: q.steps.filter(([m]) => m === "eq").map(([, a]) => a) });
      if (o.panne) return { data: null, error: { message: "secret interne" } };
      if (q.table === "zabelie_essayage_vendeurs" && methode[0] === "update") return { data: Array.from({ length: o.retires ?? 1 }, () => ({ seller_id: VENDEUR })), error: null };
      return { data: null, error: null };
    }
    if (q.table === "profiles") return { data: o.profil === undefined ? { id: VENDEUR, role: "creator" } : o.profil, error: null };
    throw new Error(`lecture inattendue ${q.table}`);
  });
  const route = loadRoute("app/api/admin/essayage/route.ts", {
    "@/lib/api-erreur": { erreurTraduite: async (cle: string, status: number) => Response.json({ error: cle }, { status }) },
    "@/lib/auth": { getAdminUser: async () => (o.moi === undefined ? { id: ADMIN, role: "admin" } : o.moi) },
    "@/lib/admin-audit": { journaliserActeAdmin: async (_a: unknown, acte: Record<string, unknown>) => void journal.push(JSON.parse(JSON.stringify(acte))) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: db.from }) },
    "@/lib/essayage/admin": essayageAdmin,
  });
  const poster = (corps: unknown) => route.POST(new Request("https://z.test/api/admin/essayage", { method: "POST", body: typeof corps === "string" ? corps : JSON.stringify(corps) }));
  return { ecritures, journal, poster };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));

test("EA1 — sans admin (anonyme, autre rôle, ou sans double authentification) : 403, sans rien lire ni écrire", async () => {
  for (const moi of [null, { id: ADMIN, role: "creator" }, { id: ADMIN, role: "buyer" }]) {
    const f = fixture({ moi });
    const r = await f.poster({ action: "regler", plafond: 10, quota: 1, pause: false });
    assert.equal(r.status, 403);
    assert.deepEqual(await json(r), { error: "api.access.denied" });
    assert.equal(f.ecritures.length + f.journal.length, 0);
  }
});

test("EA2 — corps abîmé ou hors bornes : 400, rien d'écrit", async () => {
  for (const corps of ["pas du json", { action: "regler", plafond: -1, quota: 5, pause: false }, { action: "regler", plafond: 10, quota: QUOTA_MAX + 1, pause: false }, { action: "regler", plafond: 1.5, quota: 5, pause: false }, { action: "regler", plafond: 10, quota: 5, pause: "non" }, { action: "ajouter", vendeur: "pas-un-uuid" }, { action: "supprimer", vendeur: VENDEUR }]) {
    const f = fixture();
    const r = await f.poster(corps);
    assert.equal(r.status, 400, JSON.stringify(corps));
    assert.equal(f.ecritures.length, 0);
  }
});

test("EA3 — régler : la ligne unique de la config, puis le journal", async () => {
  const f = fixture();
  const r = await f.poster({ action: "regler", plafond: 800, quota: 3, pause: true });
  assert.equal(r.status, 200);
  assert.equal(f.ecritures.length, 1);
  const e = f.ecritures[0];
  assert.equal(e.table, "zabelie_essayage_config");
  assert.deepEqual(e.filtres, [["id", true]]);
  assert.deepEqual({ ...(e.valeur as Record<string, unknown>), modifie_le: "…" }, { plafond_mois: 800, quota_jour: 3, en_pause: true, modifie_le: "…" });
  assert.deepEqual(f.journal, [{ actorId: ADMIN, action: "essayage.reglages_modifier", targetType: "essayage", metadata: { plafond: 800, quota: 3, pause: true } }]);
});

test("EA4 — ajouter : seulement un vendeur (rôle creator) ; activé par l'admin de la session ; journalisé", async () => {
  for (const profil of [null, { id: VENDEUR, role: "buyer" }, { id: VENDEUR, role: "admin" }]) {
    const f = fixture({ profil });
    assert.equal((await f.poster({ action: "ajouter", vendeur: VENDEUR })).status, 404, JSON.stringify(profil));
    assert.equal(f.ecritures.length, 0);
  }
  const f = fixture();
  assert.equal((await f.poster({ action: "ajouter", vendeur: VENDEUR })).status, 200);
  const e = f.ecritures[0];
  assert.equal(e.table, "zabelie_essayage_vendeurs");
  assert.equal(e.methode, "upsert");
  assert.deepEqual({ ...(e.valeur as Record<string, unknown>), active_le: "…" }, { seller_id: VENDEUR, actif: true, active_par: ADMIN, active_le: "…" });
  assert.deepEqual(f.journal, [{ actorId: ADMIN, action: "essayage.vendeur_ajouter", targetType: "user", targetId: VENDEUR }]);
});

test("EA5 — retirer : le pilote actif passe à inactif (ses fiches se ferment) ; un vendeur qui ne l'était pas : 404", async () => {
  const f = fixture();
  assert.equal((await f.poster({ action: "retirer", vendeur: VENDEUR })).status, 200);
  assert.deepEqual(f.ecritures[0], { table: "zabelie_essayage_vendeurs", methode: "update", valeur: { actif: false }, filtres: [["seller_id", VENDEUR], ["actif", true]] });
  assert.deepEqual(f.journal, [{ actorId: ADMIN, action: "essayage.vendeur_retirer", targetType: "user", targetId: VENDEUR }]);
  const g = fixture({ retires: 0 });
  assert.equal((await g.poster({ action: "retirer", vendeur: VENDEUR })).status, 404);
  assert.equal(g.journal.length, 0);
});

test("EA6 — la base refuse : 503 sans détail, et rien au journal", async () => {
  for (const corps of [{ action: "regler", plafond: 10, quota: 1, pause: false }, { action: "ajouter", vendeur: VENDEUR }, { action: "retirer", vendeur: VENDEUR }]) {
    const f = fixture({ panne: true });
    const r = await f.poster(corps);
    assert.equal(r.status, 503, JSON.stringify(corps));
    assert.ok(!JSON.stringify(await json(r)).includes("secret"));
    assert.equal(f.journal.length, 0);
  }
});

test("EA7 — lireAction : les trois gestes, bornes comprises", () => {
  assert.deepEqual(lireAction({ action: "regler", plafond: 0, quota: 0, pause: false }), { action: "regler", plafond: 0, quota: 0, pause: false });
  assert.deepEqual(lireAction({ action: "regler", plafond: PLAFOND_MAX, quota: QUOTA_MAX, pause: true, autre: 1 }), { action: "regler", plafond: PLAFOND_MAX, quota: QUOTA_MAX, pause: true });
  assert.equal(lireAction({ action: "regler", plafond: PLAFOND_MAX + 1, quota: 1, pause: true }), null);
  assert.equal(lireAction({ action: "regler", plafond: "10", quota: 1, pause: true }), null);
  assert.deepEqual(lireAction({ action: "retirer", vendeur: VENDEUR }), { action: "retirer", vendeur: VENDEUR });
  for (const mauvais of [null, [], "x", { action: "ajouter" }]) assert.equal(lireAction(mauvais), null);
});

test("EA8 — lireTableauEssayage : compteur, places restantes (un échec ne compte pas), pilotes ; null si la base ne répond pas", async () => {
  const filtres: unknown[][] = [];
  const client = (rpc: unknown, vendeurs: unknown, erreur: "compteur" | "vendeurs" | null = null) =>
    ({
      rpc: async (nom: string) => (assert.equal(nom, "zabelie_essayage_compteur"), { data: rpc, error: erreur === "compteur" ? { message: "absente" } : null }),
      from: (table: string) => {
        assert.equal(table, "zabelie_essayage_vendeurs");
        const c = {
          select: () => c,
          eq: (col: string, v: unknown) => (filtres.push([col, v]), c),
          order: async () => ({ data: erreur === "vendeurs" ? null : vendeurs, error: erreur === "vendeurs" ? { message: "absente" } : null }),
        };
        return c;
      },
    }) as unknown as SupabaseClient;
  const ligne = { reussis: 10, en_cours: 2, echecs: 7, plafond: 15, quota: 5, pause: false, modifie: "2026-10-19T12:00:00Z" };
  const t = await lireTableauEssayage(client([ligne], [{ seller_id: VENDEUR, active_le: "2026-10-01T00:00:00Z", vendeur: { display_name: " Atelye Mod " } }, { seller_id: ADMIN, active_le: "2026-10-02T00:00:00Z", vendeur: null }]));
  assert.deepEqual(t, {
    compteur: { reussis: 10, enCours: 2, echecs: 7, plafond: 15, quota: 5, pause: false, modifie: "2026-10-19T12:00:00Z", reste: 3 },
    pilotes: [{ vendeurId: VENDEUR, nom: "Atelye Mod", depuis: "2026-10-01T00:00:00Z" }, { vendeurId: ADMIN, nom: ADMIN, depuis: "2026-10-02T00:00:00Z" }],
  });
  assert.deepEqual(filtres, [["actif", true]], "seuls les pilotes actifs");
  assert.equal((await lireTableauEssayage(client([{ ...ligne, plafond: 5 }], [])))?.compteur.reste, 0, "jamais négatif");
  assert.equal(await lireTableauEssayage(client(null, [], "compteur")), null);
  assert.equal(await lireTableauEssayage(client([ligne], [], "vendeurs")), null, "liste des pilotes illisible");
  assert.equal(await lireTableauEssayage(client([], [])), null);
});

const sansCommentaires = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/^\s*\/\*[\s\S]*?\*\//gm, " ").replace(/^\s*\/\/[^\n]*/gm, " ");

test("EA9 — la page : réservée à l'admin, au menu, et elle dit quand 0150 manque au lieu de casser", () => {
  const page = sansCommentaires(readFileSync("app/admin/essayage/page.tsx", "utf8"));
  assert.match(page, /const user = await getAdminUser\(\);\s*if \(!user \|\| user\.role !== "admin"\) \{\s*return \(/);
  assert.ok(page.indexOf("getAdminUser()") < page.indexOf("createAdminClient()"), "le client service seulement après le contrôle");
  assert.match(page, /\{tableau \? \(\s*<EssayageAdmin/);
  assert.match(page, /\.eq\("role", "creator"\)/);
  // AdminShell n'affiche le menu admin qu'avec le nom de l'administrateur.
  assert.match(page, /<AdminShell title="Essayage virtuel" actif="\/admin\/essayage" userName=\{user\.displayName\}>/);
  const menu = readFileSync("components/admin/menu-badges.tsx", "utf8");
  assert.match(menu, /\{ label: "Essayage", href: "\/admin\/essayage", cle: null \}/);
});
