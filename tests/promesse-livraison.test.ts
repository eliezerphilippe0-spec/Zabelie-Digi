import test from "node:test";
import assert from "node:assert/strict";
import { DICT, LANGS, type I18nKey } from "../lib/i18n";

/**
 * Aucune promesse de délai de livraison là où Zabelie ne peut pas la tenir.
 *
 * POURQUOI CE TEST EXISTE — il a fallu s'y reprendre à trois fois
 * ---------------------------------------------------------------
 * `home.stat3.v` valait « Instant » sur la tuile d'accueil : une affirmation
 * de délai sur la place de marché ENTIÈRE, produits physiques compris, alors
 * que c'est le vendeur qui livre et que la maturation est à J+7. Retirée une
 * première fois — mais `product.delivery` avait été oubliée, puis TRADUITE en
 * anglais et en espagnol : la promesse a gagné deux langues pendant qu'on
 * croyait l'avoir supprimée.
 *
 * Une correction manuelle ne tient pas contre ça. Une garde, si.
 *
 * CE QUI RESTE AUTORISÉ, ET POURQUOI ON NE PEUT PAS SE CONTENTER D'UN GREP
 * ------------------------------------------------------------------------
 * Deux énoncés du dictionnaire disent « immédiat » et ils sont VRAIS :
 *   • `product.file` — un fichier se télécharge à l'instant ;
 *   • `topup.legal` — la recharge part à l'instant, et c'est le cœur du
 *     positionnement BRH (revendeur, aucun solde stocké).
 * Interdire le mot partout aurait appauvri deux affirmations exactes. Le test
 * porte donc sur des CLÉS nommées, pas sur le fichier.
 */

/** Clés qui décrivent une livraison que la plateforme n'assure pas. */
const SANS_PROMESSE: I18nKey[] = [
  "home.stat3.v",
  "home.stat3",
  "home.sub",
  "product.delivery",
];

/**
 * Marqueurs de promesse de délai, dans les quatre langues.
 *
 * ⚠️ Cette liste vieillit comme le dictionnaire : une cinquième langue sans
 * son marqueur rendrait le test vert pour rien. Le contrôle de la fin
 * l'empêche — il vérifie que chaque marqueur attrape encore quelque chose.
 */
const PROMESSE =
  /instantané|instantane|\binstant\b|nan menm moman|imm[ée]diate?ment|inmediat|\brapid\b/i;

test("aucune clé de livraison ne promet un délai — dans toutes les langues", () => {
  const fautes: string[] = [];
  for (const lang of LANGS) {
    for (const k of SANS_PROMESSE) {
      const v = DICT[lang][k];
      if (v && PROMESSE.test(v)) fautes.push(`${lang}/${k} → « ${v} »`);
    }
  }
  assert.deepEqual(
    fautes,
    [],
    "promesse de délai sur une livraison assurée par le VENDEUR :\n  " +
      fautes.join("\n  ") +
      "\nZabelie n'a ni flotte, ni entrepôt, ni contrat transporteur."
  );
});

test("les deux « immédiat » VRAIS sont conservés", () => {
  // Sans ce test, la façon la plus simple de faire passer le précédent serait
  // de purger le mot partout — et de perdre deux énoncés exacts.
  // ⚠️ CHAQUE clé séparément. La première version concaténait les deux et
  // testait l'ensemble : vider `product.file` passait tant que `topup.legal`
  // gardait le mot. Vérifié par mutation — le test ne pouvait pas échouer sur
  // la moitié du cas qu'il prétendait couvrir.
  const VRAIS: I18nKey[] = ["product.file", "topup.legal"];
  for (const lang of LANGS) {
    for (const k of VRAIS) {
      assert.match(
        DICT[lang][k],
        /imm[ée]diat|nan menm moman|\binstant|inmediat|menm moman/i,
        `${lang}/${k} : c'est VRAI — un fichier se télécharge à l'instant, une ` +
          `recharge part à l'instant. Ne pas l'appauvrir pour faire passer le ` +
          `test précédent.`
      );
    }
  }
});

test("le détecteur attrape encore quelque chose (contrôle de l'instrument)", () => {
  // Une expression régulière qui ne correspond plus à rien rend le premier
  // test vert sans rien vérifier. On lui donne les formulations RÉELLEMENT
  // retirées le 2026-08-02 : elle doit toutes les reconnaître.
  const retirees = [
    "Instant",
    "Rapid",
    "Livraison instantanée après confirmation du paiement.",
    "Livrezon nan menm moman apre peman an konfime.",
    "Instant delivery once payment is confirmed.",
    "Entrega inmediata tras la confirmación del pago.",
    "epi livre nan menm moman",
  ];
  for (const v of retirees) {
    assert.ok(
      PROMESSE.test(v),
      `le détecteur ne reconnaît plus « ${v} » — il ne protège donc plus rien`
    );
  }
  // Et il ne doit pas être si large qu'il attrape n'importe quoi.
  assert.equal(PROMESSE.test("Le vendeur vous livre."), false);
  assert.equal(PROMESSE.test("Livraison à convenir avec le vendeur"), false);
});
