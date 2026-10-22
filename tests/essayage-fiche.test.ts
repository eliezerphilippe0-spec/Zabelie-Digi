import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { boutonEssayage, type FicheVue } from "../lib/essayage/fiche";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE } from "../lib/product-kind";
import type { FicheEssayage } from "../lib/essayage/base";

/**
 * ESSAYAGE VIRTUEL — la fiche produit (tâche 4.3). Le bouton n'apparaît que
 * pour un acheteur connecté du groupe « essai », sur une fiche que la base dit
 * éligible ; l'exposition est notée dans les deux groupes, une fois par rendu
 * (la base garde une ligne par acheteur, fiche et jour).
 */

const ACHETEUR = "22222222-2222-2222-2222-222222222222"; // groupe « essai »
const TEMOIN = "11111111-1111-1111-1111-111111111111"; // groupe « témoin »
const VENDEUR = "55555555-5555-5555-5555-555555555555";
const ROBE: FicheVue = { id: "44444444-4444-4444-4444-444444444444", kind: KIND_PHYSICAL, creatorId: VENDEUR, sousRayonSlug: "wob" };
const ALLUME = { ZABELIE_ESSAYAGE_ENABLED: "true", ZABELIE_ESSAYAGE_FOURNISSEUR: "simulation" };

function fausseBase(options: { eligible?: boolean; panne?: "eligible" | "exposer" } = {}) {
  const appels: string[] = [];
  const base: FicheEssayage = {
    async eligible(produit, acheteur) {
      appels.push(`eligible:${produit}:${acheteur}`);
      if (options.panne === "eligible") throw new Error("essayage : base indisponible");
      return options.eligible ?? true;
    },
    async exposer(acheteur, produit, groupe) {
      appels.push(`exposer:${acheteur}:${produit}:${groupe}`);
      if (options.panne === "exposer") throw new Error("essayage : base indisponible");
    },
  };
  return { base, appels };
}

test("EF1 — fiche éligible : bouton pour le groupe « essai », exposition notée", async () => {
  const { base, appels } = fausseBase();
  assert.equal(await boutonEssayage({ env: ALLUME, base: () => base }, ROBE, ACHETEUR), true);
  assert.deepEqual(appels, [`eligible:${ROBE.id}:${ACHETEUR}`, `exposer:${ACHETEUR}:${ROBE.id}:essai`]);
});

test("EF2 — groupe témoin : pas de bouton, mais l'exposition est notée (c'est elle qui sert de comparaison)", async () => {
  const { base, appels } = fausseBase();
  assert.equal(await boutonEssayage({ env: ALLUME, base: () => base }, ROBE, TEMOIN), false);
  assert.deepEqual(appels, [`eligible:${ROBE.id}:${TEMOIN}`, `exposer:${TEMOIN}:${ROBE.id}:temoin`]);
});

test("EF3 — sans bouton ni appel à la base : interrupteur éteint, sans fournisseur, anonyme, le vendeur lui-même, fiche non physique ou sous-rayon fermé", async () => {
  const cas: [string, Parameters<typeof boutonEssayage>[0]["env"], FicheVue, string | null][] = [
    ["interrupteur", {}, ROBE, ACHETEUR],
    ["interrupteur « 1 »", { ...ALLUME, ZABELIE_ESSAYAGE_ENABLED: "1" }, ROBE, ACHETEUR],
    ["sans fournisseur", { ZABELIE_ESSAYAGE_ENABLED: "true" }, ROBE, ACHETEUR],
    ["simulation en production", { ...ALLUME, VERCEL_ENV: "production" }, ROBE, ACHETEUR],
    ["anonyme", ALLUME, ROBE, null],
    ["le vendeur", ALLUME, ROBE, VENDEUR],
    ["fichier", ALLUME, { ...ROBE, kind: KIND_FILE }, ACHETEUR],
    ["service", ALLUME, { ...ROBE, kind: KIND_SERVICE }, ACHETEUR],
    ["lingerie", ALLUME, { ...ROBE, sousRayonSlug: "lenjri" }, ACHETEUR],
    ["enfant (niveau 2)", ALLUME, { ...ROBE, sousRayonSlug: "rad-timoun" }, ACHETEUR],
    ["sans sous-rayon", ALLUME, { ...ROBE, sousRayonSlug: null }, ACHETEUR],
  ];
  for (const [nom, env, fiche, visiteur] of cas) {
    const { base, appels } = fausseBase();
    assert.equal(await boutonEssayage({ env, base: () => base }, fiche, visiteur), false, nom);
    assert.deepEqual(appels, [], nom);
  }
});

test("EF4 — la base dit non (vendeur non pilote, brouillon, sans photo) : ni bouton ni exposition", async () => {
  const { base, appels } = fausseBase({ eligible: false });
  assert.equal(await boutonEssayage({ env: ALLUME, base: () => base }, ROBE, ACHETEUR), false);
  assert.deepEqual(appels, [`eligible:${ROBE.id}:${ACHETEUR}`]);
});

test("EF5 — base en panne : la fiche s'affiche sans bouton, et le journal ne dit rien de plus", async () => {
  const erreurs: unknown[][] = [];
  const avant = console.error;
  console.error = (...a: unknown[]) => void erreurs.push(a);
  try {
    for (const panne of ["eligible", "exposer"] as const) {
      const { base } = fausseBase({ panne });
      assert.equal(await boutonEssayage({ env: ALLUME, base: () => base }, ROBE, ACHETEUR), false, panne);
    }
  } finally {
    console.error = avant;
  }
  assert.deepEqual(erreurs, [["[essayage] fiche : base indisponible"], ["[essayage] fiche : base indisponible"]]);
});

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const PAGE = sansCommentaires(readFileSync("app/produit/[slug]/page.tsx", "utf8"));

test("EF6 — la page : la décision vient du serveur, pour le visiteur de la session, et le bouton suit « Ajouter au panier »", () => {
  assert.match(PAGE, /const essayage = isSupabaseConfigured\(\)\s*\?\s*await boutonEssayage\(\{ env: lireEnvEssayage\(\), base: \(\) => baseEssayage\(createAdminClient\(\)\) \}, product, visiteur\?\.id\)\s*:\s*false;/);
  assert.match(PAGE, /<AddToCart productId=\{product\.id\} labels=\{libellesPanier\} \/>\s*\{essayage && <EssayageBouton produitId=\{product\.id\} labels=\{libellesEssayage\(lang, product\.title\)\} panier=\{libellesPanier\} \/>\}/);
  assert.equal(PAGE.match(/<EssayageBouton/g)?.length, 1, "un seul bouton, sous la condition");
});
