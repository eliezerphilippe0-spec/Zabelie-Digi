import test from "node:test";
import assert from "node:assert/strict";
import { DICT, LANGS } from "../lib/i18n";
import { ROUNDING_IN_FORCE } from "../lib/commission";

/**
 * L'annonce faite au vendeur doit décrire la règle DÉPLOYÉE.
 *
 * « L'arrondi est toujours en votre faveur » est vrai sous `floor` et FAUX
 * sous `round` — c'est une phrase qu'on ne peut pas laisser traîner « en
 * attendant la migration ». Ce test vérifie que les deux formulations sont
 * rangées du bon côté, dans les deux langues, et que celle qui est servie
 * correspond à `ROUNDING_IN_FORCE`.
 *
 * Ce qu'il ne peut pas faire : deviner qu'une NOUVELLE phrase d'arrondi a été
 * écrite ailleurs en dur. Il couvre les clés existantes, pas l'invention.
 */

/**
 * Marqueurs de la promesse « l'arrondi va au vendeur », dans les trois langues.
 *
 * ⚠️ Cette liste est le point faible du test et doit grandir avec le
 * dictionnaire : ajouter une langue sans ajouter son marqueur ici rendrait le
 * premier contrôle FAUX-NÉGATIF (aucune promesse trouvée → échec bruyant, cas
 * favorable) mais surtout le DEUXIÈME faux-positif — une clé par défaut
 * promettant l'arrondi au vendeur en anglais passerait inaperçue. L'anglais a
 * été ajouté ici le 2026-08-01, à l'occasion de la troisième langue, et c'est
 * ce test qui l'a réclamé de lui-même en échouant.
 */
const PROMESSE = /en (votre|ta) faveur|an favè w|in your favou?r/i;

const CLES = [
  { enVigueur: "faq.a3", floor: "faq.a3.floor" },
  { enVigueur: "publish.net.rounding", floor: "publish.net.rounding.floor" },
] as const;

test("la variante `.floor` porte bien la promesse — dans les deux langues", () => {
  for (const lang of LANGS) {
    for (const { floor } of CLES) {
      const texte = DICT[lang][floor as keyof (typeof DICT)[typeof lang]] as string;
      assert.ok(texte, `${lang}/${floor} manquante`);
      assert.match(
        texte,
        PROMESSE,
        `${lang}/${floor} devrait annoncer que l'arrondi va au vendeur`,
      );
    }
  }
});

test("la clé par défaut ne promet rien que la base ne tienne", () => {
  for (const lang of LANGS) {
    for (const { enVigueur } of CLES) {
      const texte = DICT[lang][enVigueur as keyof (typeof DICT)[typeof lang]] as string;
      assert.ok(texte, `${lang}/${enVigueur} manquante`);
      assert.doesNotMatch(
        texte,
        PROMESSE,
        `${lang}/${enVigueur} promet un arrondi en faveur du vendeur, alors que ` +
          `c'est la formulation servie quand ROUNDING_IN_FORCE vaut 'round'. ` +
          `Cette promesse appartient à la variante '.floor'.`,
      );
    }
  }
});

/**
 * Le lien entre la règle et le texte servi. Si `ROUNDING_IN_FORCE` bascule
 * sur `"floor"` sans que `0044` soit appliquée, ce test reste vert — il ne
 * peut pas lire la base. Ce qu'il garantit est plus étroit et néanmoins
 * utile : le texte servi et la constante ne peuvent pas se contredire.
 */
test("le texte servi correspond à la règle en vigueur", () => {
  for (const lang of LANGS) {
    for (const { enVigueur, floor } of CLES) {
      const servi = (
        ROUNDING_IN_FORCE === "floor"
          ? DICT[lang][floor as keyof (typeof DICT)[typeof lang]]
          : DICT[lang][enVigueur as keyof (typeof DICT)[typeof lang]]
      ) as string;
      if (ROUNDING_IN_FORCE === "floor") {
        assert.match(servi, PROMESSE, `${lang}/${enVigueur}: floor doit promettre`);
      } else {
        assert.doesNotMatch(servi, PROMESSE, `${lang}/${enVigueur}: round ne promet pas`);
      }
    }
  }
});
