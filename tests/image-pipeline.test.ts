import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  COVER_MAX_COTE,
  COVER_CIBLE_OCTETS,
  COVER_MAX_OCTETS,
  COVER_MAX_DIMENSION,
  dimensionsDepuisEntete,
} from "../lib/image-limits";

/**
 * PIPELINE D'IMAGES (2026-08-15) — ce qui doit rester vrai.
 *
 * ⚠️ Les interdictions de chaîne portent sur le CODE, jamais sur les
 * commentaires : la sonde de `0059` a déjà mordu là-dessus, et de nouveau
 * pendant la mission déconnexion (`!/auth.signOut/` rougissait sur l'en-tête
 * qui EXPLIQUE l'ancien appel). L'instrument porte désormais la leçon au lieu
 * de la redécouvrir — critère d'acceptation du porteur.
 */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const ROUTE = readFileSync("app/api/products/cover/route.ts", "utf8");
const ROUTE_CODE = sansCommentaires(ROUTE);
const COMPRESS = readFileSync("lib/image-compress.ts", "utf8");
const COMPRESS_CODE = sansCommentaires(COMPRESS);
const FORM = readFileSync("components/physical-product-form.tsx", "utf8");

// ── Le lecteur d'en-têtes, éprouvé sur de VRAIES images ─────────────────────

/** PNG minimal valide : signature + IHDR aux dimensions voulues. */
function png(largeur: number, hauteur: number): Uint8Array {
  const be32 = (n: number) =>
    Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const ihdr = new Uint8Array([
    ...be32(13), 0x49, 0x48, 0x44, 0x52,
    ...be32(largeur), ...be32(hauteur), 8, 2, 0, 0, 0, 0, 0, 0, 0,
  ]);
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr,
  ]);
}

/** JPEG minimal : SOI, un APP0 à sauter, puis SOF0 aux dimensions voulues. */
function jpeg(largeur: number, hauteur: number): Uint8Array {
  const be16 = (n: number) => [(n >> 8) & 255, n & 255];
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), ...new Array(14).fill(0), // APP0 de 16 octets
    0xff, 0xc0, ...be16(17), 8, ...be16(hauteur), ...be16(largeur),
    3, ...new Array(9).fill(0),
  ]);
}

test("dimensionsDepuisEntete lit PNG et JPEG — cas connus-positifs", () => {
  assert.deepEqual(dimensionsDepuisEntete(png(1600, 900)), {
    largeur: 1600,
    hauteur: 900,
  });
  assert.deepEqual(dimensionsDepuisEntete(jpeg(4032, 3024)), {
    largeur: 4032,
    hauteur: 3024,
  });
});

test("la BOMBE DE DÉCOMPRESSION est vue : lourde en pixels, légère en octets", () => {
  /* C'est la raison d'être du contrôle de dimensions. Un PNG 40 000 × 40 000
   * tient en quelques kilo-octets une fois compressé — le plafond de POIDS
   * seul le laisserait passer, et il ferait exploser la mémoire de tout ce
   * qui le redimensionnerait ensuite. */
  const bombe = png(40000, 40000);
  const compresse = deflateSync(Buffer.from(new Uint8Array(40000 * 4).fill(0)));
  assert.ok(
    compresse.length < COVER_MAX_OCTETS,
    "une bombe passe le plafond de poids — d'où le plafond de dimensions"
  );
  const d = dimensionsDepuisEntete(bombe)!;
  assert.ok(d.largeur > COVER_MAX_DIMENSION, "le lecteur doit voir 40 000 px");
});

test("format illisible → null, et le serveur refuse (fail-closed)", () => {
  assert.equal(dimensionsDepuisEntete(new Uint8Array([1, 2, 3, 4, 5])), null);
  assert.equal(dimensionsDepuisEntete(new Uint8Array(0)), null);
  // La liaison : `!dims` COMMANDE le refus, il n'est pas juste mentionné.
  assert.match(
    ROUTE_CODE,
    /const dims = dimensionsDepuisEntete\(entete\);\s*\n\s*if \(!dims\) \{[\s\S]{0,240}status: 422/,
    "Un format qu'on ne sait pas lire est un format qu'on ne sait pas borner."
  );
});

// ── Le plafond serveur ──────────────────────────────────────────────────────

test("le serveur borne le POIDS ET les DIMENSIONS — le poids seul ne suffit pas", () => {
  assert.match(
    ROUTE_CODE,
    /file\.size > COVER_MAX_OCTETS[\s\S]{0,300}status: 422/,
    "plafond de poids"
  );
  assert.match(
    ROUTE_CODE,
    /dims\.largeur > COVER_MAX_DIMENSION \|\| dims\.hauteur > COVER_MAX_DIMENSION[\s\S]{0,300}status: 422/,
    "plafond de dimensions"
  );
});

test("les plafonds viennent du module PARTAGÉ — jamais recopiés dans la route", () => {
  /* Un plafond recopié des deux côtés diverge, et la divergence ne se voit
   * que le jour où un vendeur est refusé sans que l'écran le lui ait dit. */
  assert.match(ROUTE, /from "@\/lib\/image-limits"/);
  assert.ok(
    !/5 \* 1024 \* 1024|MAX_BYTES/.test(ROUTE_CODE),
    "l'ancien plafond de 5 Mo en dur doit avoir disparu du code"
  );
});

test("le code d'échec est ZB084 — et il n'était pas déjà pris", () => {
  assert.match(ROUTE_CODE, /code: "ZB084"/);
  const deja = readFileSync("supabase/migrations/0081_affiliation.sql", "utf8");
  assert.ok(!deja.includes("ZB084"), "ZB084 ne doit pas déjà servir en base");
});

// ── Le compresseur client ───────────────────────────────────────────────────

test("le compresseur NE JETTE JAMAIS et ne rend jamais plus lourd", () => {
  /* Un vendeur bloqué par un compresseur qui refuse sa photo serait pire que
   * la photo lourde — le plafond serveur, lui, tiendra de toute façon. */
  assert.match(
    COMPRESS_CODE,
    /if \(blob\.size >= source\.size\) return echec\(\);/,
    "ré-encoder peut GROSSIR une image déjà optimisée"
  );
  assert.match(COMPRESS_CODE, /catch \{\s*\n\s*return echec\(\);/);
  assert.match(
    COMPRESS_CODE,
    /if \(typeof createImageBitmap !== "function"\) return echec\(\);/
  );
});

test("la qualité est décidée par la TAILLE OBTENUE, pas par un réglage fixe", () => {
  // La liaison : la boucle sort quand le blob passe sous la cible.
  assert.match(
    COMPRESS_CODE,
    /for \(const q of \[[\d., ]+\]\) \{\s*\n\s*blob = await versBlob\(q\);\s*\n\s*if \(blob && blob\.size <= COVER_CIBLE_OCTETS\) break;/
  );
});

test("le grand côté est plafonné, et la sortie est du WebP", () => {
  assert.match(
    COMPRESS_CODE,
    /Math\.min\(1, COVER_MAX_COTE \/ Math\.max\(bitmap\.width, bitmap\.height\)\)/
  );
  assert.match(COMPRESS_CODE, /canvas\.toBlob\(res, "image\/webp", q\)/);
});

test("les bornes sont cohérentes : cible < max toléré, dimension crédible", () => {
  assert.ok(COVER_CIBLE_OCTETS < COVER_MAX_OCTETS, "la cible doit être sous le plafond");
  assert.ok(COVER_MAX_COTE <= COVER_MAX_DIMENSION);
  assert.equal(COVER_MAX_COTE, 1600);
});

// ── La surface vendeur ──────────────────────────────────────────────────────

test("la compression a lieu À LA SÉLECTION, et le fichier ENVOYÉ est le compressé", () => {
  /* Comprimer sans poser le résultat dans l'état enverrait l'original : le
   * gain serait affiché au vendeur sans exister. La liaison est ici. */
  assert.match(
    FORM,
    /const c = await compresserImage\(f\);\s*\n\s*setPhoto\(c\.fichier\);/,
    "le fichier retenu doit être celui que le compresseur a produit"
  );
});

test("le vendeur voit le poids AVANT et APRÈS, en kreyòl", () => {
  assert.match(FORM, /poidsLisible\(compression\.avant\)[\s\S]{0,200}poidsLisible\(compression\.apres\)/);
  assert.match(FORM, /N ap prepare foto a/);
  // Le cas « déjà légère » est dit aussi — sinon l'absence de message se lit
  // comme une panne.
  assert.match(FORM, /compression\.apres >= compression\.avant[\s\S]{0,200}Foto a deja lejè/);
});

test("poidsLisible bascule Ko → Mo là où un écran de 360 px le demande", async () => {
  const { poidsLisible } = await import("../lib/image-compress");
  assert.equal(poidsLisible(148 * 1024), "148 Ko");
  assert.equal(poidsLisible(2294775), "2.2 Mo");
});
