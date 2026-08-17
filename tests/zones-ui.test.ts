import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cheminZone, libelleZone, type Zone } from "../lib/zones";

/**
 * PR-Z3 — l'UI des zones (`docs/33` §4). Deux étages de gardes :
 *
 *   1. Les helpers PURS (`cheminZone`, `libelleZone`) — connu-positif ET
 *      connu-négatif.
 *   2. Les COMMANDES, fichier par fichier : la validation de cohérence de la
 *      cascade GET, la dérivation de la zone active, l'envoi de `zone_id`
 *      dans le POST profil, la traduction du refus ZB069 en 400. Assertions
 *      sur la condition et l'appel, jamais sur un libellé seul.
 */

const Z = (
  id: string,
  parent_id: string | null,
  level: Zone["level"],
): Zone => ({
  id,
  parent_id,
  level,
  slug: id,
  label_kr: `kr-${id}`,
  label_fr: `fr-${id}`,
  label_en: null,
  label_es: null,
});

const ZONES: Zone[] = [
  Z("nord", null, "depatman"),
  Z("okap", "nord", "komin"),
  Z("carenage", "okap", "katye"),
  Z("ouest", null, "depatman"),
];

test("cheminZone — connu-POSITIF : katye → [depatman, komin, katye], dans l'ordre", () => {
  assert.deepEqual(
    cheminZone(ZONES, "carenage").map((z) => z.id),
    ["nord", "okap", "carenage"],
  );
});

test("cheminZone — connu-NÉGATIF : zone inconnue → [], jamais un chemin inventé", () => {
  assert.deepEqual(cheminZone(ZONES, "fantome"), []);
});

test("cheminZone — un cycle TERMINE", () => {
  const cyclique: Zone[] = [Z("a", "b", "komin"), Z("b", "a", "komin")];
  const chemin = cheminZone(cyclique, "a");
  assert.ok(chemin.length <= 2, "le cycle aurait dû être borné");
});

test("libelleZone — kreyòl direct, en/es replient sur le français, jamais vide", () => {
  const z = ZONES[0];
  assert.equal(libelleZone(z, "ht"), "kr-nord");
  assert.equal(libelleZone(z, "fr"), "fr-nord");
  assert.equal(libelleZone(z, "en"), "fr-nord"); // label_en null → fr
  assert.equal(libelleZone(z, "es"), "fr-nord"); // label_es null → fr
});

// ── Les commandes, fichier par fichier ──────────────────────────────────────

const CATALOGUE = readFileSync("app/catalogue/page.tsx", "utf8");
const FORM = readFileSync("components/profile-form.tsx", "utf8");
const API = readFileSync("app/api/profile/route.ts", "utf8");
const CREATORS = readFileSync("lib/creators.ts", "utf8");

test("catalogue — la cascade GET est VALIDÉE avant de filtrer (l'enfant périmé meurt)", () => {
  assert.match(
    CATALOGUE,
    /zk && zones\.some\(\(z\) => z\.id === zk && z\.parent_id === zd\)/,
    "un zk qui n'appartient pas au zd soumis doit être ignoré",
  );
  assert.match(
    CATALOGUE,
    /const zoneId = zqValide \|\| zkValide \|\| zd \|\| undefined/,
    "la zone active doit être la plus profonde VALIDÉE",
  );
});

test("catalogue — la zone atteint la requête produits", () => {
  assert.match(
    CATALOGUE,
    /getPublishedProductsPage\(\{[^}]*zoneId,/s,
    "zoneId ne part plus vers getPublishedProductsPage",
  );
});

test("profil — le POST envoie TOUJOURS zone_id, komin minimum", () => {
  assert.match(
    FORM,
    /zone_id: zq \|\| zk \|\| ""/,
    "la zone envoyée doit être la plus profonde choisie, komin minimum — " +
      "un depatman seul vaut « pas de zone »",
  );
});

test("api/profile — zone_id toujours dans l'UPDATE (le trigger 0069 arbitre la cohérence)", () => {
  assert.match(
    API,
    /zone_id: rawZone \|\| null/,
    "zone_id doit partir dans l'UPDATE même vide — c'est ce qui déclenche le trigger",
  );
  assert.match(
    API,
    /ZB069[\s\S]{0,200}status: 400/,
    "le refus ZB069 du garde doit devenir un 400 (erreur de saisie), pas un 500",
  );
});

test("fiche créateur — la zone lue en base et le chemin affiché", () => {
  /* Les colonnes vivent désormais dans la constante `COLONNES` (la sélection
     est devenue tolérante à `boutik_slug`, absent avant `0083`), et le rendu
     dans `components/boutique-vue.tsx`, partagé par les deux adresses. Ce que
     l'assertion vérifie n'a pas changé — seulement où le regarder. */
  assert.match(
    CREATORS,
    /const COLONNES =\s*\n?\s*"id, display_name, bio, avatar_url, zone_id, pwen_repe";/,
    "getCreator ne lit plus zone_id/pwen_repe",
  );
  const VUE = readFileSync("components/boutique-vue.tsx", "utf8");
  assert.match(
    VUE,
    /cheminZone\(await getZonesActives\(\), creator\.zoneId\)/,
    "la vitrine ne remonte plus le chemin de la zone",
  );
  assert.match(VUE, /libelleZone\(z, lang\)/, "le chemin doit être affiché, pas seulement calculé");
});
