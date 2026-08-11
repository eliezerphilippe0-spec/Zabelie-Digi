import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";

/**
 * LE PANIER N'EST PAS UN CUL-DE-SAC.
 *
 * Constat porteur du 2026-08-11, sur la version livrée la veille : « quand
 * j'ajoute au panier, il n'y a aucune icône de panier et il n'y a pas moyen
 * de poursuivre avec l'achat ». Les deux étaient vrais — et c'est la pire
 * forme d'incomplétude : le geste d'ajout marchait, donc rien ne signalait
 * que la suite manquait. Un panier sans sortie ni repère est un formulaire
 * qui avale.
 *
 * Ce test tient les deux moitiés du parcours : on VOIT le panier depuis
 * n'importe quelle page, et on peut EN SORTIR par un paiement.
 */

test("l'en-tête porte un lien vers le panier, avec son compteur", () => {
  const src = readFileSync("components/site-nav.tsx", "utf8");
  assert.ok(src.includes('href="/panier"'), "aucun lien vers /panier dans l'en-tête");
  assert.ok(
    src.includes("zabelie_cart_items"),
    "le compteur ne lit rien — l'icône ne pourrait pas savoir quoi afficher"
  );
  assert.ok(
    src.includes("articlesPanier > 0"),
    "l'icône ne se masque pas à panier vide, ou la condition a changé de forme"
  );
  // Le compteur doit venir du client de SESSION : le service role
  // rendrait le panier de TOUT LE MONDE, et le nombre serait faux.
  assert.ok(
    !src.includes("createAdminClient"),
    "l'en-tête utilise le service role — le compteur compterait les paniers d'autrui"
  );
});

test("chaque ligne du panier mène à un paiement", () => {
  const src = readFileSync("app/panier/page.tsx", "utf8");
  /* ⚠️ `includes("CartPayButton")` NE SUFFIT PAS, et la mutation l'a prouvé :
   * renommer l'élément en `CartPayButtonOff` laissait l'assertion verte,
   * puisque le nom fautif CONTIENT le nom attendu. Un préfixe partagé suffit
   * à aveugler un test de sous-chaîne — c'est la version « nom » du piège de
   * frontière `\b` que ce dépôt documente pour les accents.
   * D'où la frontière explicite : le nom doit être suivi d'une espace ou de
   * `>`, c'est-à-dire être l'élément lui-même et pas son préfixe. */
  assert.match(
    src,
    /<CartPayButton[\s>]/,
    "aucun bouton de paiement dans le panier — la page reste une impasse"
  );
  const btn = readFileSync("components/cart-pay-button.tsx", "utf8");
  assert.ok(btn.includes('"/api/checkout"'), "le bouton ne vise pas le checkout existant");
  // Le montant ne part JAMAIS du client (règle dure n°3).
  assert.ok(
    !/amount|montant|price/i.test(btn.replace(/\/\*[\s\S]*?\*\//g, "")),
    "le bouton transmet un montant — le prix se lit en base, jamais du navigateur"
  );
});

test("les libellés du paiement au panier existent dans les quatre langues", () => {
  for (const lang of LANGS) {
    for (const cle of ["cart.pay", "cart.paying", "cart.title"] as const) {
      const v = (DICT[lang] as Record<string, string>)[cle];
      assert.ok(v && v.trim().length > 0, `${cle} vide en ${lang}`);
    }
  }
});

/**
 * La note du panier annonce le paiement groupé comme « à venir ». Tant qu'il
 * n'existe pas, elle doit dire où payer EN ATTENDANT — sinon elle décrit un
 * manque sans donner la sortie, ce qui est exactement le défaut signalé.
 */
test("la note du panier indique quoi faire maintenant, pas seulement plus tard", () => {
  for (const lang of LANGS) {
    const note = (DICT[lang] as Record<string, string>)["cart.note"];
    assert.ok(note && note.length > 0, `cart.note vide en ${lang}`);
    assert.ok(
      /ci-dessus|anwo|above|arriba/i.test(note),
      `${lang} : la note n'oriente pas vers le paiement disponible — « ${note} »`
    );
  }
});
