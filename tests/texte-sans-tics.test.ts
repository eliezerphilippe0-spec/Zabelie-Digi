import { test } from "node:test";
import assert from "node:assert/strict";
import { DICT } from "../lib/i18n";

/**
 * PAS DE TICS DE TEXTE GÉNÉRÉ — demande du porteur du 2026-09-26 : « élimine
 * toutes les phrases qui font trop IA ».
 *
 * Mesuré avant : « Découvrez… / Explorez… » en tête de la bannière, du
 * catalogue et des descriptions ; « pensé pour le contexte local » au pied de
 * page ; « en quelques secondes » ; « arrive bientôt. Revenez très vite ! ».
 * Réécrits en disant la chose elle-même.
 *
 * « Bientôt / coming soon / pronto » n'est PAS visé : ce n'est pas un tic, c'est
 * une PROMESSE commerciale (NatCash, Stripe, paiement groupé, recharge), zone
 * d'arrêt du porteur (docs/25 §4). Seul son accompagnement — « Revenez très
 * vite ! » — l'était.
 *
 * Le tiret cadratin n'est PAS visé : c'est une ponctuation légitime en français
 * et en kreyòl (préambule de `.claude/skills/design-taste-frontend`, règle 3).
 * Le kreyòl n'a pas de motif ici : ses tics se jugent à l'oreille, par un
 * locuteur — les traductions suivent le français réécrit.
 */

const TICS: Record<"fr" | "en" | "es", RegExp> = {
  fr: /\b(Découvrez|Explorez|Plongez|Laissez-vous)\b|pensée?s? pour|en quelques (secondes|clics)|en toute simplicité|sans effort|Revenez très vite|à découvrir|découvrir comment/i,
  en: /\b(Discover|Unlock|Elevate|Empower|Seamless\w*|Effortless\w*|Dive into)\b|\b(built|designed|crafted) for\b|in (just )?(a few )?seconds|check back shortly/i,
  es: /\b(Descubre|Explora|Sumérgete)\b|pensad[oa]s? para|en (unos )?segundos|vuelve muy pronto/i,
};

/** Libellés de navigation d'un mot : « Explorer » y est un nom de rubrique, pas un slogan. */
const EXEMPTES = new Set(["footer.explore", "home.explore"]);

test("X1 — le détecteur voit les tics, et pas le texte sobre (cas connus)", () => {
  assert.ok(TICS.fr.test("Découvrez les offres des vendeurs haïtiens"));
  assert.ok(TICS.fr.test("Paiement mobile money, pensé pour le contexte local."));
  assert.ok(TICS.en.test("Mobile money payments, built for local conditions."));
  assert.ok(TICS.es.test("Recarga cualquier teléfono en segundos."));
  assert.ok(!TICS.fr.test("Les offres des vendeurs haïtiens"));
  assert.ok(!TICS.en.test("Offers from Haitian sellers"));
  assert.ok(!TICS.fr.test("Le vendeur doit maintenant vous remettre la commande — vous confirmerez la réception."), "le tiret cadratin n'est pas un tic");
});

test("X2 — aucune chaîne d'interface (fr, en, es) ne porte un tic de texte généré", () => {
  const fautes: string[] = [];
  for (const lang of ["fr", "en", "es"] as const) {
    for (const [cle, texte] of Object.entries(DICT[lang])) {
      if (EXEMPTES.has(cle)) continue;
      if (TICS[lang].test(texte)) fautes.push(`${lang} ${cle} : ${texte.slice(0, 90)}`);
    }
  }
  assert.deepEqual(fautes, [], "Tournure générique — dites la chose elle-même :\n  " + fautes.join("\n  "));
});

test("X3 — les exemptions désignent encore des libellés courts (sinon, les retirer)", () => {
  for (const cle of EXEMPTES) {
    const fr = (DICT.fr as Record<string, string>)[cle];
    assert.ok(fr !== undefined, `exemption périmée : ${cle}`);
    assert.ok(fr.split(/\s+/).length <= 3, `${cle} n'est plus un libellé court : « ${fr} »`);
  }
});
