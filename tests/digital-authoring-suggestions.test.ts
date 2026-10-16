import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Studio de création éditoriale — suggestions à l'écran (tâche 3.3, PRD T13).
 * La garantie « une réponse n'écrit jamais d'elle-même dans le texte » est
 * STRUCTURELLE : le crochet des suggestions n'a aucun accès au texte, et les
 * seuls gestes qui reprennent une proposition sont des clics.
 */

const crochet = readFileSync("components/authoring-suggestion.tsx", "utf8");
const editeur = readFileSync("components/authoring-editor.tsx", "utf8");

test("le crochet des suggestions ne peut pas toucher au texte du guide", () => {
  for (const interdit of ["setContenu", "majSection", "setBrief", "setProjet", "toucher("]) {
    assert.ok(!crochet.includes(interdit), `le crochet manipule le texte : ${interdit}`);
  }
});

test("reprendre une proposition : seulement depuis un clic", () => {
  for (const geste of ["remplacerParSuggestion", "ajouterSuggestion", "utiliserPlan", "copierSuggestion"]) {
    const appels = [...editeur.matchAll(new RegExp(`${geste}\\(`, "g"))].length;
    const definition = (editeur.match(new RegExp(`(async )?function ${geste}\\(`, "g")) ?? []).length;
    const clics = (editeur.match(new RegExp(`onClick=\\{\\(\\) => (void )?${geste}\\(`, "g")) ?? []).length;
    assert.equal(definition, 1, `${geste} : une définition`);
    assert.ok(clics >= 1, `${geste} : aucun clic ne l'appelle`);
    assert.equal(appels, definition + clics, `${geste} : appelé ailleurs que depuis un clic`);
  }
});

test("rien ne part sans l'information affichée puis le clic « Envoyer »", () => {
  // `demander` n'envoie rien : il ouvre la confirmation. Seul `envoyer` appelle l'API.
  assert.match(crochet, /demander: \(type: TypeOperation, sectionId: string \| null\) => setConfirmation\(\{ type, sectionId \}\)/);
  assert.equal((crochet.match(/fetch\("\/api\/digital-authoring\/operations",/g) ?? []).length, 1);
  assert.match(crochet, /onClick=\{\(\) => void s\.envoyer\(\)\}/);
  assert.match(crochet, /\{sectionId === null \? labels\.infoEnvoiPlan : labels\.infoEnvoi\}/);
});

test("aucune trace d'IA quand le moteur n'est pas disponible", () => {
  const page = readFileSync("app/tableau-de-bord/creation/[projectId]/page.tsx", "utf8");
  assert.match(page, /const ia = choisirMoteur\(lireEnvCreation\(\)\)\.ok;/);
  assert.match(page, /ia=\{ia\}/);
  assert.match(editeur, /\{ia && \(/);
  assert.match(editeur, /ia = false,/, "par défaut : pas d'IA");
});

test("le sondage s'espace et se suspend hors ligne ou onglet caché", () => {
  assert.match(crochet, /attente = Math\.min\(Math\.round\(attente \* 1\.6\), 8000\);/);
  assert.match(crochet, /document\.hidden \|\| navigator\.onLine === false/);
});
