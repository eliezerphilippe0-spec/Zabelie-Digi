import { test } from "node:test";
import assert from "node:assert/strict";

import { genlook } from "../lib/essayage/fournisseurs/genlook";
import { ErreurFournisseur, type PhotoAcheteur, type VetementEssaye } from "../lib/essayage/fournisseurs/types";
import { lireFournisseur } from "../lib/essayage/fournisseur";

/**
 * ESSAYAGE VIRTUEL — adaptateur Genlook (docs/74 §3 ; tasks/essayage-todo.md 2.1).
 *
 * Aucun appel réseau : un faux `fetch` rejoue les réponses de la
 * documentation officielle (genlook.app/docs/tryon-api, relevée le
 * 2026-10-19) et enregistre ce que l'adaptateur envoie. Ce ne sont pas des
 * enregistrements d'un vrai compte : le premier essai réel (test à l'aveugle)
 * confirmera les formes.
 */

const CLE = "gk_cle-de-test-ne-pas-utiliser";
const BASE = "https://api.genlook.app/tryon/v1";
const PHOTO: PhotoAcheteur = { octets: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), type: "image/jpeg" };
const ROBE: VetementEssaye = { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/robe.jpg", titre: "Robe en coton", piece: "entier" };
const RESULTAT = "https://storage.googleapis.com/genlook-results/cm8gen456xyz.png";

type Reponse = Response | (() => Promise<Response>);
function fauxFetch(reponses: Reponse[]) {
  const appels: Request[] = [];
  const f = async (entree: RequestInfo | URL, init?: RequestInit) => {
    const requete = new Request(entree, init);
    appels.push(requete);
    const suivante = reponses.shift();
    if (!suivante) throw new Error("appel inattendu : " + requete.url);
    return typeof suivante === "function" ? suivante() : suivante;
  };
  return { f: f as typeof fetch, appels };
}
const json = (corps: unknown, status = 200) => new Response(JSON.stringify(corps), { status, headers: { "content-type": "application/json" } });
const erreur = (code: string, status: number) => json({ code, message: "message lisible", status }, status);
const IMAGE_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9]);
const imagePng = () => new Response(IMAGE_PNG, { status: 200, headers: { "content-type": "image/png" } });
const travailDe = async (f: typeof fetch) => {
  const g = genlook({ cle: CLE, fetch: f, idUtilisateur: () => "zab_00000000-0000-4000-8000-000000000001" });
  return { g, travail: await g.creer(PHOTO, ROBE) };
};

test("G1 — créer : la photo part en fichier, gardée un jour, sous un identifiant neutre ; puis l'essai sur la photo du produit", async () => {
  const { f, appels } = fauxFetch([json({ imageId: "img_abc123", imageUrl: "https://apercu" }, 201), json({ generationId: "cm8gen456xyz", status: "PENDING", productExternalIds: [] }, 201)]);
  const { travail } = await travailDe(f);

  const [envoi, essai] = appels;
  assert.equal(envoi.method, "POST");
  assert.equal(envoi.url, `${BASE}/images/upload`);
  assert.equal(envoi.headers.get("x-api-key"), CLE);
  const formulaire = await envoi.formData();
  const fichier = formulaire.get("file");
  assert.ok(fichier instanceof Blob);
  assert.equal(fichier.type, "image/jpeg");
  assert.deepEqual(new Uint8Array(await fichier.arrayBuffer()), PHOTO.octets);
  assert.equal(formulaire.get("keepForDays"), "1");
  assert.equal(formulaire.get("externalUserId"), "zab_00000000-0000-4000-8000-000000000001");

  assert.equal(essai.method, "POST");
  assert.equal(essai.url, `${BASE}/try-on`);
  assert.equal(essai.headers.get("x-api-key"), CLE);
  assert.deepEqual(await essai.json(), {
    products: [{ title: "Robe en coton", images: [{ source: { url: ROBE.imageUrl } }] }],
    person: { image: { source: { id: "img_abc123" } } },
    externalUserId: "zab_00000000-0000-4000-8000-000000000001",
    output: { watermark: false, aiLabel: true },
  });
  assert.deepEqual(travail, { fournisseur: "genlook", id: "cm8gen456xyz:zab_00000000-0000-4000-8000-000000000001" });
});

test("G2 — l'identifiant envoyé à Genlook ne dit rien de l'acheteur, et change à chaque essai", async () => {
  const ids = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const { f, appels } = fauxFetch([json({ imageId: "img" }, 201), json({ generationId: "gen", status: "PENDING" }, 201)]);
    await genlook({ cle: CLE, fetch: f }).creer(PHOTO, ROBE);
    const id = String((await appels[0].formData()).get("externalUserId"));
    assert.match(id, /^zab_[0-9a-f-]{36}$/);
    ids.add(id);
  }
  assert.equal(ids.size, 3);
});

test("G3 — statut : en attente, puis le résultat récupéré par le serveur SANS la clé, rendu en base64", async () => {
  const { f, appels } = fauxFetch([
    json({ generationId: "cm8gen456xyz", status: "PENDING" }),
    json({ generationId: "cm8gen456xyz", status: "PROCESSING" }),
    json({ generationId: "cm8gen456xyz", status: "COMPLETED", resultImageUrl: RESULTAT }),
    imagePng(),
  ]);
  const g = genlook({ cle: CLE, fetch: f });
  const travail = { fournisseur: "genlook" as const, id: "cm8gen456xyz:zab_x" };
  assert.deepEqual(await g.statut(travail), { etat: "en_cours" });
  assert.deepEqual(await g.statut(travail), { etat: "en_cours" });
  assert.deepEqual(await g.statut(travail), { etat: "reussi", image: { type: "image/png", base64: Buffer.from(IMAGE_PNG).toString("base64") } });
  assert.equal(appels[0].url, `${BASE}/generations/cm8gen456xyz`);
  assert.equal(appels[0].headers.get("x-api-key"), CLE);
  assert.equal(appels[3].url, RESULTAT);
  assert.equal(appels[3].headers.get("x-api-key"), null, "la clé ne part jamais vers l'hôte de l'image");
});

test("G4 — un échec de génération devient une raison connue", async () => {
  const cas: [string, string][] = [
    ["CONTENT_POLICY_VIOLATION", "moderation"],
    ["GENERATION_TIMEOUT", "delai"],
    ["GENERATION_FAILED", "fournisseur"],
    ["PRODUCT_IMAGE_FETCH_FAILED", "fournisseur"],
    ["MISSING_REQUIRED_CLASSIFICATION", "fournisseur"],
    ["CODE_INCONNU", "fournisseur"],
  ];
  for (const [code, raison] of cas) {
    const { f } = fauxFetch([json({ generationId: "g", status: "FAILED", errorCode: code, errorMessage: "…" })]);
    assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id: "g:zab_x" }), { etat: "echec", raison }, code);
  }
});

test("G5 — un refus à la création lève une erreur typée, sans jamais citer la clé", async () => {
  const cas: [Reponse[], string][] = [
    [[erreur("INVALID_IMAGE", 400)], "photo_refusee"],
    [[erreur("UNSUPPORTED_IMAGE_TYPE", 400)], "photo_refusee"],
    [[erreur("FILE_TOO_LARGE", 413)], "photo_refusee"],
    [[erreur("INSUFFICIENT_CREDITS", 402)], "fournisseur"],
    [[erreur("INVALID_API_KEY", 401)], "fournisseur"],
    [[erreur("RATE_LIMITED", 429)], "fournisseur"],
    [[json({ imageId: "img" }, 201), erreur("CONTENT_POLICY_VIOLATION", 422)], "moderation"],
    [[json({ imageId: "img" }, 201), erreur("INTERNAL_ERROR", 500)], "fournisseur"],
    [[json({ pasDImageId: true }, 201)], "fournisseur"],
  ];
  for (const [reponses, raison] of cas) {
    const { f } = fauxFetch(reponses);
    await assert.rejects(genlook({ cle: CLE, fetch: f }).creer(PHOTO, ROBE), (e: unknown) => {
      assert.ok(e instanceof ErreurFournisseur);
      assert.equal(e.raison, raison);
      assert.ok(!e.message.includes(CLE), "la clé n'apparaît pas");
      return true;
    });
  }
});

test("G6 — statut : une gêne passagère reste « en cours » ; une erreur définitive ou un travail abîmé est un échec", async () => {
  for (const r of [erreur("RATE_LIMITED", 429), erreur("INTERNAL_ERROR", 500), () => Promise.reject(new TypeError("fetch failed"))]) {
    const { f } = fauxFetch([r]);
    assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id: "g:zab_x" }), { etat: "en_cours" });
  }
  for (const r of [erreur("GENERATION_NOT_FOUND", 404), erreur("FORBIDDEN", 403), erreur("INVALID_API_KEY", 401)]) {
    const { f } = fauxFetch([r]);
    assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id: "g:zab_x" }), { etat: "echec", raison: "fournisseur" });
  }
  const { f, appels } = fauxFetch([]);
  for (const id of ["", "sans-separateur", ":zab_x", "g:", "a/b:zab_x", "g:zab_x:trop"]) {
    assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id }), { etat: "echec", raison: "fournisseur" }, id);
  }
  assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "fashn", id: "g:zab_x" }), { etat: "echec", raison: "fournisseur" });
  assert.equal(appels.length, 0, "aucun appel pour un travail abîmé");
});

test("G7 — délais bornés : la création échoue en « délai », le statut reste « en cours »", async () => {
  const lent = (f: typeof fetch) => genlook({ cle: CLE, fetch: f, delaiAppelMs: 20 });
  // Un serveur qui ne répond jamais : seule l'expiration du délai libère l'appel.
  const attendreAbandon: typeof fetch = (_e, init) => new Promise((_, rejeter) => init?.signal?.addEventListener("abort", () => rejeter(init.signal!.reason)));
  await assert.rejects(lent(attendreAbandon).creer(PHOTO, ROBE), (e: unknown) => e instanceof ErreurFournisseur && e.raison === "delai");
  assert.deepEqual(await lent(attendreAbandon).statut({ fournisseur: "genlook", id: "g:zab_x" }), { etat: "en_cours" });
});

test("G8 — un résultat qui n'est pas une image, ou trop lourd, est un échec", async () => {
  const termine = () => json({ generationId: "g", status: "COMPLETED", resultImageUrl: RESULTAT });
  const cas: Response[] = [
    new Response("<html>", { status: 200, headers: { "content-type": "text/html" } }),
    new Response("non", { status: 403, headers: { "content-type": "image/png" } }),
    new Response(new Uint8Array(11 * 1024 * 1024), { status: 200, headers: { "content-type": "image/png" } }),
  ];
  for (const r of cas) {
    const { f } = fauxFetch([termine(), r]);
    assert.deepEqual(await genlook({ cle: CLE, fetch: f }).statut({ fournisseur: "genlook", id: "g:zab_x" }), { etat: "echec", raison: "fournisseur" });
  }
});

test("G9 — effacer : photo et résultat de l'essai supprimés chez Genlook ; une panne ne remonte pas", async () => {
  const { f, appels } = fauxFetch([new Response(null, { status: 204 })]);
  await genlook({ cle: CLE, fetch: f }).effacer({ fournisseur: "genlook", id: "cm8gen456xyz:zab_00000000-0000-4000-8000-000000000001" });
  assert.equal(appels[0].method, "DELETE");
  assert.equal(appels[0].url, `${BASE}/customers/zab_00000000-0000-4000-8000-000000000001`);
  assert.equal(appels[0].headers.get("x-api-key"), CLE);
  const panne = fauxFetch([() => Promise.reject(new TypeError("fetch failed"))]);
  await genlook({ cle: CLE, fetch: panne.f }).effacer({ fournisseur: "genlook", id: "g:zab_x" });
  const abime = fauxFetch([]);
  await genlook({ cle: CLE, fetch: abime.f }).effacer({ fournisseur: "genlook", id: "abime" });
  assert.equal(abime.appels.length, 0);
});

test("G10 — Genlook s'allume avec sa clé, jamais sans, jamais sur une prévisualisation", () => {
  const base = { ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "genlook" };
  assert.equal(lireFournisseur({ ...base, GENLOOK_API_KEY: CLE })?.nom, "genlook");
  assert.equal(lireFournisseur({ ...base, GENLOOK_API_KEY: CLE, VERCEL_ENV: "production" })?.nom, "genlook");
  assert.equal(lireFournisseur({ ...base }), null);
  assert.equal(lireFournisseur({ ...base, GENLOOK_API_KEY: "   " }), null);
  assert.equal(lireFournisseur({ ...base, FASHN_API_KEY: CLE }), null, "la clé de l'autre fournisseur ne compte pas");
  assert.equal(lireFournisseur({ ...base, GENLOOK_API_KEY: CLE, VERCEL_ENV: "preview" }), null, "jamais d'appel payant depuis une prévisualisation");
});
