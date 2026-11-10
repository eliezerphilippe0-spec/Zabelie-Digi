import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { monCashDirectProposable } from "../lib/payment-availability";

/**
 * ON NE PROPOSE PAS UN RAIL QU'ON NE PEUT PAS ENCAISSER (audit 2026-11-10, P0-2).
 *
 * Sur la production, MonCash direct sans identifiants ou sans mode choisi
 * affichait quand même son bouton : l'acheteur cliquait, une commande naissait,
 * le stock était réservé, puis 502. Le garde ne regarde QUE `VERCEL_ENV` : le
 * local, les Preview et les e2e (sans identifiants, par construction) gardent
 * leur bouton et leur 502 d'opérateur.
 *
 * Parcouru le 2026-11-10 sur le faux Supabase des e2e : production sans
 * identifiants → 0 bouton, 422 `moncash_non_configure`, 0 commande ; témoin
 * hors production → 1 bouton, 502 `provider_unavailable`, 1 commande.
 */
const ID = { MONCASH_CLIENT_ID: "id-de-test", MONCASH_CLIENT_SECRET: "secret-de-test" };
const env = (e: Record<string, string>) => ({ NODE_ENV: "test", ...e }) as NodeJS.ProcessEnv;

test("hors production, MonCash direct reste proposé même sans rien de configuré", () => {
  for (const vercel of [undefined, "preview", "development", ""]) {
    const base: Record<string, string> = vercel === undefined ? {} : { VERCEL_ENV: vercel };
    assert.equal(monCashDirectProposable(env(base)), true, `VERCEL_ENV=${vercel}`);
    assert.equal(monCashDirectProposable(env({ ...base, MONCASH_MODE: "n'importe quoi" })), true, `VERCEL_ENV=${vercel}, mode invalide`);
  }
});

test("en production, proposé seulement avec un mode CHOISI et les deux identifiants", () => {
  const prod = { VERCEL_ENV: "production" };
  assert.equal(monCashDirectProposable(env({ ...prod, ...ID, MONCASH_MODE: "production" })), true);
  // Un bac à sable explicite reste proposable : le masquer est une décision du porteur.
  assert.equal(monCashDirectProposable(env({ ...prod, ...ID, MONCASH_MODE: "sandbox" })), true);
  const refus: Array<[string, Record<string, string>]> = [
    ["rien de posé", {}],
    ["mode absent", { ...ID }],
    ["mode vide", { ...ID, MONCASH_MODE: " " }],
    ["mode invalide", { ...ID, MONCASH_MODE: "prod" }],
    ["identifiant absent", { MONCASH_MODE: "production", MONCASH_CLIENT_SECRET: "s" }],
    ["identifiant blanc", { ...ID, MONCASH_MODE: "production", MONCASH_CLIENT_ID: "  " }],
    ["secret vide", { ...ID, MONCASH_MODE: "production", MONCASH_CLIENT_SECRET: "" }],
  ];
  for (const [nom, e] of refus) assert.equal(monCashDirectProposable(env({ ...prod, ...e })), false, nom);
});

test("MonCash via Kobara ne rend pas le rail DIRECT proposable", () => {
  const kobara = { KOBARA_MONCASH: "true", KOBARA_MODE: "live", KOBARA_SECRET_KEY: "kbr_sk_live_x", KOBARA_WEBHOOK_SECRET: "w" };
  assert.equal(monCashDirectProposable(env({ VERCEL_ENV: "production", ...kobara })), false);
});

// ── Le garde est-il branché là où il commande ? ───────────────────────────
const sansCommentaires = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const lire = (f: string) => sansCommentaires(readFileSync(f, "utf8"));

test("checkout : le refus précède toute création de commande, et épargne l'achat gratuit", () => {
  const src = lire("app/api/checkout/route.ts");
  const garde = src.search(/if \(rail === "moncash" && finalPriceHtg > 0 && !monCashDirectProposable\(\)\) \{\s*return NextResponse\.json\(\s*\{ error: t\(lang, "api\.rail\.unavailable"\), code: "moncash_non_configure" \},\s*\{ status: 422 \}/);
  assert.ok(garde > 0, "garde MonCash introuvable ou déformé dans le checkout");
  const creation = src.search(/\.from\("orders"\)\s*\.insert\(\{/);
  const reservation = src.indexOf('"zabelie_reserve_stock"');
  assert.ok(creation > 0 && reservation > 0, "repères de création de commande et de réservation introuvables");
  assert.ok(garde < creation, "le garde doit précéder l'insertion de la commande");
  assert.ok(garde < reservation, "le garde doit précéder la réservation de stock");
});

test("panier groupé : MonCash direct suit le même garde", () => {
  assert.match(lire("app/api/panier/payer/route.ts"), /function railOuvert\(rail: RailGroupe\): boolean \{[\s\S]{0,160}return monCashDirectProposable\(\);\s*\}/);
});

test("fiche et panier : le bouton MonCash n'est construit que sous le garde, et l'absence de rail se dit", () => {
  const fiche = lire("app/produit/[slug]/page.tsx");
  assert.match(fiche, /if \(monCashDirectProposable\(\)\) \{\s*options\.push\(\{ rail: "moncash",/);
  assert.equal((fiche.match(/rail: "moncash"/g) ?? []).length, 1, "un second bouton MonCash direct échapperait au garde");
  assert.match(fiche, /const aucunRail = buildBuyOptions\([^;]*\)\.length === 0;/);
  assert.match(fiche, /\{aucunRail \? <MessageErreur>\{t\(lang, "availability\.moncash\.unavailable"\)\}<\/MessageErreur> : \(\s*<BuyButton/);
  const panier = lire("app/panier/page.tsx");
  assert.match(panier, /if \(monCashDirectProposable\(\)\) options\.push\(\{ rail: "moncash",/);
  assert.equal((panier.match(/rail: "moncash"/g) ?? []).length, 1);
  assert.match(panier, /\{payerTout && optionsGroupe\.length > 0 \? \(/);
});
