import { test } from "node:test";
import assert from "node:assert/strict";

import { DICT, LANGS, type Lang } from "@/lib/i18n";
import { MATURATION_DAYS } from "@/lib/escrow";

/**
 * LA FAQ NE PROMET PAS PLUS QUE LES CONDITIONS.
 *
 * Relevé du 2026-10-02 : trois réponses de la FAQ (/aide) décrivaient un
 * autre service que celui des Conditions et du code.
 *   • faq.a2 — « Un produit physique est expédié par le vendeur » : Zabelie ne
 *     livre pas, la remise se fait comme convenu (`docs/21`).
 *   • faq.a4 — « disponible 7 jours après la vente » : les Conditions
 *     ajoutent, pour le physique et les prestations, la condition de REMISE
 *     (`0043` : `gated_on_delivery`, `0068` pour les prestations).
 *   • faq.a5 — « Chaque commande est […] remboursable » : la page même où la
 *     FAQ s'affiche dit « Un signalement ne garantit pas un remboursement
 *     automatique » (`aide.problem.support.body`). Deux phrases, un écran,
 *     deux promesses contraires.
 *
 * Ce garde tient les réponses réécrites à leurs sources : la limite est
 * REPRISE de l'aide (même phrase, quatre langues), le délai vient de
 * `MATURATION_DAYS`, et la condition de remise est nommée.
 */

function norme(s: string): string {
  return s.toLowerCase().replace(/[’ʼ]/g, "'").replace(/[  ]/g, " ");
}

/** Dernière phrase d'un texte, sans sa ponctuation finale. */
function dernierePhrase(texte: string): string {
  const phrases = texte.trim().split(/(?<=[.!?])\s+/);
  return phrases[phrases.length - 1].replace(/[.!?]+$/, "");
}

/** Le mot de la remise dans chaque langue — celui des Conditions et de l'aide. */
const REMISE: Record<Lang, string> = { fr: "remise", ht: "remiz", en: "handover", es: "entrega" };

/** L'ancienne promesse, qu'aucune réponse ne doit reprendre. */
const TOUT_REMBOURSABLE = /(?<!\p{L})(remboursables?|refundable|reembolsables?)(?!\p{L})/iu;

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("l'extracteur rend la dernière phrase, et le motif voit l'ancienne promesse", () => {
  assert.equal(dernierePhrase("Une. Deux phrases ici."), "Deux phrases ici");
  assert.equal(dernierePhrase("Seule phrase."), "Seule phrase");
  // Connu-positif : la réponse d'avant, dans deux langues.
  assert.ok(TOUT_REMBOURSABLE.test("Chaque commande est traçable et remboursable vers votre moyen de paiement."));
  assert.ok(TOUT_REMBOURSABLE.test("Cada pedido es rastreable y reembolsable a tu medio de pago original."));
  // Connu-négatif : le nom « remboursement » n'est pas la promesse.
  assert.ok(!TOUT_REMBOURSABLE.test("Tout remboursement se fait vers votre moyen de paiement d’origine."));
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("faq.a5 reprend la limite que l'aide affiche, dans les quatre langues", () => {
  for (const lang of LANGS) {
    const limite = dernierePhrase(DICT[lang]["aide.problem.support.body"]);
    assert.ok(
      norme(DICT[lang]["faq.a5"]).includes(norme(limite)),
      `${lang} : faq.a5 ne dit plus « ${limite} ».\n  faq.a5 : ${DICT[lang]["faq.a5"]}`
    );
  }
});

test("faq.a4 donne le délai du code et la condition de remise des Conditions", () => {
  for (const lang of LANGS) {
    const reponse = DICT[lang]["faq.a4"];
    assert.ok(
      new RegExp(`(?<!\\d)${MATURATION_DAYS}(?!\\d)`).test(reponse),
      `${lang} : faq.a4 n'annonce plus ${MATURATION_DAYS} jours (lib/escrow.ts MATURATION_DAYS).`
    );
    assert.ok(
      norme(reponse).includes(REMISE[lang]),
      `${lang} : faq.a4 ne conditionne plus la disponibilité à la ${REMISE[lang]}.`
    );
  }
});

test("aucune réponse de la FAQ ne déclare toute commande remboursable", () => {
  for (const lang of LANGS) {
    for (const cle of ["faq.a1", "faq.a2", "faq.a3", "faq.a4", "faq.a5"] as const) {
      assert.ok(!TOUT_REMBOURSABLE.test(DICT[lang][cle]), `${lang} : ${cle} — ${DICT[lang][cle]}`);
    }
  }
});
