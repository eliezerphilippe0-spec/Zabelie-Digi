import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { surveillerFile, SEUIL_ALERTE, FILE_AFFICHEE } from "../lib/file-attente";

/**
 * FIL DE DÉTENTE SUR LES FILES ADMIN (2026-08-16).
 *
 * Les files Zelle et topup sont bornées à 50 lignes affichées. Au-delà, un
 * paiement en attente peut n'apparaître JAMAIS à l'admin — risque réel, mais
 * théorique tant que la file est courte. Ce fil prévient AVANT, plutôt que
 * d'attendre que la pagination admin soit construite.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ADMIN = readFileSync("app/admin/page.tsx", "utf8");
const ADMIN_CODE = sansCommentaires(ADMIN);

async function sansBruit<T>(f: () => T): Promise<[T, string]> {
  const vrai = console.log;
  let sortie = "";
  console.log = (...a: unknown[]) => {
    sortie += a.map(String).join(" ") + "\n";
  };
  try {
    return [f(), sortie];
  } finally {
    console.log = vrai;
  }
}

// ── Les trois régimes ──────────────────────────────────────────────────────

test("sous le seuil : aucune alerte, et surtout AUCUN bruit", async () => {
  /* Un avertissement permanent cesse d'être lu. Cette file est vide la
   * plupart du temps — c'est le régime normal, il doit être silencieux. */
  const [e, journal] = await sansBruit(() => surveillerFile("test", SEUIL_ALERTE - 1));
  assert.equal(e.alerte, false);
  assert.equal(e.tronquee, false);
  assert.equal(journal, "");
});

test("AU seuil exact : l'alerte part — la frontière est inclusive", async () => {
  // `>` au lieu de `>=` laisserait passer le seuil pile. C'est l'erreur de ±1
  // qui fait qu'un fil de détente ne se détend jamais.
  const [e, journal] = await sansBruit(() => surveillerFile("admin.zelle", SEUIL_ALERTE));
  assert.equal(e.alerte, true);
  assert.equal(e.tronquee, false, "on prévient AVANT que ça tronque");
  assert.match(journal, /"code":"ZB086"/);
  assert.match(journal, /"issue":"file_approche_du_plafond"/);
  assert.match(journal, /"file":"admin\.zelle"/);
});

test("au-delà du plafond : des lignes sont INVISIBLES, et ça se dit autrement", async () => {
  const [e, journal] = await sansBruit(() => surveillerFile("admin.zelle", FILE_AFFICHEE + 7));
  assert.equal(e.tronquee, true);
  assert.equal(e.alerte, true);
  assert.match(journal, /"issue":"file_tronquee"/);
  assert.equal(e.total - e.affichees, 7, "le nombre de lignes perdues est calculable");
});

test("le plafond exact n'est PAS encore une troncature", () => {
  assert.equal(surveillerFile("test", FILE_AFFICHEE).tronquee, false);
  assert.equal(SEUIL_ALERTE < FILE_AFFICHEE, true, "prévenir avant, jamais après");
});

// ── La SOURCE du compte — c'est là que tout se joue ────────────────────────

test("le compte vient du COUNT, jamais de la longueur du tableau plafonné", () => {
  /* Le piège de la sonde qui regarde à côté : `zelleQueue.length` est borné à
   * 50 par construction, donc il ne peut pas dépasser un seuil de 35 sans
   * être déjà tronqué — et il ne pourrait JAMAIS dire de combien. Une alerte
   * alimentée par `.length` serait décorative. */
  assert.match(
    ADMIN_CODE,
    /surveillerFile\("admin\.zelle", zelleCountRes\.count \?\? zelleQueue\.length\)/
  );
  assert.match(
    ADMIN_CODE,
    /surveillerFile\("admin\.topup", topupCountRes\.count \?\? topupQueue\.length\)/
  );
});

test("le repli SOUS-estime — il peut manquer une alerte, jamais en inventer", () => {
  /* `?? .length` : si le count échoue, on retombe sur une valeur forcément
   * inférieure ou égale au réel. Un repli sur une CONSTANTE (`?? 0`, `?? 50`)
   * inventerait un chiffre — muet dans un cas, criant au loup dans l'autre.
   * L'assertion est bornée aux deux appels : `pendingRes.count ?? 0` ailleurs
   * dans ce fichier est un autre usage, légitime, qui n'alimente aucun fil. */
  const appels = [...ADMIN_CODE.matchAll(/surveillerFile\([^)]*\)/g)].map((m) => m[0]);
  assert.equal(appels.length, 2, "deux files surveillées");
  for (const a of appels) {
    assert.match(a, /Res\.count \?\? \w+Queue\.length\)$/, `repli non conforme : ${a}`);
  }
});

// ── Les filtres recopiés, croisés — sinon le compteur compte autre chose ───

/** Extrait les appels de filtre PostgREST d'un bloc de requête. */
function filtres(bloc: string): string[] {
  // Le `)` retenu est celui que suit une fin de ligne : sinon le `)` INTERNE
  // de `.or("and(rail.eq.zelle,…)")` couperait le filtre en deux.
  return [...bloc.matchAll(/\.(eq|or|in|neq|gt|lt|is)\(([\s\S]*?)\)(?=,?\s*\n)/g)].map(
    (m) => `${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`
  );
}

/**
 * Découpe le bloc qui commence à `debut` et s'arrête au premier `fin`.
 *
 * ⚠️ L'ancre doit être UNIQUE, et l'ambiguïté échoue bruyamment. Première
 * version de ce test : l'ancre `.select("*", { count: "exact", head: true })`
 * existait DÉJÀ pour le compteur `pendingRes`, plus haut dans le fichier —
 * `indexOf` a rendu ce bloc-là et la comparaison portait sur une requête sans
 * rapport. Zéro occurrence et deux occurrences sont deux fautes différentes,
 * toutes deux silencieuses si on ne les distingue pas.
 */
function bloc(src: string, debut: string, fin: string): string {
  const n = src.split(debut).length - 1;
  assert.equal(n, 1, `ancre non unique (${n}×) : ${debut}`);
  const i = src.indexOf(debut);
  const j = src.indexOf(fin, i);
  assert.notEqual(j, -1, `fin introuvable après ${debut}`);
  return src.slice(i, j);
}

test("le COUNT porte exactement les mêmes filtres que la LISTE — Zelle", () => {
  /* Une divergence de filtre rendrait le compteur muet sur précisément les
   * lignes qui manquent : il compterait une autre population que celle
   * affichée, et l'alerte ne partirait pas quand il le faut. Même idiome que
   * les constantes du cookie `?ref=` recopiées dans `proxy.ts`. */
  const liste = bloc(ADMIN_CODE, `.select("order_id, expected_usd_cents`, ".limit(50)");
  // Ancre désambiguïsée par `.eq("rail", "zelle")` : le compteur `pendingRes`
  // porte le même `.select("*", { count … })` sans ce filtre.
  const compte = bloc(
    ADMIN_CODE,
    `.select("*", { count: "exact", head: true })\n        .eq("rail", "zelle")`,
    "admin\n        .from(\"zabelie_topup_orders\")"
  );
  assert.deepEqual(filtres(compte), filtres(liste));
  assert.ok(filtres(liste).length > 0, "un jeu de filtres vide validerait n'importe quoi");
});

test("le COUNT porte exactement les mêmes filtres que la LISTE — topup", () => {
  const liste = bloc(ADMIN_CODE, `"id, status, rail, operator, beneficiary_phone`, ".limit(50)");
  const compte = bloc(
    ADMIN_CODE,
    `.from("zabelie_topup_orders")\n        .select("*", { count: "exact", head: true })`,
    "admin\n        .from(\"profiles\")"
  );
  assert.deepEqual(filtres(compte), filtres(liste));
  assert.ok(filtres(liste).length > 0);
});

// ── L'écran ────────────────────────────────────────────────────────────────

test("l'écran ne dit rien sous le seuil, et distingue les deux situations", () => {
  assert.match(ADMIN_CODE, /if \(!etat\.alerte\) return null;/);
  // Les deux messages appellent des gestes opposés : construire la pagination
  // d'un côté, aller chercher les demandes invisibles de l'autre.
  assert.match(ADMIN_CODE, /etat\.tronquee\s*\n?\s*\? `⚠️ \$\{etat\.total\}/);
  assert.match(ADMIN_CODE, /ne sont visibles nulle part/);
});

test("les deux files portent le fil — pas seulement celle qu'on avait en tête", () => {
  const montages = [...ADMIN_CODE.matchAll(/<AlerteFile etat=\{(\w+)\}/g)].map((m) => m[1]);
  assert.deepEqual(montages.sort(), ["topupFile", "zelleFile"]);
});
