import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAX_VIDEO_BYTES, MEDIA_BUCKET, VIDEO_BUCKET, bucketDuMedia } from "../lib/product-media";

/**
 * Vidéo produit : un bucket à part (0120, docs/66 §6.2).
 *
 * Né d'une panne mesurée le 2026-09-24 : les vidéos allaient dans
 * `product-covers`, plafonné à 1,5 Mo en production. Chaque vidéo réelle
 * était refusée par le stockage ; 0 vidéo depuis la livraison de V-1B.
 */

const MIGRATION = readFileSync("supabase/migrations/0120_bucket_videos_produit.sql", "utf8");

test("le plafond du bucket vidéo EST la borne applicative, au même octet", () => {
  const m = MIGRATION.match(/values \('product-videos', 'product-videos', true, (\d+),/);
  assert.ok(m, "insertion du bucket introuvable");
  assert.equal(Number(m[1]), MAX_VIDEO_BYTES);
  assert.equal(VIDEO_BUCKET, "product-videos");
  assert.notEqual(VIDEO_BUCKET, MEDIA_BUCKET);
});

test("un média vidéo vit dans le bucket vidéo, tout le reste dans les couvertures", () => {
  assert.equal(bucketDuMedia("video"), VIDEO_BUCKET);
  assert.equal(bucketDuMedia("image"), MEDIA_BUCKET);
});

test("tous les sites vidéo adressent le bucket vidéo — téléversement, confirmation, lecture, suppression", () => {
  const route = readFileSync("app/api/products/media/video/route.ts", "utf8");
  assert.equal((route.match(/\.from\(MEDIA_BUCKET\)/g) ?? []).length, 0, "route vidéo : un appel vise encore les couvertures");
  assert.equal((route.match(/\.from\(VIDEO_BUCKET\)/g) ?? []).length, 5);
  const ecran = readFileSync("components/galerie-manager.tsx", "utf8");
  assert.match(ecran, /\.storage\.from\(VIDEO_BUCKET\)\s*\.uploadToSignedUrl\(/);
  const lecture = readFileSync("lib/product-media.ts", "utf8");
  assert.match(lecture, /url: supabase\.storage\.from\(bucketDuMedia\(m\.kind\)\)\.getPublicUrl\(m\.storage_path\)/);
  const suppression = readFileSync("app/api/products/media/route.ts", "utf8");
  assert.match(suppression, /\.select\("id, kind, storage_path"\)/);
  assert.match(suppression, /storage\.from\(bucketDuMedia\(media\.kind\)\)\.remove\(\[media\.storage_path\]\)/);
});
