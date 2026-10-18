import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { lireOpportunites, titreDepuisParametre, titreDepuisTerme } from "../lib/digital-authoring/opportunites";
import { IDS_MODELES, contenuDepuisModele } from "../lib/digital-authoring/modeles";
import { copieCreation } from "../lib/digital-authoring/copy";

/**
 * Studio de création éditoriale — le tableau (tasks/plan.md, phase T ;
 * décisions du 2026-10-16). Ce qui est prouvé ici : aucune opportunité n'est
 * devinée, aucune entrée ne mène à une fonction absente, les publicités ont
 * disparu, les modèles parlent de savoir-faire.
 */

const brut = {
  jours: 30,
  seuils: { personnes: 5, ventes: 3, vendeurs: 2 },
  recherches: [{ terme: "aprann angle", personnes: 7 }],
  ventes: [{ rayon_ht: "Pwodwi dijital", rayon_fr: "Produits digitaux", rayon_en: "Digital products", rayon_es: null, ventes: 4 }],
};

test("opportunités : relues telles que la base les rend, dans la langue de l'interface", () => {
  assert.deepEqual(lireOpportunites(brut, "ht"), {
    jours: 30,
    seuils: { personnes: 5, ventes: 3, vendeurs: 2 },
    recherches: [{ terme: "aprann angle", personnes: 7 }],
    ventes: [{ rayon: "Pwodwi dijital", ventes: 4 }],
  });
  assert.equal(lireOpportunites(brut, "en")?.ventes[0].rayon, "Digital products");
  // Libellé absent dans la langue : le français, jamais un vide.
  assert.equal(lireOpportunites(brut, "es")?.ventes[0].rayon, "Produits digitaux");
});

test("opportunités : une forme inattendue donne « indisponible », jamais un chiffre deviné", () => {
  for (const mauvais of [null, "x", [], {}, { ...brut, jours: "30" }, { ...brut, seuils: null }, { ...brut, recherches: null }, { ...brut, seuils: { personnes: -1, ventes: 3, vendeurs: 2 } }]) {
    assert.equal(lireOpportunites(mauvais, "fr"), null, JSON.stringify(mauvais));
  }
  // Une ligne illisible est écartée, les autres restent.
  const melange = { ...brut, recherches: [{ terme: "", personnes: 9 }, { terme: "koud", personnes: 2.5 }, { terme: "kwafi", personnes: 6 }] };
  assert.deepEqual(lireOpportunites(melange, "fr")?.recherches, [{ terme: "kwafi", personnes: 6 }]);
});

test("titre repris d'une recherche : un point de départ court, sans caractère de contrôle", () => {
  assert.equal(titreDepuisTerme("aprann angle"), "Aprann angle");
  assert.equal(titreDepuisTerme("   "), "");
  const controle = String.fromCodePoint(0) + "Gid" + String.fromCodePoint(10) + String.fromCodePoint(127) + "koud";
  assert.equal(titreDepuisParametre(controle), "Gid koud");
  assert.equal(titreDepuisParametre(["a", "b"]), "");
  assert.equal(titreDepuisParametre(undefined), "");
  assert.equal(titreDepuisParametre("x".repeat(400)).length, 160);
});

test("modèles : du savoir-faire, sept sections au plus, aucun reste de l'ancien modèle « recette »", () => {
  assert.deepEqual([...IDS_MODELES], ["activite", "metier", "methode", "kit"]);
  for (const id of IDS_MODELES) {
    for (const langue of ["ht", "fr"] as const) {
      const c = contenuDepuisModele(id, langue, () => crypto.randomUUID());
      assert.ok(c.sections.length >= 4 && c.sections.length <= 7, `${id} ${langue}`);
      assert.ok(c.sections.every((s) => s.titre && s.resultat && s.corps === ""), `${id} ${langue} : plan sans texte écrit à la place du créateur`);
    }
  }
  const src = readFileSync("lib/digital-authoring/modeles.ts", "utf8") + readFileSync("lib/digital-authoring/copy.ts", "utf8");
  for (const ancien of ["recette", "Engredyan", "Ingrédients", "resèt", "Resèt"]) {
    assert.ok(!src.includes(ancien), `reste : ${ancien}`);
  }
});

test("tableau : audio et vidéo annoncés sans lien ni bouton ; la mise en vente annoncée, pas promise", () => {
  const src = readFileSync("app/tableau-de-bord/creation/page.tsx", "utf8");
  assert.match(src, /\{ cle: "audio", titre: tb\.formatAudio, desc: tb\.formatAudioDesc, actif: false \}/);
  assert.match(src, /\{ cle: "video", titre: tb\.formatVideo, desc: tb\.formatVideoDesc, actif: false \}/);
  const formats = src.slice(src.indexOf("{formats.map("), src.indexOf("</ul>", src.indexOf("{formats.map(")));
  assert.ok(!/<Link|<a |<button|onClick/.test(formats), "un format annoncé n'est jamais cliquable");
  assert.match(src, /\{ titre: tb\.etape3Titre, texte: tb\.etape3, bientot: true \}/);
});

test("tableau : la langue du guide suit l'interface (ht ou fr), sinon le kreyòl", () => {
  const src = readFileSync("app/tableau-de-bord/creation/page.tsx", "utf8");
  assert.match(src, /langueDefaut=\{lang === "fr" \? "fr" : "ht"\}/);
  const form = readFileSync("components/authoring-create-form.tsx", "utf8");
  assert.match(form, /useState<"ht" \| "fr">\(langueDefaut\)/);
});

test("menu du Studio : seulement des pages qui existent", () => {
  const src = readFileSync("components/studio-shell.tsx", "utf8");
  const liens = [...new Set([...src.matchAll(/href: "([^"]+)"/g)].map((m) => m[1].split(/[?#]/)[0]))];
  // Le Studio, puis les pages vendeur déjà en ligne (phase T2, Chariow).
  assert.deepEqual(liens, ["/tableau-de-bord/creation", "/tableau-de-bord/creation/analyse", "/mes-ventes", "/tableau-de-bord", "/aide"]);
  for (const lien of liens) {
    const route = `app${lien}/page.tsx`;
    assert.ok(readFileSync(route, "utf8").includes("export default"), route);
  }
});

test("analyse : drapeau, session, noindex ; seuils affichés tels que la base les applique", () => {
  const src = readFileSync("app/tableau-de-bord/creation/analyse/page.tsx", "utf8");
  assert.match(src, /if \(!creationActive\(lireEnvCreation\(\)\)\) notFound\(\);/);
  assert.match(src, /redirect\("\/connexion\?next=\/tableau-de-bord\/creation\/analyse"\)/);
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.ok(!src.includes("createAdminClient"));
  assert.match(src, /\.replace\("\{sessions\}", String\(opp\.seuils\.personnes\)\)/);
});

test("libellés : chaque langue porte le tableau, sans trace de publicité", () => {
  for (const lang of ["ht", "fr", "en", "es"] as const) {
    const c = copieCreation(lang);
    assert.ok(c.tableau.oppVide && c.tableau.bientot && c.tableau.formatAudio, lang);
    assert.ok(!("entreePub" in c), `${lang} : entrée publicité`);
  }
});
