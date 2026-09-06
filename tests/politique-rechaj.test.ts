import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POLICY_VERSION } from "../lib/policy";

/**
 * LA LIGNE ENTRE « RECHAJ » ET « VANN BALANS » — écrite là où un vendeur la lit.
 *
 * `0098` ouvre les rayons de recharge (décision porteur du 2026-09-05). La
 * revente de SOLDE MonCash/NatCash était déjà interdite dans la liste des
 * services financiers — mais la liste ne disait pas ce qui reste PERMIS juste
 * à côté, et un vendeur honnête ne devinait pas la frontière. Ouvrir « rechaj »
 * sans écrire cette ligne ouvrait « vann balans » dans le même geste.
 *
 * Ce test tient les deux côtés ENSEMBLE : une paire dont il ne resterait que
 * l'interdit redeviendrait la liste d'avant ; une paire dont il ne resterait
 * que le permis serait une autorisation sans sa borne. Et il tient la version :
 * une règle qui change sans nouveau numéro laisserait des vendeurs tenus à un
 * texte qu'ils n'ont pas lu.
 *
 * Mutations éprouvées :
 *   PR1  le côté « allowed » retiré de la page                → rouge
 *   PR2  la clé kreyòl du côté « banned » retirée             → rouge
 *   PR3  POLICY_VERSION laissé à v2                           → rouge
 *   PR4  le critère (« minutes » / « argent ») retiré du texte → rouge
 */

const PAGE = readFileSync("app/produits-interdits/page.tsx", "utf8").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const I18N = readFileSync("lib/i18n.ts", "utf8");

test("PR1 — la page rend la paire ENTIÈRE, dans la section « ne pas confondre », après la paire armes / pièces", () => {
  const iSection = PAGE.indexOf('t(lang, "policy.confusion.h")');
  const iArmes = PAGE.indexOf('t(lang, "policy.confusion.allowed")');
  const iBanned = PAGE.indexOf('t(lang, "policy.confusion.rechaj.banned")');
  const iAllowed = PAGE.indexOf('t(lang, "policy.confusion.rechaj.allowed")');
  const iCritere = PAGE.indexOf('t(lang, "policy.confusion.rechaj.p")');
  const iSuivante = PAGE.indexOf('t(lang, "policy.tools.h")');
  assert.ok(iSection > 0 && iArmes > iSection, "section confusion introuvable");
  assert.ok(iBanned > iArmes && iAllowed > iBanned && iCritere > iAllowed && iCritere < iSuivante,
    "la paire recharge doit suivre la paire armes, DANS la même section, interdit puis permis puis critère");
  // Les deux couleurs sémantiques, comme la première paire : l'œil lit la
  // frontière avant de lire le texte.
  assert.match(PAGE, /text-danger-text">\s*\{t\(lang, "policy\.confusion\.rechaj\.banned"\)\}/);
  assert.match(PAGE, /text-success-text">\s*\{t\(lang, "policy\.confusion\.rechaj\.allowed"\)\}/);
});

test("PR2 — les trois clés existent dans les QUATRE langues, et le kreyòl emploie les mots de la rue", () => {
  for (const cle of ["policy.confusion.rechaj.banned", "policy.confusion.rechaj.allowed", "policy.confusion.rechaj.p"]) {
    const n = (I18N.match(new RegExp(`^\\s*"${cle.replace(/\./g, "\\.")}":`, "gm")) ?? []).length;
    assert.equal(n, 4, `${cle} : ${n} langue(s), 4 attendues`);
  }
  // Les mots que les gens emploient — pas le vocabulaire juridique — et ce
  // dans les deux langues du terrain. `\b` est interdit ici : il ne connaît
  // pas le kreyòl (CLAUDE.md), on ancre sur les guillemets.
  for (const mot of ["« m ap vann balans »", "« rechaj »", "« minit »"]) {
    const n = (I18N.match(new RegExp(mot.replace(/[«»]/g, (c) => "\\" + c), "g")) ?? []).length;
    assert.ok(n >= 2, `« ${mot} » doit apparaître au moins en français et en kreyòl (${n})`);
  }
});

test("PR3 — la règle a changé, donc la version a changé : v3, datée, et le texte de v2 n'est pas réécrit", () => {
  assert.equal(POLICY_VERSION, "v3");
  const src = readFileSync("lib/policy.ts", "utf8");
  assert.match(src, /\/\/ v3 \(2026-09-05\)/, "le journal des versions doit porter v3 et sa date");
  // v2 reste racontée : un registre append-only ne réécrit pas l'histoire.
  assert.match(src, /\/\/ v2 \(2026-08-02\)/);
  // La date affichée suit, dans les quatre langues.
  for (const d of ["5 septembre 2026", "5 septanm 2026", "September 5, 2026", "5 de septiembre de 2026"]) {
    assert.ok(I18N.includes(`"policy.date": "${d}"`), `policy.date « ${d} » manquante`);
  }
});

test("PR4 — le critère qui départage est écrit : des minutes sur un téléphone, ou de l'argent qu'on renvoie", () => {
  // C'est la phrase qui rend la règle applicable par quelqu'un qui n'est pas
  // juriste. Sans elle, les deux encadrés sont deux slogans.
  const fr = /"policy\.confusion\.rechaj\.p":\s*\n\s*"([^"]+)"/.exec(I18N)?.[1] ?? "";
  assert.match(fr, /minutes/);
  assert.match(fr, /argent/);
  assert.match(fr, /Zabelie n'en fait pas/);
  const blocs = I18N.split(/"policy\.confusion\.rechaj\.p":/).slice(1);
  assert.equal(blocs.length, 4);
  assert.match(blocs[1], /minit/, "kreyòl : le critère nomme les minutes");
  assert.match(blocs[1], /lajan/, "kreyòl : le critère nomme l'argent");
});
