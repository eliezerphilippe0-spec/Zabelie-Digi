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

/**
 * LE SECOND ANGLE MORT — mesuré en production le 2026-09-05.
 *
 * Le croisement ci-dessus regarde les SLUGS : deux slugs égaux, une ligne
 * avalée. Il ne regarde pas les LIBELLÉS : deux slugs différents pour le même
 * concept sous le même parent, et `on conflict (slug)` n'a rien à dire — la
 * seconde ligne entre, dormante, et attend son activation pour apparaître en
 * double dans la barre de facettes. Sept cas en base : `luil-mote` à côté de
 * `luil-motè`, `frenaj-moto` à côté de `fren-moto`, `foto-videyo` à côté de
 * `foto-ak-videyo`… La vague 1 (0035, 0057) avait choisi un slug ; 0077 en a
 * dérivé un autre du même libellé.
 *
 * Ce test croise (parent, label_fr) entre le socle et le seed 0077, et exige
 * que l'intersection soit EXACTEMENT la liste que `0096` retire — dans les
 * deux sens : une collision de plus est un nouveau doublon à retirer, une de
 * moins est une exemption périmée. Et `0096` doit nommer chacun des sept.
 */
const DOUBLONS_0096 = [
  "filtrasyon",
  "foto-videyo",
  "frenaj-moto",
  "luil-mote",
  "marketing-rezo-sosyal",
  "pwoteksyon-sole",
  "sewom",
];

/**
 * Sous-catégories de niveau 3 semées AVANT 0077 : leurs clés (parent slug,
 * label_fr) et leurs slugs. Les slugs servent à ÉCARTER les lignes de 0077 que
 * `on conflict (slug)` a déjà avalées — celles-là ne doublent rien, elles
 * n'existent pas.
 */
function libellesDuSocle(): { cles: Set<string>; slugs: Set<string> } {
  const cles = new Set<string>();
  const slugs = new Set<string>();
  // 0035 — bloc niveau 3 : ('parent','slug','kr','fr','en',pos)
  const socle = readFileSync("supabase/migrations/0035_categories.sql", "utf8");
  let n35 = 0;
  for (const bloc of socle.split("insert into zabelie_categories").slice(1)) {
    const corps = bloc.split(";")[0];
    if (!/v\.slug,\s*3,/.test(corps)) continue;
    for (const m of corps.matchAll(
      /\(\s*'([a-z0-9-]+)'\s*,\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d+)\s*\)/g
    )) {
      cles.add(`${m[1]}|${m[4]}`);
      slugs.add(m[2]);
      n35++;
    }
  }
  // 0057 — feuilles de service : ('slug', 'kr', 'fr', 'en', rang), parent fixe.
  const services = readFileSync("supabase/migrations/0057_categories_services.sql", "utf8");
  let n57 = 0;
  for (const m of services.matchAll(
    /\(\s*'([^']+)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d+)\s*\)/g
  )) {
    cles.add(`sevis-pwofesyonel|${m[3]}`);
    slugs.add(m[1]);
    n57++;
  }
  // 0051 — une seule feuille, écrite en clair.
  cles.add("pwodwi-lokal|Clairin");
  slugs.add("klerin");
  // Un croisement à moitié aveugle passerait pour vert : on exige le volume —
  // 33 feuilles en vague 1 (0035, le compte du journal d'OPS_TODO), 12 en 0057.
  assert.equal(n35, 33, `extraction niveau 3 de 0035 cassée (${n35} tuples, 33 attendus)`);
  assert.equal(n57, 12, `extraction de 0057 cassée (${n57} tuples, 12 attendus)`);
  return { cles, slugs };
}

test("0077 × socle : les doublons de LIBELLÉ sous un même parent sont exactement ceux que 0096 retire", () => {
  const socle = libellesDuSocle();
  const collisions = LIGNES
    // même slug → avalée par on conflict, pas un doublon ; même (parent,
    // libellé) sous un AUTRE slug → la jumelle dormante qu'on cherche.
    .filter((m) => !socle.slugs.has(m[2]) && socle.cles.has(`${m[1]}|${m[3]}`))
    .map((m) => m[2])
    .sort();
  assert.deepEqual(
    collisions,
    DOUBLONS_0096,
    "l'intersection (parent, label_fr) entre 0077 et le socle a changé — " +
      "un doublon de plus se retire par migration, un de moins retire son exemption ici"
  );

  const m0096 = readFileSync(
    "supabase/migrations/0096_taxonomie_doublons_registre_0094_0095.sql",
    "utf8"
  );
  // La liste de retrait de 0096, telle que le SQL la COMMANDE (le `in (…)` du
  // delete), pas un slug cité en commentaire.
  const retrait = /where c\.slug in \(([\s\S]*?)\)\s*and c\.level = 3/.exec(m0096);
  assert.ok(retrait, "0096 : bloc `where c.slug in (…) and c.level = 3` introuvable");
  const nommes = [...retrait![1].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(nommes, DOUBLONS_0096, "0096 ne retire pas exactement les sept doublons");
  // Et le garde qui empêche le huitième : index unique, nulls not distinct.
  assert.match(
    m0096,
    /create unique index if not exists zabelie_categories_parent_label_fr_key\s+on zabelie_categories \(parent_id, label_fr\) nulls not distinct;/
  );
});
