import { test } from "node:test";
import assert from "node:assert/strict";

import { lireFournisseur } from "../lib/essayage/fournisseur";
import { simulation } from "../lib/essayage/fournisseurs/simulation";
import { DELAI_APPEL_MS, DUREE_MAX_ESSAI_MS, type PhotoAcheteur, type VetementEssaye } from "../lib/essayage/fournisseurs/types";

/**
 * ESSAYAGE VIRTUEL — l'adaptateur de fournisseur et la simulation
 * (docs/74 §3 et §8 ; tasks/essayage-todo.md 1.2).
 *
 * La simulation sert aux tests, à l'e2e et à la démonstration : elle ne coûte
 * rien, ne sort pas de la machine, et elle est REFUSÉE en production, où son
 * image passerait pour un vrai essai.
 */

const PHOTO: PhotoAcheteur = { octets: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), type: "image/jpeg" };
const ROBE: VetementEssaye = { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/robe.jpg", titre: "Robe en coton", piece: "entier" };
const horloge = (depart: number) => {
  let t = depart;
  return { maintenant: () => t, avancer: (ms: number) => { t += ms; } };
};

test("F1 — aucun fournisseur sans interrupteur, sans choix explicite, ou avec une valeur inconnue", () => {
  assert.equal(lireFournisseur({}), null);
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation" }), null, "interrupteur éteint");
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true" }), null, "pas de défaut implicite");
  for (const v of ["", "Simulation", "SIMULATION", " simulation", "mock", "openai"]) {
    assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: v }), null, JSON.stringify(v));
  }
});

test("F2 — la simulation s'allume hors production, et jamais en production", () => {
  const f = lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation" });
  assert.equal(f?.nom, "simulation");
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation", VERCEL_ENV: "preview" })?.nom, "simulation");
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation", VERCEL_ENV: "production" }), null);
});

test("F3 — chaque fournisseur réel s'allume avec SA clé seulement", () => {
  const cles = { GENLOOK_API_KEY: "cle-de-test", FASHN_API_KEY: "cle-de-test" };
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "genlook", ...cles })?.nom, "genlook");
  assert.equal(lireFournisseur({ ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "fashn", ...cles })?.nom, "fashn");
});

test("F4 — la simulation passe par « en cours », puis rend une image à afficher en data:", async () => {
  const h = horloge(1_000_000);
  const f = simulation({ delaiMs: 2_000, maintenant: h.maintenant });
  const travail = await f.creer(PHOTO, ROBE);
  assert.equal(travail.fournisseur, "simulation");
  assert.deepEqual(await f.statut(travail), { etat: "en_cours" });
  h.avancer(1_999);
  assert.deepEqual(await f.statut(travail), { etat: "en_cours" });
  h.avancer(1);
  const fin = await f.statut(travail);
  assert.equal(fin.etat, "reussi");
  if (fin.etat !== "reussi") return;
  assert.equal(fin.image.type, "image/svg+xml");
  assert.match(Buffer.from(fin.image.base64, "base64").toString("utf8"), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
});

test("F5 — la simulation sait échouer sur demande, avec la raison demandée", async () => {
  const h = horloge(5_000);
  const f = simulation({ delaiMs: 500, echec: "moderation", maintenant: h.maintenant });
  const travail = await f.creer(PHOTO, ROBE);
  assert.deepEqual(await f.statut(travail), { etat: "en_cours" });
  h.avancer(500);
  assert.deepEqual(await f.statut(travail), { etat: "echec", raison: "moderation" });
});

test("F6 — sans état : une autre instance lit le travail créé par la première (fonctions sans serveur)", async () => {
  const h = horloge(10_000);
  const travail = await simulation({ delaiMs: 100, maintenant: h.maintenant }).creer(PHOTO, ROBE);
  h.avancer(100);
  assert.equal((await simulation({ delaiMs: 100, maintenant: h.maintenant }).statut(travail)).etat, "reussi");
});

test("F7 — un travail étranger ou abîmé donne un échec, pas une exception", async () => {
  const f = simulation({ delaiMs: 0 });
  for (const id of ["", "sim", "sim:abc:ok", "sim:123:inconnu", "autre:123:ok"]) {
    assert.deepEqual(await f.statut({ fournisseur: "simulation", id }), { etat: "echec", raison: "fournisseur" }, id);
  }
  assert.deepEqual(await f.statut({ fournisseur: "genlook", id: "sim:1:ok" }), { etat: "echec", raison: "fournisseur" });
  await f.effacer({ fournisseur: "simulation", id: "sim:1:ok" });
});

test("F8 — un essai entier ne dure jamais plus de 60 secondes, et un appel moins que ça", () => {
  assert.equal(DUREE_MAX_ESSAI_MS, 60_000, "docs/74 §11, critère 7");
  assert.ok(DELAI_APPEL_MS > 0 && DELAI_APPEL_MS < DUREE_MAX_ESSAI_MS);
});
