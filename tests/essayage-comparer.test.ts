import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { estimerCout, lireProduits, melanger, planifier, principal, verifierSortie, PRIX_PAR_ESSAI_USD } from "../scripts/essayage-comparer";
import { simulation } from "../lib/essayage/fournisseurs/simulation";
import type { FournisseurEssayage } from "../lib/essayage/fournisseurs/types";

/**
 * ESSAYAGE VIRTUEL — outil de comparaison à l'aveugle (docs/74 §4.2 ;
 * tasks/essayage-todo.md 2.3).
 *
 * À blanc par défaut : il compte et annonce le coût, sans un seul appel.
 * Avec `--payer` : il appelle, et écrit HORS du dépôt une planche anonyme et
 * une clé séparée. Ici, les fournisseurs sont des simulations : aucun appel
 * réel, aucun coût.
 */

const DEPOT = resolve(".");
function dossierPhotos(n: number) {
  const d = mkdtempSync(join(tmpdir(), "essayage-photos-"));
  for (let i = 1; i <= n; i++) writeFileSync(join(d, `cliente-${String(i).padStart(2, "0")}.jpg`), Buffer.from([0xff, 0xd8, 0xff, 0xe0, i]));
  writeFileSync(join(d, "notes.txt"), "pas une photo");
  return d;
}
function fichierProduits(produits: unknown) {
  const d = mkdtempSync(join(tmpdir(), "essayage-produits-"));
  const f = join(d, "produits.json");
  writeFileSync(f, JSON.stringify(produits));
  return f;
}
const PRODUITS = [
  { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/robe.jpg", titre: "Robe <karabela>", piece: "entier" },
  { imageUrl: "https://exemple.supabase.co/storage/v1/object/public/covers/chemise.jpg", titre: "Chemise", piece: "haut" },
];
const sortieTemp = () => join(mkdtempSync(join(tmpdir(), "essayage-sortie-")), "resultats");
const reseauInterdit: typeof fetch = async () => {
  throw new Error("aucun appel réseau attendu");
};

test("C1 — le plan croise photos, vêtements et candidats ; le coût annoncé suit les prix relevés", () => {
  const plan = planifier(["a.jpg", "b.jpg", "c.jpg"], PRODUITS as never, ["genlook", "fashn"]);
  assert.equal(plan.length, 12);
  assert.deepEqual(estimerCout(plan), { genlook: { essais: 6, usd: 0.24 }, fashn: { essais: 6, usd: 0.45 } });
  assert.deepEqual(PRIX_PAR_ESSAI_USD, { genlook: 0.04, fashn: 0.075 });
});

test("C2 — à blanc : le coût est annoncé, rien n'est appelé, rien n'est écrit", async () => {
  const sortie = sortieTemp();
  const lignes: string[] = [];
  const code = await principal(["--candidats", "genlook,fashn", "--photos", dossierPhotos(3), "--produits", fichierProduits(PRODUITS), "--sortie", sortie], {
    fetch: reseauInterdit,
    ecrire: (l) => lignes.push(l),
  });
  assert.equal(code, 0);
  const texte = lignes.join("\n");
  assert.match(texte, /genlook\s+6 essais\s+0,24 \$/);
  assert.match(texte, /fashn\s+6 essais\s+0,45 \$/);
  assert.match(texte, /À BLANC/);
  assert.equal(existsSync(sortie), false);
});

test("C3 — la sortie est refusée dans le dépôt, acceptée ailleurs", () => {
  for (const d of [DEPOT, join(DEPOT, "resultats"), join(DEPOT, "tests", "x")]) assert.throws(() => verifierSortie(d, DEPOT), /dépôt/, d);
  assert.doesNotThrow(() => verifierSortie(sortieTemp(), DEPOT));
});

test("C4 — les vêtements sont vérifiés : https, titre, ce que couvre le vêtement", () => {
  assert.equal(lireProduits(fichierProduits(PRODUITS)).length, 2);
  for (const faux of [
    [{ ...PRODUITS[0], imageUrl: "http://exemple.com/robe.jpg" }],
    [{ ...PRODUITS[0], piece: "pieds" }],
    [{ ...PRODUITS[0], titre: "" }],
    [],
    { pasUnTableau: true },
  ]) {
    assert.throws(() => lireProduits(fichierProduits(faux)), JSON.stringify(faux).slice(0, 40));
  }
});

test("C5 — le candidat « maison » attend la tâche 2.4 ; un candidat inconnu est refusé", async () => {
  for (const candidats of ["maison", "genlook,maison", "openai"]) {
    const lignes: string[] = [];
    const code = await principal(["--candidats", candidats, "--photos", dossierPhotos(1), "--produits", fichierProduits(PRODUITS)], { fetch: reseauInterdit, ecrire: (l) => lignes.push(l) });
    assert.equal(code, 2, candidats);
  }
});

test("C6 — payer sans la clé du fournisseur choisi : refus, avant tout appel", async () => {
  const avant = process.env.GENLOOK_API_KEY;
  delete process.env.GENLOOK_API_KEY;
  try {
    const code = await principal(["--candidats", "genlook", "--photos", dossierPhotos(1), "--produits", fichierProduits(PRODUITS), "--sortie", sortieTemp(), "--payer"], {
      fetch: reseauInterdit,
      ecrire: () => {},
    });
    assert.equal(code, 2);
  } finally {
    if (avant !== undefined) process.env.GENLOOK_API_KEY = avant;
  }
});

test("C7 — payer : planche anonyme, clé séparée, grille de notes, résumé ; les résultats retrouvent leur candidat", async () => {
  const sortie = sortieTemp();
  const fabriques: Record<string, FournisseurEssayage> = {
    genlook: { ...simulation({ delaiMs: 0 }), nom: "genlook" },
    fashn: { ...simulation({ delaiMs: 0, echec: "moderation" }), nom: "fashn" },
  };
  const code = await principal(["--candidats", "genlook,fashn", "--photos", dossierPhotos(2), "--produits", fichierProduits(PRODUITS), "--sortie", sortie, "--payer", "--graine", "7"], {
    fetch: reseauInterdit,
    fabrique: (nom) => fabriques[nom],
    attendre: async () => {},
    ecrire: () => {},
  });
  assert.equal(code, 0);
  assert.deepEqual(readdirSync(sortie).sort(), ["cle-a-ouvrir-apres-notation.json", "notes.csv", "planche.html", "resume.json"]);

  const planche = readFileSync(join(sortie, "planche.html"), "utf8");
  // Sans les données des images (du base64, où « ms » peut apparaître par hasard).
  const texte = planche.replace(/data:[^"]+/g, "");
  assert.doesNotMatch(texte, /genlook|fashn|simulation|\d+\s?ms\b|durée/i, "la planche ne trahit pas le candidat");
  assert.match(planche, /Robe &lt;karabela&gt;/, "les titres sont échappés");
  assert.match(planche, /data:image\/svg\+xml;base64,/);

  const cle = JSON.parse(readFileSync(join(sortie, "cle-a-ouvrir-apres-notation.json"), "utf8"));
  assert.equal(cle.graine, 7);
  assert.equal(cle.essais.length, 8);
  for (const e of cle.essais) {
    assert.match(e.etiquette, /^P\d{2}-V\d{2}-[A-Z]$/);
    assert.equal(e.statut, e.candidat === "genlook" ? "reussi" : "echec");
  }
  const notes = readFileSync(join(sortie, "notes.csv"), "utf8").trim().split("\n");
  assert.equal(notes[0], "etiquette;fidelite_vetement;peau_cheveux;morphologie;defauts;commentaire");
  assert.equal(notes.length, 1 + 8);

  const resume = JSON.parse(readFileSync(join(sortie, "resume.json"), "utf8"));
  assert.deepEqual(resume.genlook.reussis, 4);
  assert.deepEqual(resume.fashn.echecs, { moderation: 4 });
  assert.equal(resume.genlook.coutReelUsd, 0.16, "seuls les essais réussis sont facturés");
  assert.equal(resume.fashn.coutReelUsd, 0);
});

test("C8 — le mélange est reproductible avec une graine, et mélange vraiment", () => {
  const liste = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(melanger(liste, 42), melanger(liste, 42));
  assert.notDeepEqual(melanger(liste, 42), liste);
  assert.deepEqual([...melanger(liste, 42)].sort((a, b) => a - b), liste, "rien de perdu");
});

test("C9 — une sortie déjà remplie n'est pas écrasée", async () => {
  const sortie = sortieTemp();
  mkdirSync(sortie, { recursive: true });
  writeFileSync(join(sortie, "planche.html"), "ancienne série");
  const code = await principal(["--candidats", "genlook", "--photos", dossierPhotos(1), "--produits", fichierProduits(PRODUITS), "--sortie", sortie, "--payer"], {
    fetch: reseauInterdit,
    fabrique: () => ({ ...simulation({ delaiMs: 0 }), nom: "genlook" }),
    attendre: async () => {},
    ecrire: () => {},
  });
  assert.equal(code, 2);
  assert.equal(readFileSync(join(sortie, "planche.html"), "utf8"), "ancienne série");
});
