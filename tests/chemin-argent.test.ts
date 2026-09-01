import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  sondeCheminArgent,
  alerteRequise,
  FENETRE_JOURS,
  type VerdictCheminArgent,
} from "../lib/money-path";

/**
 * LA SONDE DU CHEMIN D'ARGENT — éprouvée sur des cas connus-positifs ET
 * connus-négatifs, parce qu'un instrument qui n'a jamais échoué n'a pas encore
 * démontré qu'il pouvait.
 *
 * Les jeux d'essai ci-dessous ne sont pas inventés : ils reproduisent l'état
 * RÉEL mesuré en production le 2026-09-01 — 7 tentatives, 3 acheteurs
 * distincts, toutes en bac à sable, zéro encaissement. Une sonde écrite contre
 * un cas imaginaire prouve qu'elle gère le cas imaginaire.
 */

/** Client Supabase simulé : rend les lignes fournies, ou l'erreur fournie. */
function admin(
  lignes: unknown[] | null,
  erreur: { message: string } | null = null
) {
  const terminal = { data: lignes, error: erreur };
  const chaine = {
    select: () => chaine,
    gte: () => chaine,
    order: () => chaine,
    limit: () => Promise.resolve(terminal),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { from: () => chaine } as any;
}

const paiement = (o: {
  status: string;
  mode?: string | null;
  montant?: number;
  acheteur?: string;
  expire?: boolean;
  quand?: string;
}) => ({
  status: o.status,
  created_at: o.quand ?? "2026-08-22T20:03:07Z",
  confirmed_at: o.status === "confirmed" ? (o.quand ?? "2026-08-22T20:03:07Z") : null,
  raw: {
    ...(o.mode !== undefined ? { moncash_mode: o.mode } : {}),
    ...(o.expire ? { expired_reason: "moncash_unknown_48h" } : {}),
  },
  order: { amount_htg: o.montant ?? 300, buyer_id: o.acheteur ?? "a1" },
});

/** L'état réel de la production au 2026-09-01. */
const PRODUCTION_REELLE = [
  paiement({ status: "failed", mode: "sandbox", expire: true, acheteur: "a1" }),
  paiement({ status: "failed", mode: "sandbox", expire: true, acheteur: "a2" }),
  paiement({ status: "failed", mode: null, expire: true, acheteur: "a3" }),
  paiement({ status: "failed", mode: null, expire: true, acheteur: "a1" }),
  paiement({ status: "failed", mode: null, expire: true, acheteur: "a2" }),
  paiement({ status: "failed", mode: null, expire: true, acheteur: "a1" }),
  paiement({ status: "failed", mode: null, expire: true, acheteur: "a3" }),
  // Le rail gratuit de 0087 : confirmé, montant ZÉRO.
  paiement({ status: "confirmed", mode: null, montant: 0, acheteur: "a1" }),
];

test("M1 — l'état réel de la production rend « bac_a_sable »", async () => {
  const s = await sondeCheminArgent(admin(PRODUCTION_REELLE), "sandbox");
  assert.equal(s.verdict, "bac_a_sable");
  assert.equal(s.tentatives, 8);
  assert.equal(s.expires48h, 7);
  assert.equal(s.acheteursEnEchec, 3, "trois acheteurs distincts, pas un seul qui insiste");
  assert.equal(s.modesObserves.sandbox, 2);
  assert.equal(s.modesObserves.production, 0);
  assert.match(s.explication, /REDÉPLOYER/);
});

/* ───────────────────────────────────────────────────────────────────────────
 * M2 — LE CŒUR DE LA SONDE : un rail gratuit n'est pas un encaissement.
 *
 * `0087` confirme des commandes à 0 HTG sans qu'aucune gourde ne circule. Les
 * compter ferait passer le chemin d'argent pour éprouvé alors qu'il ne l'a
 * jamais été — et c'est exactement l'état de la production : un paiement
 * `confirmed` existe, et il vaut zéro.
 * ------------------------------------------------------------------------ */
test("M2 — un paiement confirmé à 0 HTG ne compte pas comme encaissement", async () => {
  const s = await sondeCheminArgent(
    admin([paiement({ status: "confirmed", mode: "production", montant: 0 })]),
    "production"
  );
  assert.equal(s.confirmes, 1, "il est bien confirmé");
  assert.equal(s.encaissementsReels, 0, "mais aucune gourde n'a circulé");
  assert.equal(s.verdict, "aucun_encaissement");
});

test("M3 — un encaissement réel rend « ok »", async () => {
  const s = await sondeCheminArgent(
    admin([paiement({ status: "confirmed", mode: "production", montant: 300 })]),
    "production"
  );
  assert.equal(s.verdict, "ok");
  assert.equal(s.encaissementsReels, 1);
});

/* ───────────────────────────────────────────────────────────────────────────
 * M4 — L'ORDRE DES VERDICTS. Le bac à sable passe AVANT le succès.
 *
 * Le cas le plus dangereux n'est pas « tout est cassé », c'est « une partie
 * marche » — une variable posée sur un seul environnement, un déploiement
 * partiel. Un chiffre vert y couvre une fuite.
 * ------------------------------------------------------------------------ */
test("M4 — un encaissement réel n'efface pas un paiement parti en bac à sable", async () => {
  const s = await sondeCheminArgent(
    admin([
      paiement({ status: "confirmed", mode: "production", montant: 300 }),
      paiement({ status: "failed", mode: "sandbox", expire: true }),
    ]),
    "production"
  );
  assert.equal(s.encaissementsReels, 1, "l'encaissement est bien compté");
  assert.equal(s.verdict, "bac_a_sable", "et il ne suffit pas à rendre le verdict vert");
});

test("M5 — annonce et constat qui divergent", async () => {
  const s = await sondeCheminArgent(
    admin([paiement({ status: "confirmed", mode: "production", montant: 300 })]),
    "sandbox"
  );
  assert.equal(s.verdict, "divergence");
});

test("M6 — aucune tentative ne se lit pas comme « tout va bien »", async () => {
  const s = await sondeCheminArgent(admin([]), "production");
  assert.equal(s.verdict, "aucune_tentative");
  assert.match(s.explication, /n'atteste que de l'absence de regard/);
  assert.equal(alerteRequise(s.verdict), false, "rien à alerter, mais rien de prouvé non plus");
});

/* ───────────────────────────────────────────────────────────────────────────
 * M7 — FAIL-OPEN, et `indetermine` N'EST PAS un verdict favorable.
 * ------------------------------------------------------------------------ */
test("M7 — une lecture en échec rend « indetermine », et alerte", async () => {
  const s = await sondeCheminArgent(admin(null, { message: "boum" }), "production");
  assert.equal(s.verdict, "indetermine");
  assert.equal(alerteRequise("indetermine"), true, "« je n'ai pas pu lire » doit alerter");
  assert.match(s.explication, /boum/);
});

test("M8 — la sonde ne lève jamais, même sur un client qui explose", async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const casse = { from: () => { throw new Error("client mort"); } } as any;
  const s = await sondeCheminArgent(casse, "production");
  assert.equal(s.verdict, "indetermine");
});

/* ───────────────────────────────────────────────────────────────────────────
 * M9 — LA JOINTURE EN TABLEAU. PostgREST rend une relation to-one tantôt en
 * objet, tantôt en tableau d'un élément. Sans normalisation, `order.amount_htg`
 * vaut `undefined` sur la forme tableau — donc 0, donc « aucun encaissement »
 * alors que l'argent est passé. Un verdict FAUX, en silence.
 * ------------------------------------------------------------------------ */
test("M9 — une jointure rendue en tableau est lue comme une jointure en objet", async () => {
  const enTableau = {
    ...paiement({ status: "confirmed", mode: "production", montant: 300 }),
    order: [{ amount_htg: 300, buyer_id: "a1" }],
  };
  const s = await sondeCheminArgent(admin([enTableau]), "production");
  assert.equal(s.encaissementsReels, 1, "le montant doit être lu à travers le tableau");
  assert.equal(s.verdict, "ok");
});

/* ───────────────────────────────────────────────────────────────────────────
 * M10 — CROISEMENT : la sonde a un appelant.
 *
 * `zabelie_purge_search_misses()` a vécu quatre mois, correcte et prouvée,
 * sans jamais tourner — parce que migration, tests et revue regardaient la
 * fonction, et rien ne regardait l'endroit d'où elle devait être appelée. Une
 * sonde d'observabilité sans appelant est le même défaut, à l'endroit exact
 * où il est le plus ironique.
 *
 * L'assertion porte sur l'APPEL et sur l'usage de son verdict, pas sur la
 * présence du nom quelque part dans le fichier.
 * ------------------------------------------------------------------------ */
test("M10 — la route de cohérence appelle la sonde ET agit sur son verdict", () => {
  const route = readFileSync(
    join(import.meta.dirname, "..", "app/api/admin/coherence/route.ts"),
    "utf8"
  );
  assert.match(
    route,
    /const cheminArgent = await sondeCheminArgent\(admin,[^)]*\)/,
    "la sonde doit être APPELÉE, pas seulement importée"
  );
  /* ⚠️ CETTE ASSERTION A ÉTÉ RÉÉCRITE APRÈS UN VERT QUI AURAIT DÛ ÊTRE ROUGE.
   *
   * Première version :
   *     /alerteRequise\(cheminArgent\.verdict\)[\s\S]{0,120}console\.error/
   *
   * Elle a SURVÉCU à la mutation `if (false && alerteRequise(…))`, qui rend
   * l'alerte inatteignable en laissant les deux fragments présents et voisins.
   * Son extrémité gauche était l'APPEL, pas la CONDITION — donc elle n'affirmait
   * qu'une adjacence de texte, exactement le défaut que `CLAUDE.md` décrit sous
   * « la régression de proximité », commis dans le test écrit pour l'éviter.
   *
   * La forme ci-dessous exige que le `if` s'ouvre DIRECTEMENT sur le prédicat :
   * ni `false &&` devant, ni `&& false` derrière. C'est la condition qui est
   * ancrée, pas son voisinage. La fenêtre n'a PAS été élargie — elle a été
   * resserrée sur ce qui commande. */
  assert.match(
    route,
    /if \(alerteRequise\(cheminArgent\.verdict\)\)\s*\{[\s\S]{0,80}console\.error/,
    "un verdict qui alerte doit produire une trace — sinon la sonde est muette"
  );
  assert.match(
    route,
    /cheminArgent,/,
    "le verdict doit sortir dans la réponse, pas seulement dans les journaux"
  );
});

test("M11 — la fenêtre de lecture est bornée et couvre largement le TTL de 48 h", () => {
  assert.ok(FENETRE_JOURS >= 7, "une fenêtre trop courte manquerait les expirations");
  assert.ok(FENETRE_JOURS <= 365, "une fenêtre non bornée scannerait tout l'historique");
});

test("M12 — tous les verdicts sauf ok/aucune_tentative appellent une alerte", () => {
  const tous: VerdictCheminArgent[] = [
    "aucune_tentative",
    "bac_a_sable",
    "divergence",
    "aucun_encaissement",
    "ok",
    "indetermine",
  ];
  const alertants = tous.filter(alerteRequise).sort();
  assert.deepEqual(alertants, [
    "aucun_encaissement",
    "bac_a_sable",
    "divergence",
    "indetermine",
  ]);
});
