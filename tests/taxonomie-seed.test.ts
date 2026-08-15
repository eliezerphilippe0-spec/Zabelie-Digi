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

/**
 * L'ANGLE MORT MESURÉ EN PRODUCTION, le 2026-08-15.
 *
 * Le test ci-dessus vérifiait l'unicité DANS le seed. Or `slug` est unique
 * sur TOUTE la table `zabelie_categories`, tous niveaux confondus : une
 * sous-catégorie dont le slug est déjà celui d'un DÉPARTEMENT ou d'un RAYON
 * est avalée par `on conflict do nothing` — sans erreur, sans trace.
 *
 * C'est arrivé : 468 lignes semées, 452 insérées. Quinze absences étaient des
 * collisions de CONCEPT voulues (la vague 1 garde sa ligne et son état) ; la
 * seizième était « Sacs de voyage », dont le slug `sak-vwayaj` est celui de
 * son propre parent de niveau 2 (« Bagagerie »). Un seed qui perd une ligne
 * en silence est exactement la classe de défaut que ce dépôt traque — d'où
 * ce croisement, écrit APRÈS coup et donc éprouvé sur un cas réel.
 *
 * ⚠️ L'exemption se périme dans les deux sens : si `sak-vwayaj` cesse d'être
 * une collision (slug corrigé par une migration ultérieure), ce test échoue
 * aussi — pour forcer le retrait de l'exemption dans le même geste.
 */
const COLLISIONS_CONNUES = new Map([
  [
    "sak-vwayaj",
    "slug du rayon niveau 2 « Bagagerie » (0035) — la sous-catégorie « Sacs " +
      "de voyage » a été avalée à l'application de 0077 (2026-08-15). " +
      "Réparation proposée : 0078, rédigée non appliquée.",
  ],
]);

test("0077 : aucun slug de seed ne collisionne un slug de niveau 1 ou 2 (hors exemptions datées)", () => {
  const socle = readFileSync("supabase/migrations/0035_categories.sql", "utf8");
  /* Le niveau ne se lit pas au même endroit selon le bloc : au niveau 1 il
   * est DANS le tuple (`('otomobil-moto', 1, …)`), aux niveaux 2 et 3 il est
   * dans le `select` qui consomme le `values` (`select p.id, v.slug, 2, …`).
   * Un regex unique ne voyait donc que les 16 départements — et l'assertion
   * de volume ci-dessous est ce qui l'a dit, au lieu de laisser un
   * croisement à moitié aveugle passer pour vert. */
  const prisParLeSocle = new Set<string>();
  for (const bloc of socle.split("insert into zabelie_categories").slice(1)) {
    const corps = bloc.split(";")[0];
    const niveau = /v\.slug,\s*2,/.test(corps)
      ? 2
      : /v\.slug,\s*3,/.test(corps)
        ? 3
        : 1;
    if (niveau === 3) continue; // une collision avec le niveau 3 est un
    // doublon de concept (voulu, la vague 1 garde sa ligne) — pas une perte
    // structurelle : c'est le niveau 1/2 qui avale une sous-catégorie.
    //
    // ⚠️ La position du slug CHANGE avec le niveau : au niveau 1 c'est le
    // premier champ du tuple, aux niveaux 2 et 3 le premier champ est le
    // slug du PARENT et le slug propre vient en deuxième. Prendre le premier
    // partout « marchait » — 74 correspondances dans le bloc 2 — mais
    // collectait seize fois les mêmes départements. Le compte attendu est ce
    // qui l'a dit ; sans lui, ce croisement aurait couvert 16 slugs sur 90
    // en se présentant comme vert.
    const motif =
      niveau === 1
        ? /\(\s*'([a-z0-9-]+)'\s*,/g
        : /\(\s*'[a-z0-9-]+'\s*,\s*'([a-z0-9-]+)'\s*,/g;
    for (const m of corps.matchAll(motif)) {
      prisParLeSocle.add(m[1]);
    }
  }
  assert.ok(
    prisParLeSocle.size > 50,
    `extraction des slugs du socle cassée (${prisParLeSocle.size} trouvés)`
  );

  const collisions = LIGNES.map((m) => m[2]).filter((s) => prisParLeSocle.has(s));

  for (const s of collisions) {
    assert.ok(
      COLLISIONS_CONNUES.has(s),
      `NOUVELLE collision de slug « ${s} » avec un niveau 1/2 — la ligne serait ` +
        `avalée en silence par on conflict. Changer le slug du seed, pas cette liste.`
    );
  }
  for (const s of COLLISIONS_CONNUES.keys()) {
    assert.ok(
      collisions.includes(s),
      `« ${s} » n'est plus une collision — retirer l'exemption dans le même geste.`
    );
  }
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
