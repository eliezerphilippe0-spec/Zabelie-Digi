import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Les trois correctifs de l'audit du 2026-10-28
 * (docs/REVUE-2026-10-28-audit-affiliation-transaction.md) :
 *
 *   SEC-01 — le DELETE de `affiliate-rate` vérifie le compte actif, comme le POST ;
 *   SEC-02 — aucun message de base ne sort de la route : un CODE pour le seul
 *            refus que le vendeur peut corriger, un message générique sinon ;
 *   UX-02  — un retour affirmatif après « Offrir » et « Retirer ».
 *
 * Assertions sur ce qui COMMANDE (garde, source du message, chemin de succès).
 * Chaque proximité porte sa liaison : un intervalle `[\s\S]{0,N}` seul n'est
 * qu'une adjacence de texte (CLAUDE.md, régression de proximité).
 */

const ROUTE = readFileSync("app/api/products/affiliate-rate/route.ts", "utf8");
const MANAGER = readFileSync("components/affiliation-manager.tsx", "utf8");
const MIG = readFileSync("supabase/migrations/0081_affiliation.sql", "utf8");

test("SEC-01 : le DELETE vérifie le compte actif AVANT de toucher au produit", () => {
  // Partir de la déclaration du DELETE : le premier `requireActiveAccount`
  // rencontré ensuite est le sien (le POST le précède dans le fichier).
  assert.match(
    ROUTE,
    /export async function DELETE[\s\S]*?requireActiveAccount\(user\.id\)[\s\S]*?produitDuVendeur\(/,
    "Un compte suspendu ne doit plus gérer ses offres."
  );
});

test("SEC-01 : le POST garde sa vérification (les deux verbes ont la même politique)", () => {
  assert.match(
    ROUTE,
    /export async function POST[\s\S]*?requireActiveAccount\(user\.id\)[\s\S]*?produitDuVendeur\(/
  );
});

test("SEC-02 : la route ne renvoie jamais le message de la base", () => {
  assert.doesNotMatch(ROUTE, /error:\s*error\.message/);
});

test("SEC-02 : le refus de bornes revient en CODE ZB081, statut 422", () => {
  assert.match(
    ROUTE,
    /\/ZB081\/\.test\(error\.message\)\)\s*\{\s*return NextResponse\.json\(\{ error: "Taux hors bornes\.", code: "ZB081" \}, \{ status: 422 \}\)/
  );
});

test("SEC-02 : le code cherché est bien celui que le trigger lève", () => {
  // La liaison : si le trigger change de code, la route ne reconnaîtrait plus
  // le refus et le vendeur lirait un message générique sans le savoir.
  assert.match(MIG, /raise exception 'ZB081: taux/);
});

test("SEC-02 : toute autre erreur est générique (500) et reste dans le journal", () => {
  assert.match(
    ROUTE,
    /console\.error\("\[affiliate-rate\] écriture échouée"[\s\S]{0,80}"Écriture impossible\."[\s\S]{0,40}status: 500/
  );
  assert.match(
    ROUTE,
    /console\.error\("\[affiliate-rate\] suppression échouée"[\s\S]{0,80}"Suppression impossible\."[\s\S]{0,40}status: 500/
  );
});

test("SEC-02 : le client lit le CODE et n'affiche jamais un texte venu du serveur", () => {
  assert.match(MANAGER, /data\?\.code === "ZB081"\s*\?\s*labels\.vHorsBornes/);
  assert.doesNotMatch(MANAGER, /data\?\.error/);
});

test("SEC-02 : le message de bornes reçoit les bornes de la page, dans les deux sens", () => {
  assert.match(MANAGER, /labels\.vHorsBornes\.replace\("\{min\}", String\(minPct\)\)\.replace\("\{max\}", String\(maxPct\)\)/);
});

test("UX-02 : « Offrir » confirme APRÈS le contrôle d'échec, pas avant", () => {
  // La liaison : `setOk` suit la fermeture du bloc d'échec (qui `return`).
  // Posé avant, il annoncerait « enregistré » à un refus.
  assert.match(
    MANAGER,
    /if \(!res\.ok\) \{[\s\S]{0,700}?return;\s*\}\s*setOk\(labels\.vEnregistre\);\s*router\.refresh\(\)/
  );
});

test("UX-02 : chaque confirmation n'est annoncée qu'UNE fois, au seul chemin de succès", () => {
  // Éprouvé par mutation : un second `setOk` posé AVANT le contrôle d'échec
  // laissait le test précédent vert, parce qu'il ne cherchait que la présence
  // du bon appel. L'unicité ferme cette porte.
  assert.equal((MANAGER.match(/setOk\(labels\.vEnregistre\)/g) ?? []).length, 1);
  assert.equal((MANAGER.match(/setOk\(labels\.vRetire\)/g) ?? []).length, 1);
});

test("UX-02 : « Retirer » confirme APRÈS le contrôle d'échec", () => {
  assert.match(
    MANAGER,
    /if \(!res\.ok\) \{\s*setErreur\(labels\.erreur\);\s*return;\s*\}\s*setOk\(labels\.vRetire\);\s*router\.refresh\(\)/
  );
});

test("UX-02 : chaque geste efface le retour précédent, et un échec prime sur un succès", () => {
  // Deux gestes (offrir, retirer) remettent `ok` à zéro avant d'agir.
  assert.equal((MANAGER.match(/setOk\(null\)/g) ?? []).length, 2);
  assert.match(MANAGER, /\{ok && !erreur && <p role="status"/);
});
