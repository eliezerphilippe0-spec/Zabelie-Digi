import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_IMAGES_PER_PRODUCT,
  isMissingTable,
  listerMedias,
} from "../lib/product-media";

/**
 * Galerie produit (V-1A, docs/35) — dormante sans 0073 : table absente → [],
 * la fiche garde sa couverture seule. Vérifié dans les deux sens.
 */

function clientAvec(reponse: { data?: unknown; error?: unknown }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ order: async () => reponse }),
        }),
      }),
    }),
    storage: {
      from: () => ({
        getPublicUrl: (p: string) => ({
          data: { publicUrl: `https://cdn.test/${p}` },
        }),
      }),
    },
  } as unknown as SupabaseClient;
}

test("listerMedias : lignes mappées, URL DÉRIVÉE du chemin (jamais stockée)", async () => {
  const medias = await listerMedias(
    clientAvec({
      data: [
        { id: "a", kind: "image", storage_path: "p/1.jpg", position: 0 },
        { id: "b", kind: "image", storage_path: "p/2.jpg", position: 1 },
      ],
      error: null,
    }),
    "p"
  );
  assert.equal(medias.length, 2);
  assert.equal(medias[0].url, "https://cdn.test/p/1.jpg");
  assert.equal(medias[1].kind, "image");
});

test("listerMedias : table absente (0073 non appliquée) → [] silencieux — le repli est la couverture seule", async () => {
  for (const code of ["42P01", "PGRST205"]) {
    const medias = await listerMedias(
      clientAvec({ data: null, error: { code } }),
      "p"
    );
    assert.deepEqual(medias, []);
  }
});

test("isMissingTable : les deux codes, et rien d'autre", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "23505" }), false);
  assert.equal(isMissingTable(null), false);
});

// ── La route : structurel — conditions avec leurs cibles ────────────────────

const ROUTE = readFileSync("app/api/products/media/route.ts", "utf8");

test("route media : auth, propriété, plafond app-side AVANT upload, 503 sans 0073", () => {
  assert.match(ROUTE, /if \(!user\)[\s\S]{0,200}status: 401/);
  assert.match(ROUTE, /product\.seller_id !== userId/);
  assert.match(
    ROUTE,
    /\(count \?\? 0\) >= MAX_IMAGES_PER_PRODUCT[\s\S]{0,300}status: 422/
  );
  assert.match(ROUTE, /isMissingTable\(countErr\)[\s\S]{0,300}status: 503/);
});

test("route media : nom de fichier SERVEUR, jamais celui du client, et nettoyage sur échec d'insertion", () => {
  assert.match(ROUTE, /crypto\.randomUUID\(\)/);
  assert.ok(!/file\.name(?!\.split)/.test(ROUTE.replace(/file\.name\.split/g, "OK")),
    "le nom client ne doit servir qu'à extraire l'extension");
  // L'objet stocké ne survit pas à une ligne absente : remove AVANT le 500.
  assert.match(ROUTE, /\.remove\(\[path\]\)[\s\S]{0,200}status: 500/);
});

test("route media : cette route n'accepte QUE des images — la vidéo attend la tranche B (lien signé)", () => {
  assert.match(ROUTE, /kind: "image"/);
  assert.ok(!/kind: "video"/.test(ROUTE), "la vidéo ne passe pas par une route serverless");
});

// ── Les surfaces ────────────────────────────────────────────────────────────

test("galerie fiche : zéro média → null (l'inverse de la galerie factice BL-119)", () => {
  const src = readFileSync("components/galerie-produit.tsx", "utf8");
  assert.match(src, /if \(items\.length === 0\) return null/);
  /* L'attribut JSX (`autoPlay`, casse exacte), PAS le mot : le commentaire du
   * composant dit « pas d'autoplay » et une recherche insensible à la casse
   * s'y déclenchait — le piège de sous-chaîne du dépôt, une fois de plus. */
  assert.ok(!/autoPlay/.test(src), "pas d'autoPlay sur données comptées");
});

test("fiche produit et /vendre montent la galerie (frontière, pas sous-chaîne)", () => {
  assert.match(
    readFileSync("app/produit/[slug]/page.tsx", "utf8"),
    /<GalerieProduit[\s>]/
  );
  assert.match(
    readFileSync("app/vendre/page.tsx", "utf8"),
    /<GalerieManager[\s>]/
  );
});

// ── V-1B — la vidéo (arbitrages porteur : 60 s / 50 Mo) ─────────────────────

const VIDEO_ROUTE = readFileSync("app/api/products/media/video/route.ts", "utf8");

test("route vidéo : chemin serveur revalidé, taille vérifiée sur l'OBJET RÉEL, hors-contrat supprimé", () => {
  assert.match(VIDEO_ROUTE, /cheminVideoValide\(product\.id, path\)/);
  assert.match(
    VIDEO_ROUTE,
    /taille <= 0 \|\| taille > MAX_VIDEO_BYTES \|\| !type\.startsWith\("video\/"\)/
  );
  // Le fichier hors contrat perd son objet AVANT le 422 — jamais de ligne.
  assert.match(VIDEO_ROUTE, /\.remove\(\[path\]\);[\s\S]{0,300}status: 422/);
  // Une seule vidéo, redit app-side (ZB073 reste le juge en base).
  assert.match(VIDEO_ROUTE, /\(count \?\? 0\) >= 1[\s\S]{0,250}status: 422/);
});

test("manager : durée ET poids vérifiés AVANT tout envoi ; téléversement par lien signé", () => {
  const src = readFileSync("components/galerie-manager.tsx", "utf8");
  assert.match(src, /file\.size > MAX_VIDEO_BYTES/);
  assert.match(src, /duree > MAX_VIDEO_SECONDS/);
  assert.match(src, /uploadToSignedUrl\(lien\.path, lien\.token, file/);
});

test("galerie : la vidéo se lit sur tap — preload none, jamais d'autoPlay", () => {
  const src = readFileSync("components/galerie-produit.tsx", "utf8");
  assert.match(src, /preload="none"/);
  assert.ok(!/autoPlay/.test(src), "pas d'autoPlay sur données comptées");
});

test("le plafond partagé route/UI vient d'une seule constante", () => {
  assert.equal(typeof MAX_IMAGES_PER_PRODUCT, "number");
  const vendre = readFileSync("app/vendre/page.tsx", "utf8");
  assert.match(vendre, /max=\{MAX_IMAGES_PER_PRODUCT\}/);
});
