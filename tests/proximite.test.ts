import { test } from "node:test";
import assert from "node:assert/strict";
import {
  niveauProximite,
  normaliserLieu,
  perimetresProximite,
  zoneDepuisTexte,
  type EnsemblesVendeurs,
} from "../lib/proximite";
import type { Zone } from "../lib/zones";

/**
 * Proximité approximative par ZONE (décision du porteur, 2026-10-29).
 *
 * Le jeu de zones reprend les VRAIES graphies relevées en production le
 * 2026-10-29 (département du Nord, communes, quartiers du Cap-Haïtien), dont
 * celles qui finissent par une lettre accentuée — « Plèn dinò », « Sen
 * Rafayèl », « Saint-Raphaël » : le cas où une frontière `\b` tombe du mauvais
 * côté (`CLAUDE.md`). Un jeu choisi « à l'œil » aurait contenu des mots qui
 * PASSENT.
 *
 * Chaque instrument est éprouvé sur un cas connu-POSITIF et sur un connu-NÉGATIF.
 */

const Z = (id: string, level: Zone["level"], parent: string | null, slug: string, kr: string, fr: string): Zone => ({
  id, parent_id: parent, level, slug, label_kr: kr, label_fr: fr, label_en: null, label_es: null,
});

const ZONES: Zone[] = [
  Z("d-nord", "depatman", null, "nord", "Nò", "Nord"),
  Z("d-nordest", "depatman", null, "nord-est", "Nòdès", "Nord-Est"),
  Z("d-centre", "depatman", null, "centre", "Sant", "Centre"),
  Z("d-ouest", "depatman", null, "ouest", "Lwès", "Ouest"),
  Z("k-okap", "komin", "d-nord", "cap-haitien", "Okap", "Cap-Haïtien"),
  Z("k-limbe", "komin", "d-nord", "limbe", "Lenbe", "Limbé"),
  Z("k-baslimbe", "komin", "d-nord", "bas-limbe", "Ba Lenbe", "Bas-Limbé"),
  Z("k-plenno", "komin", "d-nord", "plaine-du-nord", "Plèn dinò", "Plaine-du-Nord"),
  Z("k-srafayel", "komin", "d-nord", "saint-raphael", "Sen Rafayèl", "Saint-Raphaël"),
  Z("k-limonade", "komin", "d-nord", "limonade", "Limonad", "Limonade"),
  Z("q-carenage", "katye", "k-okap", "carenage", "Karenaj", "Carénage"),
  Z("q-hautcap", "katye", "k-okap", "haut-du-cap", "Odikap", "Haut-du-Cap"),
  Z("q-centrev", "katye", "k-okap", "centre-ville", "Sant vil", "Centre-ville"),
];
const id = (texte: string, zones: Zone[] = ZONES) => zoneDepuisTexte(zones, texte)?.id ?? null;

// ───────────────────────── normaliserLieu ─────────────────────────────────────

test("normaliserLieu : accents pliés, casse, ponctuation — y compris l'accent en FIN de mot", () => {
  assert.equal(normaliserLieu("Plèn dinò"), "plen dino");
  assert.equal(normaliserLieu("  Saint-Raphaël!  "), "saint raphael");
  assert.equal(normaliserLieu("Grand'Anse"), "grand anse");
  assert.equal(normaliserLieu("CAP-HAÏTIEN"), "cap haitien");
  assert.equal(normaliserLieu("???"), "");
});

// ───────────────────────── zoneDepuisTexte : connu-POSITIF ────────────────────

test("reconnaît un lieu saisi seul : kreyòl, français, sans accent, en majuscules", () => {
  assert.equal(id("Okap"), "k-okap");
  assert.equal(id("Cap-Haïtien"), "k-okap");
  assert.equal(id("cap haitien"), "k-okap");
  assert.equal(id("CAP-HAÏTIEN"), "k-okap");
  assert.equal(id("Karenaj"), "q-carenage");
});

test("reconnaît un nom qui FINIT par une lettre accentuée (le cas où \\b échoue)", () => {
  assert.equal(id("Plèn dinò"), "k-plenno");
  assert.equal(id("Sen Rafayèl"), "k-srafayel");
  assert.equal(id("Saint-Raphaël"), "k-srafayel");
  assert.equal(id("plen dino"), "k-plenno");
});

test("reconnaît un lieu dans une phrase", () => {
  assert.equal(id("Je suis à Okap"), "k-okap");
  assert.equal(id("mwen nan Limonad"), "k-limonade");
});

test("le lieu le plus fin l'emporte, si les autres en sont des ancêtres", () => {
  assert.equal(id("Carénage, Cap-Haïtien"), "q-carenage");
  assert.equal(id("Okap Haut-du-Cap"), "q-hautcap");
  assert.equal(id("Centre-ville Cap-Haïtien"), "q-centrev");
});

test("la mention la plus longue gagne : « Bas-Limbé » n'est pas « Limbé »", () => {
  assert.equal(id("Bas-Limbé"), "k-baslimbe");
  assert.equal(id("Limbé"), "k-limbe");
  assert.equal(id("Lenbe"), "k-limbe");
});

test("un département se reconnaît quand c'est TOUTE la réponse", () => {
  assert.equal(id("Nord"), "d-nord");
  assert.equal(id("Nord-Est"), "d-nordest");
  assert.equal(id("Nòdès"), "d-nordest");
});

// ───────────────────────── zoneDepuisTexte : connu-NÉGATIF ────────────────────

test("lieu absent de la base, vide ou illisible : null, jamais un choix", () => {
  for (const texte of ["", "   ", "???", "Port-au-Prince", "Delmas", "Pétion-Ville", "xyz"]) {
    assert.equal(id(texte), null, `« ${texte} »`);
  }
});

test("un département dans une PHRASE ne compte pas (« au nord de la ville »)", () => {
  assert.equal(id("au nord de la ville"), null);
  assert.equal(id("pres du centre"), null);
});

test("un nom de moins de 3 lettres est ignoré : « Nò » plié en « no » se confondrait avec le mot", () => {
  assert.equal(id("no"), null);
  assert.equal(id("Nò"), null);
  // Le même département reste joignable par son nom français.
  assert.equal(id("Nord"), "d-nord");
});

test("des lieux contradictoires dans le même texte : null", () => {
  assert.equal(id("Okap ou Lenbe"), null);
  assert.equal(id("Limonade et Saint-Raphaël"), null);
});

// ───────────────────────── homonymes (les zones vont s'étendre) ───────────────

const AVEC_HOMONYME: Zone[] = [
  ...ZONES,
  Z("q-centrev-limbe", "katye", "k-limbe", "centre-ville", "Sant vil", "Centre-ville"),
  // Une commune et son quartier qui portent le MÊME nom.
  Z("k-pilate", "komin", "d-nord", "pilate", "Pilat", "Pilate"),
  Z("q-pilat", "katye", "k-pilate", "pilat", "Pilat", "Pilat"),
];

test("deux quartiers de même nom : le reste du texte tranche, sinon null", () => {
  assert.equal(id("Centre-ville Limbé", AVEC_HOMONYME), "q-centrev-limbe");
  assert.equal(id("Centre-ville Cap-Haïtien", AVEC_HOMONYME), "q-centrev");
  assert.equal(id("Centre-ville", AVEC_HOMONYME), null, "branches différentes : on ne choisit pas");
});

test("homonymes imbriqués : on rend le plus LARGE, jamais le plus précis", () => {
  // « Pilat » peut être la commune ou son quartier : dire « quartier » à tort
  // classerait un vendeur comme voisin sur une supposition.
  assert.equal(id("Pilat", AVEC_HOMONYME), "k-pilate");
});

// ───────────────────────── perimetresProximite ────────────────────────────────

test("acheteur situé dans un quartier : trois périmètres emboîtés", () => {
  const p = perimetresProximite(ZONES, "q-carenage");
  assert.deepEqual(p?.katye, ["q-carenage"]);
  assert.ok(p?.komin?.includes("q-carenage") && p.komin.includes("q-hautcap") && p.komin.includes("k-okap"));
  assert.equal(p?.komin?.includes("k-limbe"), false, "une autre commune n'est pas dans le périmètre");
  assert.ok(p?.depatman.includes("k-limbe") && p.depatman.includes("d-nord"));
  assert.equal(p?.depatman.includes("d-ouest"), false);
});

test("acheteur situé dans une commune : pas de périmètre de quartier (on ne prétend pas le savoir)", () => {
  const p = perimetresProximite(ZONES, "k-okap");
  assert.equal(p?.katye, null);
  assert.ok(p?.komin?.includes("q-carenage"));
});

test("acheteur situé dans un département seul : ni quartier ni commune", () => {
  const p = perimetresProximite(ZONES, "d-nord");
  assert.equal(p?.katye, null);
  assert.equal(p?.komin, null);
  assert.ok(p?.depatman.includes("k-okap"));
});

test("zone inconnue : null, aucune proximité inventée", () => {
  assert.equal(perimetresProximite(ZONES, "n-importe-quoi"), null);
  assert.equal(perimetresProximite([], "k-okap"), null);
});

// ───────────────────────── niveauProximite ────────────────────────────────────

const ENS: EnsemblesVendeurs = {
  katye: new Set(["s1"]),
  komin: new Set(["s1", "s2"]),
  depatman: new Set(["s1", "s2", "s3"]),
  avecZone: new Set(["s1", "s2", "s3", "s4"]),
};

test("le niveau est le plus petit périmètre qui contient le vendeur", () => {
  assert.equal(niveauProximite("s1", ENS), "katye");
  assert.equal(niveauProximite("s2", ENS), "komin");
  assert.equal(niveauProximite("s3", ENS), "depatman");
});

test("« ailleurs » (zone déclarée, loin) n'est pas « inconnue » (aucune zone déclarée)", () => {
  assert.equal(niveauProximite("s4", ENS), "ailleurs");
  assert.equal(niveauProximite("s5", ENS), "inconnue");
});

test("acheteur sans quartier : un vendeur de sa commune est « komin », jamais « katye »", () => {
  const sansQuartier: EnsemblesVendeurs = { ...ENS, katye: null };
  assert.equal(niveauProximite("s1", sansQuartier), "komin");
});
