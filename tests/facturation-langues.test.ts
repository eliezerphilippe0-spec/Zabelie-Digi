import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { LANGS } from "@/lib/i18n";
import { FACTURATION, facturationCopy, type FacturationCopy } from "@/lib/facturation-copy";

/**
 * « FÈ M PEYE » EN QUATRE LANGUES.
 *
 * ⚠️ NÉ DE L'AUDIT PAGE PAR PAGE DU 2026-10-17 : l'espace pro, l'éditeur de
 * facture et la page publique d'une facture étaient écrits en dur, en
 * français, au tutoiement. La page publique est lue par le CLIENT du
 * professionnel, qui n'a jamais choisi Zabelie : c'est elle qui comptait le
 * plus, et c'est elle qui ne suivait pas la langue du visiteur.
 */

const FICHIERS = [
  "app/pro/page.tsx",
  "app/pro/facture/[id]/page.tsx",
  "app/facture/[token]/page.tsx",
  "components/business/pro-console.tsx",
  "components/business/invoice-editor.tsx",
  "components/business/pay-invoice-button.tsx",
];

const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Toutes les chaînes d'une table, sous-tables de statuts comprises. */
function chaines(c: FacturationCopy): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(c)) {
    if (typeof v === "string") out.push([k, v]);
    else for (const [s, w] of Object.entries(v)) out.push([`${k}.${s}`, w as string]);
  }
  return out;
}

test("B1 — les quatre langues ont toutes les clés, aucune vide", () => {
  const ref = chaines(FACTURATION.fr).map(([k]) => k).sort();
  assert.ok(ref.length >= 80, "la table française s'est vidée");
  for (const lang of LANGS) {
    const c = chaines(FACTURATION[lang]);
    assert.deepEqual(c.map(([k]) => k).sort(), ref, `clés différentes en ${lang}`);
    for (const [k, v] of c) assert.ok(v.trim(), `${k} vide en ${lang}`);
  }
});

test("B2 — plus aucun texte en dur dans les six fichiers de la facturation", () => {
  /* Connu-positif : chacune de ces phrases était à l'écran avant la correction. */
  const ANCIENS = [
    "Ouvre ton espace pro",
    "Choisis un client.",
    "Ajoute d&apos;abord un client",
    "Partage-le à ton client",
    "Payer avec MonCash",
    "Facture de",
    "Paiement reçu",
    "Connecte-toi",
    "Aucune facture pour l",
    "Brouillon",
    "Connexion impossible.",
    "Se connecter",
  ];
  for (const f of FICHIERS) {
    const src = sansCommentaires(readFileSync(f, "utf8"));
    for (const a of ANCIENS) assert.ok(!src.includes(a), `« ${a} » est revenu en dur dans ${f}`);
  }
});

test("B3 — le français vouvoie, comme le reste du site", () => {
  const TU = /(?<![\p{L}])(tu|ton|ta|tes|toi)(?![\p{L}])/iu;
  assert.ok(TU.test("Ouvre ton espace pro"), "le détecteur ne voit plus le tutoiement");
  for (const [k, v] of chaines(FACTURATION.fr)) {
    assert.ok(!TU.test(v), `fr.${k} tutoie : « ${v} »`);
  }
});

test("B4 — le kreyòl n'a pas gardé de mots français", () => {
  const FRANCAIS = /(?<![\p{L}])(facture|factures|paiement|client|clients|réglée?|annulée|envoyée|ligne)(?![\p{L}])/iu;
  for (const [k, v] of chaines(FACTURATION.ht)) {
    assert.ok(!FRANCAIS.test(v), `ht.${k} contient du français : « ${v} »`);
  }
});

test("B5 — la règle d'arrondi EN VIGUEUR est insérée, sans marqueur restant", () => {
  for (const lang of LANGS) {
    const c = facturationCopy(lang);
    assert.ok(!c.openBody.includes("{arrondi}"), `{arrondi} non remplacé en ${lang}`);
    assert.ok(
      c.openBody.includes(FACTURATION[lang].roundingFloor) || c.openBody.includes(FACTURATION[lang].roundingNearest),
      `aucune règle d'arrondi dans le texte d'ouverture (${lang})`
    );
  }
});

test("B6 — « Paiement reçu » n'apparaît que pour une facture payée en base", () => {
  /* Même défaut que SEC-01 : `?paye=1` vient de l'URL, n'importe qui peut
   * l'ajouter au lien d'une facture impayée. Le remerciement doit dépendre du
   * statut relu en base, et l'URL seule ne doit donner qu'une phrase d'attente. */
  const src = sansCommentaires(readFileSync("app/facture/[token]/page.tsx", "utf8"));
  assert.match(src, /const paiementRecu = \["paid", "partially_paid"\]\.includes\(inv\.status\);/);
  assert.match(src, /\{paye === "1" && paiementRecu && \([\s\S]{0,200}\{c\.paidThanks\}/, "le remerciement ne dépend plus du statut");
  assert.match(src, /\{paye === "1" && !paiementRecu && \([\s\S]{0,200}\{c\.checking\}/, "l'URL seule ne donne plus de phrase d'attente");
  assert.equal(src.match(/c\.paidThanks/g)?.length, 1, "le remerciement est rendu ailleurs, hors du garde");
});

test("B7 — les pages lisent la langue du visiteur et passent les libellés", () => {
  for (const f of ["app/pro/page.tsx", "app/pro/facture/[id]/page.tsx", "app/facture/[token]/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /getLang\(\)/, `${f} ne lit plus la langue`);
    assert.match(src, /facturationCopy\(/, `${f} ne construit plus ses libellés`);
  }
  /* Les composants client ne reçoivent que le TYPE : le dictionnaire ne doit
   * pas entrer dans le bundle (règle de `lib/i18n.ts`). */
  for (const f of FICHIERS.filter((x) => x.startsWith("components/"))) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /import \{[^}]*\} from "@\/lib\/facturation-copy"/, `${f} importe la table entière`);
    assert.match(src, /import type \{[^}]*\} from "@\/lib\/facturation-copy"/, `${f} ne reçoit plus ses libellés typés`);
  }
});
