import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { REFUS_ESSAYAGE, SOUS_RAYONS_ESSAYAGE } from "../lib/essayage/regles";

/**
 * ESSAYAGE VIRTUEL — la migration 0150 et le code disent la même chose
 * (tasks/essayage-todo.md 3.1 et 3.2). Les vrais contrôles tournent en base
 * (`supabase/tests/zabelie_essayage.test.sql`, CI `sql-tests`) ; ce test-ci
 * attrape une divergence AVANT la CI, et sur un poste sans PostgreSQL.
 */

const SQL = readFileSync("supabase/migrations/0150_zabelie_essayage.sql", "utf8");
const sansCommentaires = SQL.replace(/--[^\n]*/g, "");
const TABLES = ["config", "vendeurs", "rayons", "essais", "expositions"].map((t) => `public.zabelie_essayage_${t}`);
const FONCTIONS = ["eligible(uuid, uuid)", "reserver(uuid, uuid, text)", "lancer(uuid, text)", "terminer(uuid, text, text)", "exposer(uuid, uuid, text)"].map((f) => `public.zabelie_essayage_${f}`);

test("M1 — la migration amorce EXACTEMENT les sous-rayons de lib/essayage/regles.ts", () => {
  const liste = /and c\.slug in \(([^)]*)\)/.exec(sansCommentaires);
  assert.ok(liste, "liste des sous-rayons introuvable");
  const slugs = [...liste[1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(slugs, Object.keys(SOUS_RAYONS_ESSAYAGE).sort());
  assert.match(sansCommentaires, /parent\.slug in \('rad-fanm', 'rad-gason', 'rad-espo'\)/);
  assert.match(sansCommentaires, /<> 15 then\s+raise exception/, "fermé par défaut si l'arbre ne rend pas les quinze");
});

test("M2 — chaque table a sa RLS, et aucun client n'y a droit", () => {
  for (const t of TABLES) {
    assert.match(sansCommentaires, new RegExp(`alter table ${t.replace(".", "\\.")} enable row level security;`), t);
    assert.ok(sansCommentaires.includes(t), t);
  }
  assert.match(sansCommentaires, /revoke all on public\.zabelie_essayage_config, [\s\S]*?from public, anon, authenticated, service_role;/);
  assert.doesNotMatch(sansCommentaires, /grant [^;]* to [^;]*\b(anon|authenticated|public)\b/i, "aucun droit pour les clients");
  assert.doesNotMatch(sansCommentaires, /create policy/i, "aucune politique : rien pour les clients");
  // Essais et expositions ne s'écrivent que par les fonctions.
  assert.doesNotMatch(sansCommentaires, /grant [^;]*(insert|update|delete)[^;]* on public\.zabelie_essayage_(essais|expositions)/);
});

test("M3 — chaque fonction est security definer, à search_path figé, retirée à tous, accordée au rôle service seul", () => {
  for (const f of FONCTIONS) {
    const nom = f.split("(")[0];
    const corps = new RegExp(`create function ${nom.replace(".", "\\.")}\\([^)]*\\)[\\s\\S]*?language (sql|plpgsql)[^\\n]*security definer set search_path = public, pg_temp as`);
    assert.match(sansCommentaires, corps, `${nom} : security definer et search_path`);
    assert.ok(sansCommentaires.includes(`revoke all on function ${f} from public, anon, authenticated;`), `${f} : revoke`);
    assert.ok(sansCommentaires.includes(`grant execute on function ${f} to service_role;`), `${f} : grant`);
  }
});

test("M4 — les refus rendus par la base sont des codes connus du code", () => {
  const rendus = [...sansCommentaires.matchAll(/select null::uuid, '([a-z_]+)'::text/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(rendus)].sort(), ["non_eligible", "pause", "plafond", "quota"]);
  for (const r of rendus) assert.ok((REFUS_ESSAYAGE as readonly string[]).includes(r), r);
});

test("M5 — aucune colonne ne peut tenir une photo, une URL ou un résultat", () => {
  const tables = [...sansCommentaires.matchAll(/create table public\.zabelie_essayage_\w+ \(([\s\S]*?)\n\);/g)].map((m) => m[1]);
  assert.equal(tables.length, 5);
  for (const corps of tables) assert.doesNotMatch(corps, /\b(photo|image|url|resultat|base64)\w*\s|bytea/i);
});

test("M6 — seul un essai échoué ne compte pas : un essai abandonné « en cours » compte (le fournisseur facture à la création)", () => {
  const comptes = [...sansCommentaires.matchAll(/select count\(\*\) into v_n from public\.zabelie_essayage_essais[\s\S]*?;/g)].map((m) => m[0]);
  assert.equal(comptes.length, 2, "plafond et quota");
  for (const c of comptes) {
    assert.match(c, /statut <> 'echec'/);
    assert.doesNotMatch(c, /interval/, "pas de délai qui ferait sortir un essai abandonné du compte");
  }
  assert.match(sansCommentaires, /pg_advisory_xact_lock\(hashtext\('zabelie_essayage_essais'\)\)/);
});
