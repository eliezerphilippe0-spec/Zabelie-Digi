import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Seed niveau 3 (0077, V-3 docs/35) — les invariants du fichier, vérifiables
 * sans base : slugs uniques (une collision serait avalée par `on conflict`
 * en silence), parents existants dans le seed niveau 2, aucune activation.
 */

const SQL = readFileSync("supabase/migrations/0077_taxonomie_niveau3.sql", "utf8");
const LIGNES = [...SQL.matchAll(
  /\('([a-z0-9-]+)', '([a-z0-9-]+)', '((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', (\d+)\)/g
)];

test("0077 : au moins 450 lignes de seed, slugs tous uniques", () => {
  assert.ok(LIGNES.length >= 450, `${LIGNES.length} lignes trouvées`);
  const slugs = LIGNES.map((m) => m[2]);
  assert.equal(new Set(slugs).size, slugs.length, "slug en double — on conflict avalerait");
});

test("0077 : chaque parent référencé est un slug de niveau 2 CONNU du dépôt", () => {
  // La liste vit dans 0035 (+ seed initial) — on la reconstruit depuis les
  // migrations : tout slug inséré avec level 2. Approximation robuste : les
  // parents du seed doivent apparaître quelque part dans les migrations.
  const migrations = readFileSync("supabase/migrations/0035_categories.sql", "utf8");
  const parents = [...new Set(LIGNES.map((m) => m[1]))];
  for (const p of parents) {
    assert.ok(
      migrations.includes(`'${p}'`),
      `parent « ${p} » introuvable dans 0035 — la jointure l'avalerait en silence`
    );
  }
});

test("0077 : tout entre INACTIF, et rien n'écrase l'existant", () => {
  assert.match(SQL, /select p\.id, 3, v\.slug, v\.fr, v\.kr, v\.en, false, v\.pos/);
  assert.match(SQL, /on conflict \(slug\) do nothing/);
  // Aucune activation nulle part dans ce fichier.
  assert.ok(!/set active|active = true/.test(SQL), "un seed n'active rien");
});
