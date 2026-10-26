import { test } from "node:test";
import assert from "node:assert/strict";
import { SELLER_FUNNEL_EVENTS, logSellerFunnel } from "../lib/metrics";

/**
 * TUNNEL VENDEUR — le journal ne doit porter QUE l'étape, l'issue et un motif
 * technique (audit REA 2026-10-26, #3). La garde qui compte n'est pas « ça
 * journalise » mais « ça ne journalise RIEN D'AUTRE » : un `user_id` ou un
 * `product_id` qui s'y glisserait ferait du journal d'observabilité un journal
 * de surveillance. On capture la ligne émise et on vérifie l'ensemble des clés.
 */

const CLES_AUTORISEES = new Set(["event", "ok", "reason", "kind"]);

/** Capture les lignes `[metrics:seller] …` émises pendant `fn`. */
function capter(fn: () => void): Record<string, unknown>[] {
  const brut = console.log;
  const lignes: string[] = [];
  console.log = (...a: unknown[]) => { lignes.push(a.map(String).join(" ")); };
  try {
    fn();
  } finally {
    console.log = brut;
  }
  return lignes
    .filter((l) => l.startsWith("[metrics:seller] "))
    .map((l) => JSON.parse(l.slice("[metrics:seller] ".length)));
}

test("les événements du tunnel sont exactement trois, connus", () => {
  assert.deepEqual(
    [...SELLER_FUNNEL_EVENTS].sort(),
    ["cover_upload", "gallery_upload", "product_created"]
  );
});

test("un échec porte l'étape, l'issue et un motif — rien de plus", () => {
  const [l] = capter(() => logSellerFunnel("gallery_upload", { ok: false, reason: "storage_502" }));
  assert.equal(l.event, "gallery_upload");
  assert.equal(l.ok, false);
  assert.equal(l.reason, "storage_502");
  for (const k of Object.keys(l)) {
    assert.ok(CLES_AUTORISEES.has(k), `clé interdite dans le journal vendeur : ${k}`);
  }
});

test("un succès n'invente pas de motif, et accepte le TYPE de produit (pas une identité)", () => {
  const [l] = capter(() => logSellerFunnel("product_created", { ok: true, kind: "physical" }));
  assert.equal(l.ok, true);
  assert.equal(l.kind, "physical");
  assert.ok(!("reason" in l), "pas de reason sur un succès");
  for (const k of Object.keys(l)) {
    assert.ok(CLES_AUTORISEES.has(k), `clé interdite : ${k}`);
  }
});

test("le préfixe isole ce journal de celui de la landing", () => {
  // Deux journaux distincts : [metrics:seller] ≠ [metrics:landing]. Un parseur
  // d'ops filtre l'un sans happer l'autre.
  const brut = console.log;
  let ligne = "";
  console.log = (...a: unknown[]) => { ligne = a.map(String).join(" "); };
  try {
    logSellerFunnel("cover_upload", { ok: true });
  } finally {
    console.log = brut;
  }
  assert.match(ligne, /^\[metrics:seller\] /);
  assert.doesNotMatch(ligne, /\[metrics:landing\]/);
});
