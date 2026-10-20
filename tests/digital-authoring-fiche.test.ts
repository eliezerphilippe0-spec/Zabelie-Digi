import { test } from "node:test";
import assert from "node:assert/strict";

import { database, loadRoute } from "./helpers/route-harness";
import { borner, detailsDepuisGuide, studioDepuisGuide } from "../lib/digital-authoring/soumission";
import { DIGITAL_DETAIL_LIMITS } from "../lib/digital-details";
import * as collectionExport from "../lib/collection-export";

/**
 * Studio de création éditoriale — la fiche pré-remplie depuis le guide, et
 * le Studio dans l'export de compte (tâche 5.3).
 */

const v = (x: unknown) => JSON.parse(JSON.stringify(x));
const section = (titre: string, corps = "") => ({ id: crypto.randomUUID(), titre, resultat: "", corps });
const BRIEF = { resultat: "Savoir fixer un prix", prerequis: "" };

test("F1 — détails numériques : format, langue, pages et sommaire, dans les limites du contrat", () => {
  const fr = detailsDepuisGuide({ langue: "fr", contenu: { objectif: "", sections: [section("Le prix"), section("  "), section("La marge")] } }, 12);
  assert.deepEqual(fr, { formats: "PDF", language: "Français", compatibility: "", license: "", contents: "12 pages\n• Le prix\n• La marge", updates: "" });
  // Sans nombre de pages connu : le sommaire seul, jamais « null pages ».
  assert.equal(detailsDepuisGuide({ langue: "ht", contenu: { objectif: "", sections: [section("Pri")] } }, null)?.contents, "• Pri");
  // Quarante longs titres : le contenu reste sous la limite du contrat existant.
  const long = detailsDepuisGuide({ langue: "fr", contenu: { objectif: "", sections: Array.from({ length: 40 }, (_, i) => section(`Section ${i} ${"x".repeat(80)}`)) } }, 300);
  assert.ok(long && long.contents.length <= DIGITAL_DETAIL_LIMITS.contents && long.contents.endsWith("…"));
  // Un caractère refusé par le contrat : rien n'est écrit plutôt qu'une fiche invalide.
  assert.equal(detailsDepuisGuide({ langue: "fr", contenu: { objectif: "", sections: [section(`Ti${String.fromCodePoint(7)}tre`)] } }, 3), null);
});

test("F2 — atelier : l'aperçu reprend la première section (celle de l'extrait), et rien d'autre", () => {
  const a = studioDepuisGuide({
    brief: { ...BRIEF, prerequis: "Un téléphone" } as never,
    contenu: { objectif: "", sections: [section("Commencer", "Premier pas."), section("Suite", "Ne doit pas paraître.")] },
  });
  assert.deepEqual(v(a), {
    mode: "file", preview: "Commencer\n\nPremier pas.", outcomes: "Savoir fixer un prix", prerequisites: "Un téléphone",
    include_updates: false, lessons: [], faq: [],
  });
  assert.equal(studioDepuisGuide({ brief: BRIEF as never, contenu: { objectif: "", sections: [] } })?.preview, "");
  const gros = studioDepuisGuide({ brief: BRIEF as never, contenu: { objectif: "", sections: [section("T", "mots ".repeat(2000))] } });
  assert.ok(gros && gros.preview.length <= 6000 && gros.preview.endsWith(" mots…"), "coupé à une fin de mot");
  assert.equal(borner("  court  ", 10), "court");
  assert.equal(borner("abcdefghijkl", 5), "abcd…", "sans espace utile : coupe franche");
});

function exportCompte(o: { erreur?: string; absente?: boolean } = {}) {
  const db = database((q) => {
    const studio = q.table.startsWith("zabelie_authoring_");
    if (studio && o.absente) return { data: null, error: { code: "42P01" } };
    if (studio && q.table === o.erreur) return { data: null, error: { code: "XX000" } };
    if (q.table === "profiles" || q.table === "wallets") return { data: null, error: null };
    const rows = q.table === "zabelie_policy_acceptances"
      ? [{ policy_version: "cgu-v1", accepted_at: "2026-10-05T00:00:00Z" }]
      : q.table === "zabelie_authoring_projects" ? [{ id: "p1", titre: "Gid" }, { id: "p2", titre: "Dezyèm gid" }] : [];
    const [from, to] = (q.steps.find(([method]) => method === "range")?.[1] ?? [0, rows.length - 1]) as number[];
    return { data: rows.slice(from, Math.min(to + 1, from + 1)), count: rows.length, error: null };
  });
  class ExportResponse extends Response { static json = Response.json; }
  const route = loadRoute("app/api/account/export/route.ts", {
    "next/server": { NextResponse: ExportResponse },
    "@/lib/supabase/server": { createClient: async () => ({ ...db, auth: { getUser: async () => ({ data: { user: { id: "self", email: "self@test.local" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "@/lib/collection-export": collectionExport,
  });
  return { route, db };
}

test("F3 — l'export de compte contient le Studio du vendeur, et seulement le sien", async () => {
  const { route, db } = exportCompte();
  const r = await route.GET();
  assert.equal(r.status, 200);
  const corps = await r.json();
  assert.deepEqual(corps.studio_creation, { projets: [{ id: "p1", titre: "Gid" }, { id: "p2", titre: "Dezyèm gid" }], revisions: [], exports_pdf: [], suggestions: [] });
  for (const table of ["zabelie_authoring_projects", "zabelie_authoring_revisions", "zabelie_authoring_exports", "zabelie_authoring_operations"]) {
    const pages = db.queries.filter((x) => x.table === table);
    assert.equal(pages.length, table === "zabelie_authoring_projects" ? 2 : 1, `${table} lue jusqu'à son total`);
    for (const q of pages) {
      assert.deepEqual(v(q.steps.filter(([m]) => m === "eq")), [["eq", ["seller_id", "self"]]], `${table} bornée au vendeur sur chaque page`);
      const colonnes = String(q.steps.find(([m]) => m === "select")![1][0]);
      assert.doesNotMatch(colonnes, /\*|chemin|bail_jeton|seller_id/, `${table} : ni chemin de stockage, ni jeton, ni étoile`);
    }
  }
});

test("F4 — lecture du Studio ratée : 503 ; Studio jamais installé : export vide, pas d'erreur", async () => {
  for (const table of ["zabelie_authoring_projects", "zabelie_authoring_operations"]) {
    assert.equal((await exportCompte({ erreur: table }).route.GET()).status, 503, table);
  }
  const r = await exportCompte({ absente: true }).route.GET();
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).studio_creation, { projets: [], revisions: [], exports_pdf: [], suggestions: [] });
});
