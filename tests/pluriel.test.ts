import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS, estSingulier, tn } from "@/lib/i18n";

/**
 * L'ACCORD EN NOMBRE — né d'un défaut LU EN PRODUCTION, pas d'une relecture.
 *
 * Le 2026-08-22, la carte du produit `fxccxfdf` affichait « **1 ventes** » sur
 * `zabelie.com`. Rien dans le dépôt ne pouvait le voir : `product.sales`
 * portait « ventes » dans les quatre langues, le dictionnaire était complet, et
 * `Record<I18nKey, string>` était satisfait. Le mot était juste ; il n'y en
 * avait qu'un là où il en faut deux.
 *
 * C'est la classe habituelle de ce dépôt — un vert qui décrit autre chose que
 * ce qu'on croit mesurer. Aucun test ne portait sur l'ACCORD parce que
 * l'accord n'existait pas comme notion.
 */

test("P1 — la règle du singulier, langue par langue", () => {
  /* ⚠️ LES QUATRE RÈGLES SONT DIFFÉRENTES, et c'est tout l'objet du contrôle.
   * Une règle unique `n === 1` donnerait « 0 ventes » en français (le français
   * accorde au singulier sous 2) et « 1 vant » deviendrait « 1 vants » si on
   * appliquait l'anglais au kreyòl. */
  assert.equal(estSingulier("fr", 0), true, "français : « 0 vente »");
  assert.equal(estSingulier("fr", 1), true);
  assert.equal(estSingulier("fr", 2), false);
  assert.equal(estSingulier("fr", 312), false);

  assert.equal(estSingulier("en", 0), false, "anglais : « 0 sales »");
  assert.equal(estSingulier("en", 1), true);
  assert.equal(estSingulier("en", 2), false);

  assert.equal(estSingulier("es", 0), false, "espagnol : « 0 ventas »");
  assert.equal(estSingulier("es", 1), true);
  assert.equal(estSingulier("es", 2), false);

  // Le kreyòl n'accorde pas le nom : la forme est invariante, à tout compte.
  for (const n of [0, 1, 2, 312]) {
    assert.equal(estSingulier("ht", n), true, `kreyòl invariant, n=${n}`);
  }
});

test("P2 — le rendu réel : le défaut de production ne peut plus revenir", () => {
  /* LE CAS MESURÉ, en toutes lettres. C'est la seule assertion de ce fichier
   * qui corresponde à un pixel vu par quelqu'un. */
  assert.equal(`1 ${tn("fr", 1, "product.sales.one", "product.sales")}`, "1 vente");
  assert.equal(`312 ${tn("fr", 312, "product.sales.one", "product.sales")}`, "312 ventes");
  assert.equal(`1 ${tn("en", 1, "product.sales.one", "product.sales")}`, "1 sale");
  assert.equal(`0 ${tn("en", 0, "product.sales.one", "product.sales")}`, "0 sales");
  assert.equal(`1 ${tn("es", 1, "product.sales.one", "product.sales")}`, "1 venta");
  assert.equal(`1 ${tn("ht", 1, "product.sales.one", "product.sales")}`, "1 vant");
  assert.equal(`312 ${tn("ht", 312, "product.sales.one", "product.sales")}`, "312 vant");

  // Et la carte vendeur, qui portait exactement le même défaut sans qu'on l'ait
  // regardée — un vendeur à une vente lisait « 1 ventes » lui aussi.
  assert.equal(`1 ${tn("fr", 1, "sec.sellers.sales.one", "sec.sellers.sales")}`, "1 vente");
  assert.equal(`4 ${tn("fr", 4, "sec.sellers.sales.one", "sec.sellers.sales")}`, "4 ventes");
});

test("P3 — les deux formes existent dans les QUATRE langues", () => {
  /* Un `.one` manquant replierait sur le français via `t()` — silencieusement,
   * et seulement pour le compte 1. Le pire cas possible : un défaut qui ne se
   * montre qu'à un vendeur qui vient de faire sa première vente. */
  for (const lang of LANGS) {
    for (const base of ["product.sales", "sec.sellers.sales"] as const) {
      const one = DICT[lang][`${base}.one` as keyof (typeof DICT)[typeof lang]];
      const many = DICT[lang][base];
      assert.ok(one && one.trim().length > 0, `${base}.one vide en ${lang}`);
      assert.ok(many && many.trim().length > 0, `${base} vide en ${lang}`);
      /* Le kreyòl est la SEULE langue autorisée à porter deux fois le même
       * mot. Partout ailleurs, deux formes identiques veulent dire que
       * quelqu'un a copié la ligne sans l'accorder — exactement le geste qui
       * a produit « 1 ventes ». */
      if (lang !== "ht") {
        assert.notEqual(
          one,
          many,
          `${base} : « ${one} » au singulier comme au pluriel en ${lang}. ` +
            "Seul le kreyòl n'accorde pas le nom."
        );
      } else {
        assert.equal(one, many, "le kreyòl n'accorde pas : les deux formes coïncident");
      }
    }
  }
});

test("P4 — la carte choisit la forme, elle ne colle plus un mot fixe", () => {
  /* ⚠️ ASSERTION SUR CE QUI COMMANDE, jamais sur le libellé produit.
   * `labels.sales` est TOUJOURS présent dans le fichier — c'est la branche
   * plurielle. Chercher sa présence resterait vert avec l'accord retiré ;
   * chercher `estSingulier` resterait vert si son résultat était ignoré. Ce
   * qu'on ancre est donc la LIAISON : le compte affiché (`product.sales`) doit
   * être celui qui décide de la forme. */
  const src = readFileSync("components/product-card.tsx", "utf8");
  assert.match(
    src,
    /\$\{product\.sales\}\s*\$\{[\s\S]{0,80}estSingulier\(labels\.lang,\s*product\.sales\)/,
    "la carte n'accorde plus le mot au compte qu'elle affiche : « 1 ventes » " +
      "peut revenir. Le compte rendu et le compte qui décide de la forme " +
      "doivent être le MÊME."
  );

  // Et l'accueil, qui n'a pas de sac de libellés — il appelle `tn` directement.
  const accueil = readFileSync("app/page.tsx", "utf8");
  assert.match(
    accueil,
    /\{s\.sales\}\s*\{tn\(lang,\s*s\.sales,/,
    "la carte vendeur n'accorde plus « ventes » au nombre de ventes du vendeur"
  );
});
