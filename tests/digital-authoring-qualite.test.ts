import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { SEUILS, ficheTest, regrouperParCode, type CodeControle } from "../lib/digital-authoring/quality";
import type { Contenu } from "../lib/digital-authoring/schema";
import { GUIDE_ESSAI } from "./helpers/guide-essai";

/**
 * Fiche-test de préparation (tâche 4.2 ; idée 5 validée le 2026-10-16).
 * Ce qui est prouvé : chaque problème bloquant bloque, un guide propre est
 * « prêt », les conseils n'empêchent rien, les seuils sont exacts.
 */

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NL = String.fromCharCode(10);

function contenuEssai(): Contenu {
  return {
    objectif: GUIDE_ESSAI.objectif,
    sections: GUIDE_ESSAI.sections.map((s, i) => ({ id: uuid(i + 1), titre: s.titre, resultat: s.resultat, corps: s.corps })),
  };
}

/** Un guide prêt à vendre : assez long, sans répétition, avec un exercice, sans chiffre ni lien. */
function contenuPropre(): Contenu {
  const paragraphe = (i: number) =>
    `Paragraf ${i} : chak etap gen pwòp rezon li, e lektè a dwe konprann poukisa li fè l anvan li fè l. ` +
    `Lè li konprann rezon an, li pi fasil pou l kontinye menm lè bagay yo vin difisil, e li ka adapte metòd la ak sitiyasyon pa l ${i}.`;
  return {
    objectif: "Lektè a konnen kijan pou l lanse yon ti biznis.",
    sections: Array.from({ length: 6 }, (_, s) => ({
      id: uuid(s + 1),
      titre: s === 5 ? "Egzèsis ak plan aksyon" : `Etap ${s + 1}`,
      resultat: "Lektè a konnen sa pou l fè.",
      corps: Array.from({ length: 7 }, (_, k) => paragraphe(s * 10 + k)).join(NL + NL),
    })),
  };
}

const codes = (f: ReturnType<typeof ficheTest>) => f.controles.map((c) => c.code);

test("guide propre : « prêt », aucun bloquant, aucun conseil", () => {
  const f = ficheTest({ titre: "Lanse ti biznis ou", contenu: contenuPropre(), planApprouve: true });
  assert.deepEqual(f.controles, []);
  assert.equal(f.preparation, "pret");
});

test("guide d'essai : aucun bloquant ; conseils sur la répétition, les chiffres et le lien", () => {
  const f = ficheTest({ titre: GUIDE_ESSAI.titre, contenu: contenuEssai(), planApprouve: true });
  assert.equal(f.bloquants, 0);
  assert.equal(f.preparation, "presque");
  for (const c of ["paragraphe_repete", "chiffres_a_verifier", "liens_a_verifier"] as CodeControle[]) assert.ok(codes(f).includes(c), c);
  const chiffres = f.controles.find((c) => c.code === "chiffres_a_verifier")!;
  assert.ok(chiffres.details.some((d) => d.includes("500 goud")), JSON.stringify(chiffres.details));
  const liens = f.controles.find((c) => c.code === "liens_a_verifier")!;
  assert.ok(liens.details[0].startsWith("https://zabelie.com/boutik/"));
});

test("chaque bloquant bloque, avec la section en cause", () => {
  const cas: Array<[string, (c: Contenu) => void, CodeControle, number | null]> = [
    ["section vide", (c) => (c.sections[1].corps = "   "), "section_vide", 2],
    ["titre vide", (c) => (c.sections[2].titre = ""), "titre_section_vide", 3],
    ["titre fait d'espaces", (c) => (c.sections[2].titre = "   "), "titre_section_vide", 3],
    ["émoji dans l'objectif", (c) => (c.objectif += " " + String.fromCodePoint(0x1f680)), "caracteres_pdf", null],
    ["TODO", (c) => (c.sections[0].corps += " TODO : fini sa"), "marqueur_inacheve", 1],
    ["crochets", (c) => (c.sections[3].corps += " [...]"), "marqueur_inacheve", 4],
    ["simulation", (c) => (c.sections[4].corps += " [SIMULASYON] Bouyon pou « Etap »."), "marqueur_simulation", 5],
    ["simulation fr", (c) => (c.sections[4].resultat = "[SIMULATION] Brouillon"), "marqueur_simulation", 5],
    ["émoji", (c) => (c.sections[5].corps += " " + String.fromCodePoint(0x1f600)), "caracteres_pdf", 6],
  ];
  for (const [nom, modifier, code, section] of cas) {
    const c = contenuPropre();
    modifier(c);
    const f = ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
    const trouve = f.controles.find((x) => x.code === code);
    assert.ok(trouve, nom);
    assert.equal(trouve.niveau, "bloquant", nom);
    assert.equal(trouve.section, section, nom);
    assert.equal(f.preparation, "pas_pret", nom);
  }
  // Les marqueurs et les caractères sont nommés.
  const c = contenuPropre();
  c.sections[0].corps += " TODO XXX " + String.fromCodePoint(0x2713);
  const f = ficheTest({ titre: "Gid " + String.fromCodePoint(0x1f600), contenu: c, planApprouve: true });
  assert.deepEqual(f.controles.find((x) => x.code === "marqueur_inacheve")!.details, ["TODO", "XXX"]);
  assert.deepEqual(f.controles.filter((x) => x.code === "caracteres_pdf").map((x) => [x.section, x.details]), [
    [1, [String.fromCodePoint(0x2713)]],
    [null, [String.fromCodePoint(0x1f600)]],
  ]);
});

test("guide sans section ou plan non approuvé : pas prêt", () => {
  const vide = ficheTest({ titre: "Gid", contenu: { objectif: "x", sections: [] }, planApprouve: true });
  assert.deepEqual(codes(vide), ["aucune_section"]);
  const plan = ficheTest({ titre: "Gid", contenu: contenuPropre(), planApprouve: false });
  assert.deepEqual(codes(plan), ["plan_non_approuve"]);
  assert.equal(plan.preparation, "pas_pret");
});

test("conseils : signalés, jamais bloquants", () => {
  const c = contenuPropre();
  c.objectif = "";
  c.sections[0].resultat = "";
  c.sections[5].titre = "Dènye etap";
  const f = ficheTest({ titre: "T".repeat(SEUILS.titreLong + 1), contenu: c, planApprouve: true });
  assert.deepEqual(new Set(codes(f)), new Set(["objectif_vide", "resultat_manquant", "titre_long", "sans_exercice"]));
  assert.ok(f.controles.every((x) => x.niveau === "conseil"));
  assert.equal(f.preparation, "presque");
});

test("seuils exacts : section courte, guide court, paragraphe répété", () => {
  const avec = (corps: string) => {
    const c = contenuPropre();
    c.sections[0].corps = corps;
    return ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
  };
  assert.ok(codes(avec("a".repeat(SEUILS.sectionCourte - 1))).includes("section_courte"));
  assert.ok(!codes(avec("a".repeat(SEUILS.sectionCourte))).includes("section_courte"));
  const court = ficheTest({
    titre: "Gid",
    contenu: { objectif: "x", sections: [{ id: uuid(1), titre: "Egzèsis", resultat: "r", corps: "mo ".repeat(SEUILS.guideCourt - 1) }] },
    planApprouve: true,
  });
  assert.ok(codes(court).includes("guide_court"));
  const repete = "Yon paragraf ki repete menm jan an nan de seksyon diferan, mo pou mo, san okenn chanjman ditou.";
  assert.ok(repete.length >= SEUILS.paragrapheRepete);
  const c = contenuPropre();
  c.sections[0].corps += NL + NL + repete;
  c.sections[3].corps += NL + NL + repete;
  const f = ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
  assert.ok(f.controles.find((x) => x.code === "paragraphe_repete")!.details[0].endsWith("(1, 4)"));
});

test("source : module pur, sans réseau ni base", () => {
  const src = readFileSync("lib/digital-authoring/quality.ts", "utf8");
  for (const interdit of ["fetch(", "supabase", "process.env", "Date("]) assert.ok(!src.includes(interdit), interdit);
});

test("bloquant et conseils ensemble : « pas prêt », jamais « presque »", () => {
  const c = contenuPropre();
  c.objectif = ""; // conseil
  c.sections[0].corps += " TODO"; // bloquant
  const f = ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
  assert.equal(f.bloquants, 1);
  assert.equal(f.conseils, 1);
  assert.equal(f.preparation, "pas_pret");
});

test("regroupement : une carte par problème, sections dans l'ordre, rien de perdu", () => {
  const c = contenuPropre();
  for (const i of [1, 3, 4]) c.sections[i].corps = "Kout.";
  c.sections[2].corps += " TODO";
  const f = ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
  const groupes = regrouperParCode(f.controles);
  assert.equal(groupes.flat().length, f.controles.length, "aucun contrôle perdu ni dupliqué");
  const courtes = groupes.find((g) => g[0].code === "section_courte")!;
  assert.deepEqual(courtes.map((x) => x.section), [2, 4, 5]);
  assert.ok(groupes.every((g) => g.every((x) => x.code === g[0].code)), "un seul code par carte");
  assert.equal(new Set(groupes.map((g) => g[0].code)).size, groupes.length, "un code, une carte");
  assert.equal(groupes[0][0].code, f.controles[0].code, "ordre de première apparition");
});

test("extraits de chiffres : un seul pour deux chiffres voisins, coupé aux limites des mots", () => {
  const c = contenuPropre();
  c.sections[0].corps = "Pou kòmanse, fòk ou genyen 1 500 goud, epi kenbe 10 % maj pou pi piti. " + "Lòt bagay ".repeat(20) + "Pri a se 250 goud chak semèn.";
  const f = ficheTest({ titre: "Gid", contenu: c, planApprouve: true });
  const d = f.controles.find((x) => x.code === "chiffres_a_verifier" && x.section === 1)!.details;
  assert.equal(d.length, 2, JSON.stringify(d));
  assert.ok(d[0].includes("1 500 goud") && d[0].includes("10 %"), "deux chiffres voisins : un extrait");
  for (const e of d) {
    const coeur = e.replace(/^…/, "").replace(/…$/, "");
    const mots = c.sections[0].corps.split(" ");
    assert.ok(mots.includes(coeur.split(" ")[0]) && mots.includes(coeur.split(" ").at(-1)!), `mot coupé : ${e}`);
  }
});
