import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  surveillerFile,
  bornesFile,
  pageDepuisParam,
  SEUIL_ALERTE,
  PAGE_FILE,
} from "../lib/file-attente";

/**
 * LES FILES D'ACTION ADMIN — paginées (2026-08-17).
 *
 * Avant : 50 lignes affichées, sans suite. Au-delà, un paiement Zelle en
 * attente pouvait n'apparaître JAMAIS à l'admin. Le fil de détente criait
 * « tronquée ».
 *
 * ⚠️ CE FICHIER A CHANGÉ DE SUJET EN MÊME TEMPS QUE SON MODULE, et c'est le
 * point : une file paginée ne peut plus tronquer. Un test qui aurait continué
 * de vérifier `tronquee === false` serait passé au vert pour toujours, sur un
 * défaut devenu impossible — le filet posé sur un chemin impraticable, à
 * l'envers. Le seuil surveille désormais l'ARRIÉRÉ, qui est le risque
 * restant : une file de 200 n'a rien d'invisible, et personne ne la vide.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const ADMIN = readFileSync("app/admin/page.tsx", "utf8");
const ADMIN_CODE = sansCommentaires(ADMIN);

// ── Les bornes ─────────────────────────────────────────────────────────────

test("les bornes sont INCLUSIVES aux deux bouts, comme .range()", () => {
  assert.deepEqual(bornesFile(1), [0, PAGE_FILE - 1]);
  assert.deepEqual(bornesFile(2), [PAGE_FILE, PAGE_FILE * 2 - 1]);
  assert.deepEqual(bornesFile(3), [PAGE_FILE * 2, PAGE_FILE * 3 - 1]);
});

test("une page absurde retombe sur la première, jamais sur un décalage négatif", () => {
  /* `range(-25, -1)` ne rend pas « rien » : il rend une fenêtre que personne
   * n'a demandée. Une URL retapée ne doit pas produire un écran plausible et
   * faux. */
  for (const p of [0, -3, Number.NaN]) {
    assert.deepEqual(bornesFile(p), [0, PAGE_FILE - 1], `page ${p}`);
  }
});

test("le paramètre d'URL est RELU, jamais cru", () => {
  assert.equal(pageDepuisParam("2"), 2);
  assert.equal(pageDepuisParam(undefined), 1);
  assert.equal(pageDepuisParam(""), 1);
  assert.equal(pageDepuisParam("0"), 1);
  assert.equal(pageDepuisParam("-4"), 1);
  assert.equal(pageDepuisParam("abc"), 1);
  assert.equal(pageDepuisParam("1e9"), 1, "notation exponentielle : parseInt lit 1");
});

// ── L'état de la file ──────────────────────────────────────────────────────

test("le nombre de pages se déduit du total, et vaut au moins 1", () => {
  assert.equal(surveillerFile("t", 0, 1).pages, 1, "une file vide reste page 1 sur 1");
  assert.equal(surveillerFile("t", 1, 1).pages, 1);
  assert.equal(surveillerFile("t", PAGE_FILE, 1).pages, 1);
  assert.equal(surveillerFile("t", PAGE_FILE + 1, 1).pages, 2, "la 26ᵉ ouvre la page 2");
});

test("une page au-delà de la dernière est ramenée dans les bornes", () => {
  const e = surveillerFile("t", PAGE_FILE + 1, 99);
  assert.equal(e.pages, 2);
  assert.equal(e.page, 2, "sinon le pied afficherait « page 99 sur 2 »");
});

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

test("sous le seuil : aucune alerte, et surtout AUCUN bruit", async () => {
  const [e, journal] = await sansBruit(() => surveillerFile("t", SEUIL_ALERTE - 1, 1));
  assert.equal(e.alerte, false);
  assert.equal(journal, "", "un avertissement permanent cesse d'être lu");
});

test("AU seuil exact : l'alerte part — la frontière est inclusive", async () => {
  // `>` au lieu de `>=` laisserait passer le seuil pile : un fil de détente
  // qui ne se détend jamais.
  const [e, journal] = await sansBruit(() => surveillerFile("admin.zelle", SEUIL_ALERTE, 1));
  assert.equal(e.alerte, true);
  assert.match(journal, /"code":"ZB086"/);
  assert.match(journal, /"issue":"arriere_au_dessus_du_seuil"/);
  assert.match(journal, /"file":"admin\.zelle"/);
});

// ── Les deux files, dans l'écran ───────────────────────────────────────────

test("plus aucun plafond dur sur les files d'action", () => {
  /* `.limit(50)` était le défaut : au-delà, les demandes les plus anciennes
   * sortaient de l'écran sans que rien ne le dise. */
  assert.match(ADMIN_CODE, /\.range\(\.\.\.bornesFile\(pageZelle\)\)/);
  assert.match(ADMIN_CODE, /\.range\(\.\.\.bornesFile\(pageTopup\)\)/);
  assert.ok(
    !/\.limit\(50\)/.test(ADMIN_CODE.slice(0, ADMIN_CODE.indexOf('from("profiles")'))),
    "les deux files ne doivent plus porter de plafond"
  );
});

test("le total vient du COUNT, jamais de la longueur de la PAGE", () => {
  /* Une page fait au plus 25 lignes : elle ne peut pas franchir un seuil de
   * 35, donc une alerte alimentée par `.length` ne partirait jamais. */
  assert.match(
    ADMIN_CODE,
    /surveillerFile\("admin\.zelle", zelleCountRes\.count \?\? zelleQueue\.length, pageZelle\)/
  );
  assert.match(
    ADMIN_CODE,
    /surveillerFile\("admin\.topup", topupCountRes\.count \?\? topupQueue\.length, pageTopup\)/
  );
});

test("une page par file — tourner l'une ne remet pas l'autre à zéro", () => {
  assert.match(ADMIN_CODE, /const pageZelle = pageDepuisParam\(sp\?\.zelle\)/);
  assert.match(ADMIN_CODE, /const pageTopup = pageDepuisParam\(sp\?\.topup\)/);
  // La LIAISON : le constructeur d'URL reporte la page de l'AUTRE file.
  assert.match(
    ADMIN_CODE,
    /const z = cle === "zelle" \? n : pageZelle;\s*\n\s*const t = cle === "topup" \? n : pageTopup;/
  );
  // Et la recherche par numéro survit au changement de page.
  assert.match(ADMIN_CODE, /if \(refQuery\) params\.set\("ref", refQuery\)/);
});

test("les deux files portent un pied, pas seulement celle qu'on avait en tête", () => {
  const montages = [...ADMIN_CODE.matchAll(/<PiedFile etat=\{(\w+)\}/g)].map((m) => m[1]);
  assert.deepEqual(montages.sort(), ["topupFile", "zelleFile"]);
});

test("le pied disparaît quand il n'y a qu'une page", () => {
  assert.match(ADMIN_CODE, /if \(etat\.pages <= 1\) return null;/);
  // Et les deux liens n'apparaissent qu'aux bons bords.
  assert.match(ADMIN_CODE, /\{etat\.page > 1 \? \(/);
  assert.match(ADMIN_CODE, /\{etat\.page < etat\.pages \? \(/);
});

test("les liens du pied respectent la cible tactile de 44 px", () => {
  assert.match(ADMIN_CODE, /const lien =\s*\n\s*"inline-flex min-h-11 items-center/);
});

// ── Les filtres recopiés, croisés ──────────────────────────────────────────

/** Extrait les appels de filtre PostgREST d'un bloc de requête. */
function filtres(bloc: string): string[] {
  return [...bloc.matchAll(/\.(eq|or|in|neq|gt|lt|is)\(([\s\S]*?)\)(?=,?\s*\n)/g)].map(
    (m) => `${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`
  );
}

/** Découpe entre deux ancres. L'ancre de début doit être UNIQUE. */
function bloc(src: string, debut: string, fin: string): string {
  const n = src.split(debut).length - 1;
  assert.equal(n, 1, `ancre non unique (${n}×) : ${debut}`);
  const i = src.indexOf(debut);
  const j = src.indexOf(fin, i);
  assert.notEqual(j, -1, `fin introuvable après ${debut}`);
  return src.slice(i, j);
}

test("le COUNT porte exactement les mêmes filtres que la LISTE — Zelle", () => {
  /* Une divergence rendrait le compteur muet sur précisément les lignes qui
   * manquent : il compterait une autre population que celle paginée, et
   * l'alerte ne partirait pas quand il le faut. */
  const liste = bloc(ADMIN_CODE, `.select("order_id, expected_usd_cents`, ".range(");
  const compte = bloc(
    ADMIN_CODE,
    `.select("*", { count: "exact", head: true })\n        .eq("rail", "zelle")`,
    'admin\n        .from("zabelie_topup_orders")'
  );
  assert.deepEqual(filtres(compte), filtres(liste));
  assert.ok(filtres(liste).length > 0, "un jeu de filtres vide validerait n'importe quoi");
});

test("le COUNT porte exactement les mêmes filtres que la LISTE — topup", () => {
  const liste = bloc(ADMIN_CODE, `"id, status, rail, operator, beneficiary_phone`, ".range(");
  const compte = bloc(
    ADMIN_CODE,
    `.from("zabelie_topup_orders")\n        .select("*", { count: "exact", head: true })`,
    'admin\n        .from("profiles")'
  );
  assert.deepEqual(filtres(compte), filtres(liste));
  assert.ok(filtres(liste).length > 0);
});
