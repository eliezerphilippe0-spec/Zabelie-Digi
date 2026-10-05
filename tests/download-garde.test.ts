import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadRoute, database } from "./helpers/route-harness";
import { UUID_RE } from "../lib/digital-studio";
import { isDownloadable, KIND_FILE } from "../lib/product-kind";
import { DIGITAL_BUCKET } from "../lib/storage-buckets";

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

function downloadFixture(accessFailure?: "returned" | "thrown") {
  const orderId = "00000000-0000-0000-0000-000000000001";
  const releaseId = "00000000-0000-0000-0000-000000000002";
  const assetId = "00000000-0000-0000-0000-000000000003";
  const writes: string[] = [];
  const db = database(query => {
    if (query.table === "orders") {
      if (query.steps.some(([method]) => method === "update")) {
        writes.push("delivered");
        return { error: null };
      }
      return { data: { id: orderId, buyer_id: "buyer", product_id: "product", status: "paid" }, error: null };
    }
    if (query.table === "products") return { data: { kind: KIND_FILE }, error: null };
    if (query.table === "zabelie_digital_accesses") {
      writes.push("access");
      if (accessFailure === "thrown") throw new Error("private database detail");
      // Supabase upsert does not return rows by default; an ignored duplicate
      // also succeeds with data:null. Neither requires a second access row.
      return { data: null, error: accessFailure === "returned" ? { message: "private database detail" } : null };
    }
    throw new Error("Unexpected table " + query.table);
  });
  const route = loadRoute(join(import.meta.dirname, "..", "app/api/download/route.ts"), {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "buyer" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({
      ...db,
      storage: { from: (bucket: string) => {
        assert.equal(bucket, DIGITAL_BUCKET);
        return { createSignedUrl: async () => ({ data: { signedUrl: "https://storage.test/private-signed-file" }, error: null }) };
      } },
    }) },
    "@/lib/digital-file-security": { digitalFileIsClean: async () => true },
    "@/lib/digital-studio-server": { resolveDigitalRelease: async () => ({ release: {
      id: releaseId,
      payload: { files: [{ id: assetId, storage_path: "seller/book.pdf", file_name: "book.pdf" }] },
    } }) },
    "@/lib/digital-studio": { UUID_RE },
    "@/lib/product-kind": { isDownloadable },
    "@/lib/storage-buckets": { DIGITAL_BUCKET },
  });
  return {
    get: () => route.GET(new Request(`https://zabelie.test/api/download?orderId=${orderId}`)),
    writes, db, orderId, releaseId, assetId,
  };
}

for (const failure of ["returned", "thrown"] as const) {
  test(`D5 — audit ${failure}: 503, aucun lien exposé ni remise déclarée`, async () => {
    const fixture = downloadFixture(failure);
    const response = await fixture.get();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.code, "download_access_unavailable");
    assert.equal(body.url, undefined);
    assert.doesNotMatch(JSON.stringify(body), /private database detail|private-signed-file/);
    assert.deepEqual(fixture.writes, ["access"]);
  });
}

test("D6 — accès persisté ou déjà connu: lien rendu et trace unique réutilisée avant la remise", async () => {
  const fixture = downloadFixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fixture.get();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "https://storage.test/private-signed-file");
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.deepEqual(fixture.writes, ["access", "delivered", "access", "delivered"]);
  const accesses = fixture.db.queries.filter(q => q.table === "zabelie_digital_accesses");
  assert.equal(accesses.length, 2);
  for (const query of accesses) {
    const args = query.steps.find(([method]) => method === "upsert")?.[1];
    assert.equal(JSON.stringify(args), JSON.stringify([
      { order_id: fixture.orderId, release_id: fixture.releaseId, asset_id: fixture.assetId },
      { onConflict: "order_id,release_id,asset_id", ignoreDuplicates: true },
    ]));
  }
});
