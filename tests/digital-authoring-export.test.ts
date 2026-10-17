import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  COLONNES_EXPORT,
  MOTEUR_PDF,
  auteurPourPdf,
  cheminExport,
  cheminExtrait,
  exportAJour,
  exportPourClient,
  lireExportClient,
  tailleLisible,
} from "../lib/digital-authoring/export";

/** Export PDF du Studio (tâche 4.3) : le module pur que routes, éditeur et base doivent dire pareil. */

const V = "00000000-0000-4000-8000-0000000000a1";
const P = "00000000-0000-4000-8000-0000000000b1";
const LIGNE = {
  id: "00000000-0000-4000-8000-0000000000e1", revision: 5, empreinte: "c".repeat(64), taille: 85912, pages: 34,
  extrait_taille: 14137, extrait_pages: 7, created_at: "2026-10-16T12:00:00Z", approuve_le: null,
  chemin: `${V}/${P}/${"c".repeat(64)}.pdf`,
};

test("chemins : la route et la base (0147) calculent le même, adressé par le contenu", () => {
  assert.equal(cheminExport(V, P, "c".repeat(64)), `${V}/${P}/${"c".repeat(64)}.pdf`);
  assert.equal(cheminExtrait(V, P, "d".repeat(64)), `${V}/${P}/${"d".repeat(64)}-extrait.pdf`);
  const sql = readFileSync("supabase/migrations/0147_zabelie_authoring_exports.sql", "utf8");
  assert.ok(sql.includes("v_base text := p_seller::text || '/' || p_projet::text || '/';"), "base du chemin en SQL");
  assert.ok(sql.includes("v_base || p_empreinte || '.pdf'"), "chemin du guide en SQL");
  assert.ok(sql.includes("v_base || p_extrait_empreinte || '-extrait.pdf'"), "chemin de l'extrait en SQL");
  assert.match(MOTEUR_PDF, /^[a-z0-9-]{1,40}$/, "la contrainte de la colonne `moteur`");
});

test("ce que l'éditeur reçoit : jamais le chemin, et une ligne mal formée devient `null`", () => {
  const e = exportPourClient(LIGNE)!;
  assert.deepEqual(Object.keys(e).sort(), ["approuveLe", "creeLe", "empreinte", "extraitPages", "extraitTaille", "id", "pages", "revision", "taille"]);
  assert.ok(!JSON.stringify(e).includes("/"), "aucun chemin");
  assert.ok(!COLONNES_EXPORT.includes("chemin"), "la page ne lit pas le chemin");
  for (const casse of [{ empreinte: "C".repeat(64) }, { empreinte: "c".repeat(63) }, { taille: 0 }, { pages: 1.5 }, { revision: "5" }, { created_at: null }]) {
    assert.equal(exportPourClient({ ...LIGNE, ...casse }), null, JSON.stringify(casse));
  }
  assert.equal(exportPourClient(null), null);
  // Aller-retour par la route : même forme.
  assert.deepEqual(lireExportClient(JSON.parse(JSON.stringify(e))), e);
  assert.equal(lireExportClient({ ...e, empreinte: "x" }), null);
});

test("T18 à l'écran : un export ne vaut que pour la révision courante ET approuvée", () => {
  assert.equal(exportAJour({ revision: 5 }, { revision: 5, revisionApprouvee: 5 }), true);
  assert.equal(exportAJour({ revision: 5 }, { revision: 6, revisionApprouvee: 5 }), false, "texte modifié depuis");
  assert.equal(exportAJour({ revision: 5 }, { revision: 6, revisionApprouvee: 6 }), false, "nouvelle approbation, ancien PDF");
  assert.equal(exportAJour({ revision: 5 }, { revision: 5, revisionApprouvee: null }), false);
});

test("taille lisible, dans la langue de l'écran", () => {
  assert.equal(tailleLisible(85912, "fr"), "84 Ko");
  assert.equal(tailleLisible(85912, "ht"), "84 Ko");
  assert.equal(tailleLisible(85912, "en"), "84 KB");
  assert.equal(tailleLisible(300, "es"), "1 KB");
  assert.equal(tailleLisible(1.25 * 1024 * 1024, "fr"), "1,3 Mo");
  assert.equal(tailleLisible(1.25 * 1024 * 1024, "en"), "1.3 MB");
});

test("nom de l'auteur : ce que le PDF sait dessiner, sans espaces doubles", () => {
  assert.equal(auteurPourPdf("  Jean-Robert   Pierre "), "Jean-Robert Pierre");
  assert.equal(auteurPourPdf("Marie " + String.fromCodePoint(0x1f33a) + " Joseph"), "Marie Joseph");
  assert.equal(auteurPourPdf("Lòt Kòlèg"), "Lòt Kòlèg", "les lettres du kreyòl passent");
});
