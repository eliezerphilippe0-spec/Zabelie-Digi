import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as limites from "../lib/image-limits";
import {
  COVER_MAX_DIMENSION,
  COVER_MAX_OCTETS,
  EXTENSION_DU_FORMAT,
  dimensionsDepuisEntete,
  formatDepuisEntete,
} from "../lib/image-limits";
import * as media from "../lib/product-media";
import { database, loadRoute, type Query } from "./helpers/route-harness";

/**
 * LES PHOTOS DE `/vendre` — revue du 2026-10-08 (UX-01, SEC-02, SEC-05, RES-01).
 *
 * Avant : la galerie annonçait 5 Mo pendant que le stockage en refusait tout
 * ce qui dépasse 1,5 Mo, envoyait la photo sans la compresser, et stockait le
 * type ANNONCÉ par le client dans un bucket public. Ce fichier exécute les
 * vraies routes (doubles d'E/S, aucune écriture réelle) : ce qu'il affirme est
 * ce que la route FAIT, pas ce que son texte contient.
 */

const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ── Images synthétiques, connues octet par octet ────────────────────────────

/** Octets d'un fichier : un `ArrayBuffer` ordinaire, ce que `File` exige. */
type Octets = Uint8Array<ArrayBuffer>;

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const le24 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255];

function png(largeur: number, hauteur: number): Octets {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(largeur), ...be32(hauteur), 8, 2, 0, 0, 0, 0, 0, 0, 0,
  ]);
}
function jpeg(largeur: number, hauteur: number): Octets {
  return new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, ...be16(16), ...new Array(14).fill(0),
    0xff, 0xc0, ...be16(17), 8, ...be16(hauteur), ...be16(largeur), 3, ...new Array(9).fill(0),
  ]);
}
/** WebP « étendu » (VP8X) : RIFF, WEBP, puis largeur-1 et hauteur-1 sur 24 bits. */
function webp(largeur: number, hauteur: number): Octets {
  const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
  return new Uint8Array([
    ...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"), ...ascii("VP8X"),
    10, 0, 0, 0, 0, 0, 0, 0, ...le24(largeur - 1), ...le24(hauteur - 1), 0, 0,
  ]);
}
const html = new TextEncoder().encode("<!doctype html><script>alert(document.domain)</script>");

// ── Le lecteur de format ────────────────────────────────────────────────────

test("formatDepuisEntete reconnaît les trois formats — cas connus-positifs", () => {
  assert.equal(formatDepuisEntete(png(1600, 900)), "image/png");
  assert.equal(formatDepuisEntete(jpeg(1600, 900)), "image/jpeg");
  assert.equal(formatDepuisEntete(webp(1600, 900)), "image/webp");
});

test("formatDepuisEntete refuse ce qui n'est pas une image — cas connus-négatifs", () => {
  assert.equal(formatDepuisEntete(html), null, "du HTML nommé .png reste du HTML");
  assert.equal(formatDepuisEntete(new Uint8Array(0)), null, "un fichier vide n'a pas de format");
  assert.equal(formatDepuisEntete(new TextEncoder().encode("GIF89a" + " ".repeat(40))), null, "GIF : hors liste");
});

test("format et dimensions lisent les MÊMES octets : reconnu par l'un, borné par l'autre", () => {
  for (const [image, attendu] of [
    [png(1200, 800), { largeur: 1200, hauteur: 800 }],
    [jpeg(1200, 800), { largeur: 1200, hauteur: 800 }],
    [webp(1200, 800), { largeur: 1200, hauteur: 800 }],
  ] as const) {
    assert.ok(formatDepuisEntete(image));
    assert.deepEqual(dimensionsDepuisEntete(image), attendu);
  }
});

test("chaque format reconnu a son extension, et la liste est fermée", () => {
  assert.deepEqual(Object.keys(EXTENSION_DU_FORMAT).sort(), ["image/jpeg", "image/png", "image/webp"]);
  assert.equal(EXTENSION_DU_FORMAT["image/jpeg"], "jpg");
});

// ── La route de la galerie, exécutée ────────────────────────────────────────

const USER = "vendeur-1";
const PRODUIT = "produit-1";

function galerie(options: {
  actif?: boolean;
  cadence?: boolean;
  dejaEnGalerie?: number;
} = {}) {
  const envois: { bucket: string; path: string; contentType?: string }[] = [];
  const retraits: { bucket: string; paths: string[] }[] = [];
  const db = database((query: Query) => {
    const op = (nom: string) => query.steps.find(([m]) => m === nom)?.[1];
    if (query.table === "products") return { data: { id: PRODUIT, seller_id: USER }, error: null };
    if (query.table === "zabelie_product_media" && op("insert")) return { data: { id: "media-neuf" }, error: null };
    if (query.table === "zabelie_product_media" && op("delete")) return { error: null };
    if (query.table === "zabelie_product_media" && op("single"))
      return { data: { id: "media-1", kind: "image", storage_path: `${PRODUIT}/galerie/a.png` }, error: null };
    if (query.table === "zabelie_product_media") return { count: options.dejaEnGalerie ?? 0, error: null };
    throw new Error("requête inattendue " + query.table);
  });
  const admin = {
    ...db,
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _f: unknown, opts: { contentType?: string }) => {
          envois.push({ bucket, path, contentType: opts?.contentType });
          return { error: null };
        },
        remove: async (paths: string[]) => {
          // Copie dans le royaume du test : le tableau vient du contexte vm de la route.
          retraits.push({ bucket, paths: [...paths] });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  };
  const refus = Response.json({ error: "api.suspended", code: "suspended" }, { status: 403 });
  const route = loadRoute("app/api/products/media/route.ts", {
    "@/lib/supabase/server": {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => (options.actif === false ? refus : null) },
    "@/lib/zabelie-rate-limit": { rateLimit: async () => options.cadence !== false },
    "@/lib/image-limits": limites,
    "@/lib/product-media": media,
  });
  const poster = (octets: Octets, nom: string, type: string) => {
    const form = new FormData();
    form.set("productId", PRODUIT);
    form.set("file", new File([octets], nom, { type }));
    return route.POST(new Request("https://zabelie.test/api/products/media", { method: "POST", body: form }));
  };
  const retirer = () =>
    route.DELETE(new Request("https://zabelie.test/api/products/media", {
      method: "DELETE",
      body: JSON.stringify({ productId: PRODUIT, mediaId: "media-1" }),
    }));
  return { poster, retirer, envois, retraits, queries: db.queries };
}

test("SEC-02 — du HTML nommé .png et annoncé image/png est refusé, et RIEN n'est envoyé", async () => {
  const g = galerie();
  const r = await g.poster(html, "photo.png", "image/png");
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "api.image.unreadable");
  assert.equal(g.envois.length, 0);
});

test("SEC-02 — une vraie image sous un faux nom et un faux type est stockée avec son type RÉEL", async () => {
  for (const [octets, type, ext] of [
    [png(800, 600), "image/png", "png"],
    [jpeg(800, 600), "image/jpeg", "jpg"],
    [webp(800, 600), "image/webp", "webp"],
  ] as const) {
    const g = galerie();
    const r = await g.poster(octets, "piege.svg", "text/html");
    assert.equal(r.status, 200, `${type} : ${JSON.stringify(await r.clone().json())}`);
    assert.equal(g.envois.length, 1);
    assert.equal(g.envois[0].bucket, media.MEDIA_BUCKET);
    assert.equal(g.envois[0].contentType, type, "le type stocké est celui LU, jamais celui annoncé");
    assert.match(g.envois[0].path, new RegExp(`^${PRODUIT}/galerie/[0-9a-f-]{36}\\.${ext}$`));
  }
});

test("SEC-02 — la bombe de décompression est refusée avant le stockage", async () => {
  const g = galerie();
  const r = await g.poster(png(40000, 40000), "bombe.png", "image/png");
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "api.image.dimensions");
  assert.equal(g.envois.length, 0);
  // Frontière : pile au plafond, la photo passe.
  const ok = galerie();
  assert.equal((await ok.poster(png(COVER_MAX_DIMENSION, COVER_MAX_DIMENSION), "ok.png", "image/png")).status, 200);
});

test("UX-01 — le plafond de poids EST celui du stockage (1,5 Mo), pas 5 Mo", async () => {
  const lourde = new Uint8Array(COVER_MAX_OCTETS + 1);
  lourde.set(png(800, 600), 0);
  const g = galerie();
  const r = await g.poster(lourde, "lourde.png", "image/png");
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "api.image.heavy");
  assert.equal(g.envois.length, 0);
  // Frontière, au même octet que le bucket (0134).
  const pile = new Uint8Array(COVER_MAX_OCTETS);
  pile.set(png(800, 600), 0);
  assert.equal((await galerie().poster(pile, "pile.png", "image/png")).status, 200);
});

test("un fichier vide est refusé comme illisible, pas comme « trop lourd »", async () => {
  const g = galerie();
  const r = await g.poster(new Uint8Array(0), "vide.png", "image/png");
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "api.image.unreadable");
  assert.equal(g.envois.length, 0);
});

test("la galerie pleine est refusée avant le stockage", async () => {
  const g = galerie({ dejaEnGalerie: media.MAX_IMAGES_PER_PRODUCT });
  const r = await g.poster(png(800, 600), "septieme.png", "image/png");
  assert.equal(r.status, 422);
  assert.equal((await r.json()).error, "api.gallery.full");
  assert.equal(g.envois.length, 0);
});

test("SEC-05 — cadence dépassée : 429, sans lire le produit ni rien envoyer", async () => {
  const g = galerie({ cadence: false });
  const r = await g.poster(png(800, 600), "photo.png", "image/png");
  assert.equal(r.status, 429);
  assert.equal((await r.json()).error, "api.rate.limited");
  assert.equal(g.envois.length, 0);
  assert.equal(g.queries.length, 0);
});

test("SEC-05 — un compte suspendu ne retire plus de photo : ni ligne ni objet touchés", async () => {
  const g = galerie({ actif: false });
  const r = await g.retirer();
  assert.equal(r.status, 403);
  assert.equal(g.queries.length, 0);
  assert.equal(g.retraits.length, 0);
  // Cas connu-positif : le même retrait, compte actif, aboutit.
  const ok = galerie();
  const r2 = await ok.retirer();
  assert.equal(r2.status, 200);
  assert.deepEqual(ok.retraits, [{ bucket: media.MEDIA_BUCKET, paths: [`${PRODUIT}/galerie/a.png`] }]);
});

test("un compte suspendu n'ajoute pas de photo non plus", async () => {
  const g = galerie({ actif: false });
  const r = await g.poster(png(800, 600), "photo.png", "image/png");
  assert.equal(r.status, 403);
  assert.equal(g.envois.length, 0);
});

// ── La photo principale : même lecteur, même type réel ──────────────────────

function couverture() {
  const envois: { path: string; contentType?: string }[] = [];
  const db = database((query: Query) => {
    if (query.table === "products" && query.steps.some(([m]) => m === "update")) return { error: null };
    if (query.table === "products") return { data: { id: PRODUIT, seller_id: USER }, error: null };
    throw new Error("requête inattendue " + query.table);
  });
  const admin = {
    ...db,
    storage: {
      from: () => ({
        upload: async (path: string, _f: unknown, opts: { contentType?: string }) => {
          envois.push({ path, contentType: opts?.contentType });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }),
      }),
    },
  };
  const route = loadRoute("app/api/products/cover/route.ts", {
    "@/lib/supabase/server": {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }),
    },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/image-limits": limites,
    "@/lib/storage-buckets": { MEDIA_BUCKET: media.MEDIA_BUCKET },
  });
  const poster = (octets: Octets, nom: string, type: string) => {
    const form = new FormData();
    form.set("productId", PRODUIT);
    form.set("file", new File([octets], nom, { type }));
    return route.POST(new Request("https://zabelie.test/api/products/cover", { method: "POST", body: form }));
  };
  return { poster, envois };
}

test("photo principale : type et extension déduits du contenu, pas du nom ni du type annoncés", async () => {
  const c = couverture();
  const r = await c.poster(webp(1200, 900), "photo.jpg", "image/jpeg");
  assert.equal(r.status, 200);
  assert.deepEqual(c.envois, [{ path: `${PRODUIT}/cover.webp`, contentType: "image/webp" }]);
  const faux = couverture();
  const r2 = await faux.poster(html, "photo.jpg", "image/jpeg");
  assert.equal(r2.status, 422);
  assert.equal((await r2.json()).error, "api.image.unreadable");
  assert.equal(faux.envois.length, 0);
});

test("aucune des deux routes ne laisse le client choisir le type stocké", () => {
  for (const f of ["app/api/products/media/route.ts", "app/api/products/cover/route.ts"]) {
    const code = sansCommentaires(readFileSync(f, "utf8"));
    assert.ok(!/file\.type/.test(code), `${f} : le type annoncé par le client commande encore quelque chose`);
    assert.ok(!/file\.name/.test(code), `${f} : le nom du client commande encore quelque chose`);
    assert.match(code, /contentType: format \}/, `${f} : le type stocké doit être le format LU`);
  }
});

// ── Le bucket redit les bornes applicatives ─────────────────────────────────

test("0134 : le bucket des photos porte le même plafond et les mêmes types que le code", () => {
  const sql = readFileSync("supabase/migrations/0134_zabelie_product_covers_types.sql", "utf8");
  const reglage = /set allowed_mime_types = array\[([^\]]+)\],\s*\n\s*file_size_limit = (\d+)\s*\n\s*where id = 'product-covers';/.exec(sql);
  assert.ok(reglage, "réglage du bucket introuvable");
  assert.equal(Number(reglage[2]), COVER_MAX_OCTETS, "le bucket et la route doivent refuser au même octet");
  const types = reglage[1].split(",").map((x) => x.trim().replace(/'/g, "")).sort();
  assert.deepEqual(types, Object.keys(EXTENSION_DU_FORMAT).sort(), "le bucket accepte exactement ce que la route sait lire");
  assert.equal(media.MEDIA_BUCKET, "product-covers");
});

// ── L'écran du vendeur ──────────────────────────────────────────────────────

const ECRAN = readFileSync("components/galerie-manager.tsx", "utf8");

test("UX-01 — la photo ENVOYÉE est celle que le compresseur a produite", () => {
  /* La liaison, pas l'adjacence : `fichier` naît de `compresserImage`, et
   * c'est lui — pas `file`, l'original — qui part dans le formulaire. */
  assert.match(
    ECRAN,
    /const \{ fichier \} = await compresserImage\(file\);[\s\S]{0,400}form\.set\("file", fichier\);/
  );
  assert.ok(!/form\.set\("file", file\)/.test(ECRAN), "l'original ne doit jamais partir");
});

test("UX-01 — refus LOCAL au-delà du plafond partagé, avant tout octet envoyé", () => {
  assert.match(ECRAN, /import \{ COVER_MAX_OCTETS \} from "@\/lib\/image-limits";/);
  assert.match(
    ECRAN,
    /if \(fichier\.size > COVER_MAX_OCTETS\) \{\s*\n\s*setError\(labels\.tooHeavy\);\s*\n\s*return;\s*\n\s*\}\s*\n\s*const form = new FormData\(\);/
  );
});

test("RES-01 — l'ouverture et les envois de la galerie font 44 px de haut", () => {
  assert.match(ECRAN, /<summary className="[^"]*\bmin-h-11\b/);
  const libelles = ECRAN.match(/<label className="[^"]*\bmin-h-11\b[^"]*">/g) ?? [];
  assert.equal(libelles.length, 2, "photo et vidéo");
  assert.ok(!/<label className="[^"]*\bpy-1\.5\b/.test(ECRAN), "l'ancienne cible de 30 px est revenue");
});

test("la page passe les libellés neufs, et le plafond affiché vient du module partagé", () => {
  const page = readFileSync("app/vendre/page.tsx", "utf8");
  assert.match(page, /preparing: t\(lang, "sell\.galerie\.preparing"\)/);
  assert.match(
    page,
    /tooHeavy: t\(lang, "sell\.galerie\.heavy", \{\s*\n\s*max: String\(Math\.round\(COVER_MAX_OCTETS \/ 1024\)\),/
  );
});

// ── UX-02 : la photo principale des fichiers et des services ────────────────

const PRINCIPALE = readFileSync("components/photo-principale.tsx", "utf8");
const VENDRE = readFileSync("app/vendre/page.tsx", "utf8");

test("UX-02 — la photo principale ENVOYÉE est celle du compresseur, vers la route de couverture", () => {
  assert.match(
    PRINCIPALE,
    /const \{ fichier \} = await compresserImage\(file\);[\s\S]{0,500}form\.set\("file", fichier\);[\s\S]{0,200}fetch\("\/api\/products\/cover", \{ method: "POST", body: form \}\)/
  );
  assert.ok(!/form\.set\("file", file\)/.test(PRINCIPALE), "l'original ne doit jamais partir");
  assert.match(
    PRINCIPALE,
    /if \(fichier\.size > COVER_MAX_OCTETS\) \{\s*\n\s*setError\(labels\.tooHeavy\);\s*\n\s*return;\s*\n\s*\}/
  );
});

test("UX-02 — la page ne propose la photo principale que sur un BROUILLON (SEC-01)", () => {
  /* La condition et le composant, liés : un `{true && <PhotoPrincipale` ou un
   * rendu hors condition rendrait la photo d'une fiche publiée modifiable
   * sans nouvelle revue. */
  assert.match(VENDRE, /\{p\.status === "draft" && \(\s*\n\s*<PhotoPrincipale[\s>]/);
  assert.equal((VENDRE.match(/<PhotoPrincipale[\s>]/g) ?? []).length, 1, "un seul rendu, celui sous condition");
  assert.match(VENDRE, /<PhotoPrincipale productId=\{p\.id\} initialUrl=\{p\.cover_url\}/);
});

test("UX-02 — la cible d'envoi fait 44 px, et le message d'échec est annoncé", () => {
  assert.match(PRINCIPALE, /<label className="[^"]*\bmin-h-11\b[^"]*">/);
  assert.match(PRINCIPALE, /role="alert"/);
});

test("les champs photo restent joignables au CLAVIER — masqués visuellement, jamais `display: none`", () => {
  /* `className="hidden"` sur un <input type="file"> le retire du clavier : le
   * libellé reste cliquable à la souris, mais rien ne prend le focus. */
  for (const [nom, src] of [["photo-principale", PRINCIPALE], ["galerie-manager", ECRAN]] as const) {
    const champs = src.match(/<input\s+type="file"[\s\S]{0,600}?\/>/g) ?? [];
    assert.ok(champs.length > 0, `${nom} : aucun champ fichier trouvé — le contrôle regarderait le vide`);
    for (const champ of champs) {
      assert.match(champ, /className="sr-only"/, `${nom} : champ fichier hors du clavier`);
    }
  }
});
