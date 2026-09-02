import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * C1.5 de `docs/31` — LE CONNU-NÉGATIF DU TÉLÉCHARGEMENT.
 *
 * « Un acheteur non payé doit recevoir un 403. » La route le fait ; rien ne
 * le PROUVAIT. Un garde jamais mis en échec n'a pas démontré qu'il pouvait.
 *
 * Ces assertions portent sur ce qui COMMANDE — les conditions et l'ORDRE dans
 * lequel elles se présentent — pas sur la présence d'un code d'erreur quelque
 * part dans le fichier. Un `if (false)` laisserait le texte « 403 » intact et
 * ouvrirait le fichier à tout le monde.
 */

const ROUTE = readFileSync(
  join(import.meta.dirname, "..", "app/api/download/route.ts"),
  "utf8"
);

test("D1 — un statut autre que paid/delivered commande un 403", () => {
  assert.match(
    ROUTE,
    /if \(order\.status !== "paid" && order\.status !== "delivered"\)\s*\{[\s\S]{0,160}status: 403/,
    "le 403 doit être commandé par la condition sur order.status, et rien d'autre"
  );
});

test("D2 — la propriété est vérifiée AVANT le statut, et rend 404 (pas 403)", () => {
  // 404 et pas 403 : dire « commande introuvable » à quelqu'un qui n'en est
  // pas l'acheteur ne lui confirme pas qu'elle existe.
  const iProp = ROUTE.search(/order\.buyer_id !== user\.id[\s\S]{0,120}status: 404/);
  const iStatut = ROUTE.search(/order\.status !== "paid"/);
  assert.ok(iProp > 0, "le contrôle de propriété avec son 404 est introuvable");
  assert.ok(iStatut > 0, "le contrôle de statut est introuvable");
  assert.ok(iProp < iStatut, "la propriété doit être vérifiée avant le statut");
});

test("D3 — l'authentification précède tout, et la signature d'URL suit tout", () => {
  const iAuth = ROUTE.search(/if \(!user\)\s*\{[\s\S]{0,80}status: 401/);
  const iStatut = ROUTE.search(/order\.status !== "paid"/);
  const iSigne = ROUTE.indexOf("createSignedUrl(");
  assert.ok(iAuth > 0 && iStatut > 0 && iSigne > 0);
  assert.ok(iAuth < iStatut && iStatut < iSigne, "ordre : 401 → 404 → 403 → 409 → URL signée");
});

test("D4 — l'URL signée est courte et force le téléchargement", () => {
  assert.match(ROUTE, /createSignedUrl\(asset\.storage_path,\s*60 \* 5/, "5 minutes, pas plus");
  assert.match(ROUTE, /download: asset\.file_name/);
});
