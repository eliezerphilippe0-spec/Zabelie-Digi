import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ShoppingIntentSchema, rankShoppingCandidates, type ShoppingCandidate } from "../lib/shopping-ai";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, compteProximite } from "../lib/product-kind";
import { RANG_PROXIMITE, type NiveauProximite } from "../lib/proximite-niveaux";
import { SHOPPING_COPY } from "../lib/shopping-ai-copy";

/**
 * La proximité dans l'assistant d'achat (décision du porteur, 2026-10-29 : les
 * vendeurs livrent eux-mêmes, livrer loin n'est pas viable).
 *
 * Deux familles : le CLASSEMENT (pur, éprouvé sur des cas qui doivent changer
 * l'ordre ET sur des cas qui ne doivent pas le changer), puis le CÂBLAGE, sur ce
 * qui commande (d'où vient la zone, ce que reçoit le classement).
 */

const intent = ShoppingIntentSchema.parse({ query: "Téléphone", budgetHtg: 25000, need: "photo", location: "Okap" });
const offre = (id: string, sellerId: string, patch: Partial<ShoppingCandidate> = {}): ShoppingCandidate => ({
  id, slug: id, title: "Téléphone", description: "photo", sellerId, kind: KIND_PHYSICAL,
  priceHtg: 10000, ratingAverage: null, ratingCount: 0, available: true, ...patch,
});
const prox = (o: Record<string, NiveauProximite>) => new Map(Object.entries(o));
const ids = (r: { id: string }[]) => r.map((p) => p.id);

// ───────────────────────── l'ordre doit CHANGER ───────────────────────────────

test("physique : le vendeur le plus proche passe avant (quartier, commune, département, inconnu)", () => {
  const items = [offre("loin", "s-loin"), offre("dep", "s-dep"), offre("komin", "s-komin"), offre("katye", "s-katye")];
  const carte = prox({ "s-loin": "ailleurs", "s-dep": "depatman", "s-komin": "komin", "s-katye": "katye" });
  assert.deepEqual(ids(rankShoppingCandidates(items, intent, undefined, carte)), ["katye", "komin", "dep"]);
});

test("« inconnue » passe avant « ailleurs » : on ne rétrograde pas sur une absence de donnée", () => {
  const items = [offre("loin", "s-loin"), offre("inconnu", "s-inconnu")];
  const carte = prox({ "s-loin": "ailleurs" }); // s-inconnu absent de la carte
  assert.deepEqual(ids(rankShoppingCandidates(items, intent, undefined, carte)), ["inconnu", "loin"]);
});

test("la proximité prime sur le score pour un physique : le vendeur voisin passe devant un meilleur texte", () => {
  const meilleurTexte = offre("loin", "s-loin", { title: "Téléphone photo", description: "photo" });
  const voisin = offre("voisin", "s-voisin");
  const carte = prox({ "s-loin": "ailleurs", "s-voisin": "komin" });
  assert.deepEqual(ids(rankShoppingCandidates([meilleurTexte, voisin], intent, undefined, carte)), ["voisin", "loin"]);
});

// ───────────────────────── l'ordre ne doit PAS changer ────────────────────────

test("sans carte de proximité, l'ordre est exactement celui d'avant (le meilleur texte d'abord)", () => {
  const meilleurTexte = offre("loin", "s-loin", { title: "Téléphone photo" });
  const voisin = offre("voisin", "s-voisin");
  assert.deepEqual(ids(rankShoppingCandidates([voisin, meilleurTexte], intent)), ["loin", "voisin"]);
});

test("tant que PERSONNE n'a déclaré de zone, rien ne bouge — un fichier ne passe pas devant un objet", () => {
  // Le piège : si « inconnue » classait derrière les types sans proximité, tout
  // fichier numérique passerait devant tout objet physique dès aujourd'hui.
  const fichier = offre("guide", "s-guide", { kind: KIND_FILE, description: "" });
  const physique = offre("objet", "s-objet", { title: "Téléphone photo" });
  assert.deepEqual(ids(rankShoppingCandidates([fichier, physique], intent, undefined, prox({}))), ["objet", "guide"]);
});

test("un fichier et une prestation ne sont jamais classés par distance", () => {
  const fichier = offre("guide", "s-a", { kind: KIND_FILE });
  const service = offre("cours", "s-b", { kind: KIND_SERVICE });
  const carte = prox({ "s-a": "ailleurs", "s-b": "ailleurs" });
  const r = rankShoppingCandidates([fichier, service], intent, undefined, carte);
  assert.equal(r.length, 2, "ni écartés, ni rétrogradés");
  assert.deepEqual(r.map((p) => p.proximite), [null, null]);
});

test("un fichier passe devant un physique CONNU pour être loin, jamais devant un voisin", () => {
  const fichier = offre("guide", "s-a", { kind: KIND_FILE });
  const loin = offre("loin", "s-loin");
  const voisin = offre("voisin", "s-voisin");
  const carte = prox({ "s-loin": "ailleurs", "s-voisin": "komin" });
  assert.deepEqual(ids(rankShoppingCandidates([loin, fichier, voisin], intent, undefined, carte)), ["voisin", "guide", "loin"]);
});

test("un vendeur lointain reste PROPOSÉ (un acheteur peut commander pour un proche, ailleurs)", () => {
  const r = rankShoppingCandidates([offre("loin", "s-loin")], intent, undefined, prox({ "s-loin": "ailleurs" }));
  assert.deepEqual(ids(r), ["loin"]);
  assert.equal(r[0].proximite, "ailleurs");
});

test("le niveau est exposé sur chaque offre classée, null sans carte", () => {
  const items = [offre("a", "s-a")];
  assert.equal(rankShoppingCandidates(items, intent, undefined, prox({ "s-a": "katye" }))[0].proximite, "katye");
  assert.equal(rankShoppingCandidates(items, intent, undefined, prox({}))[0].proximite, "inconnue");
  assert.equal(rankShoppingCandidates(items, intent)[0].proximite, null);
});

// ───────────────────────── les rangs ──────────────────────────────────────────

test("l'ordre des rangs : plus proche d'abord, « inconnue » entre le proche et le lointain", () => {
  const { katye, komin, depatman, inconnue, ailleurs } = RANG_PROXIMITE;
  assert.ok(katye < komin && komin < depatman && depatman < inconnue && inconnue < ailleurs);
});

// ───────────────────────── compteProximite (module de types) ──────────────────

test("compteProximite : le physique seulement — ni le fichier, ni la prestation", () => {
  assert.equal(compteProximite(KIND_PHYSICAL), true);
  assert.equal(compteProximite(KIND_FILE), false);
  assert.equal(compteProximite(KIND_SERVICE), false);
});

test("compteProximite : un type inconnu n'est pas classé (et le dit, bruyamment)", () => {
  const erreurs: unknown[][] = [];
  const garde = console.error;
  console.error = (...a: unknown[]) => { erreurs.push(a); };
  try {
    assert.equal(compteProximite("inconnu" as never), false);
  } finally {
    console.error = garde;
  }
  assert.equal(erreurs.length, 1, "la branche par défaut journalise");
});

// ───────────────────────── câblage : ce qui commande ──────────────────────────

const ROUTE = readFileSync("app/api/ai/shopping/route.ts", "utf8");
const CATALOGUE = readFileSync("lib/shopping-ai-catalogue.ts", "utf8");
const RANK = readFileSync("lib/shopping-ai.ts", "utf8");
const UI = readFileSync("components/shopping-assistant.tsx", "utf8");

test("route : la localité est reconnue PAR LE CODE, et la zone reconnue part au catalogue", () => {
  assert.match(ROUTE, /const zone = question \? null : zoneDepuisTexte\(await getZonesActives\(\), intent\.location\)/);
  assert.match(ROUTE, /getShoppingRecommendations\(intent, input\.sellerId, zone\?\.id \?\? null\)/);
});

test("route : ce que le serveur a compris est rendu à l'écran, zone nulle comprise", () => {
  assert.match(ROUTE, /localite: \{ zone: zone \? libelleZone\(zone, await getLang\(\)\) : null \}/);
});

test("catalogue : la carte de proximité alimente le classement, pour les vendeurs de physique seulement", () => {
  assert.match(CATALOGUE, /candidates\.filter\(c => compteProximite\(c\.kind\)\)\.map\(c => c\.sellerId\)/);
  assert.match(CATALOGUE, /zoneAcheteurId && vendeurs\.length \? await proximiteDesVendeurs\(zoneAcheteurId, vendeurs\) : null/);
  assert.match(CATALOGUE, /rankShoppingCandidates\(candidates, intent, sellerId, proximite \?\? undefined\)/);
});

test("classement : le critère de proximité précède le score", () => {
  assert.match(RANK, /\.sort\(\(a, b\) => RANG_PROXIMITE\[niveau\(a\.product\) \?\? "inconnue"\] - RANG_PROXIMITE\[niveau\(b\.product\) \?\? "inconnue"\]\s*\|\|\s*b\.score - a\.score/);
});

test("confinement : lib/shopping-ai.ts n'importe que les types de proximité, jamais la base", () => {
  const imports = [...RANK.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  assert.ok(imports.includes("@/lib/proximite-niveaux"));
  for (const interdit of ["@/lib/proximite", "@/lib/proximite-serveur", "@/lib/zones"]) {
    assert.equal(imports.includes(interdit), false, `lib/shopping-ai.ts importe ${interdit}`);
  }
});

test("écran : chaque niveau a son libellé (Record), la localité comprise est dite", () => {
  assert.match(UI, /PROXIMITE_LIBELLE: Record<NiveauProximite,/);
  assert.match(UI, /result\.localite \?[\s\S]{0,200}labels\.localiteInconnue/);
  assert.match(UI, /p\.proximite \? <p[^>]*>\{labels\[PROXIMITE_LIBELLE\[p\.proximite\]\]\}<\/p> : null/);
});

test("libellés : la localité et les cinq niveaux existent dans les quatre langues, et {zone} y figure", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const c = SHOPPING_COPY[lang];
    assert.ok(c.localite.includes("{zone}"), `${lang} : localite sans {zone}`);
    for (const cle of ["localiteInconnue", "proxNote", "proxKatye", "proxKomin", "proxDepatman", "proxAilleurs", "proxInconnue"] as const) {
      assert.ok(c[cle].trim().length > 3, `${lang} : ${cle} vide`);
    }
  }
});

test("libellés : aucun ne promet une livraison — Zabelie ne livre pas", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const c = SHOPPING_COPY[lang];
    for (const cle of ["proxKatye", "proxKomin", "proxDepatman", "proxAilleurs", "proxInconnue", "localite"] as const) {
      assert.doesNotMatch(c[cle], /livr|delivery|entrega|livrezon/i, `${lang} : ${cle} parle de livraison`);
    }
  }
});
