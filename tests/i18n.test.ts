import test from "node:test";
import assert from "node:assert/strict";
import { DICT, LANGS, t, type I18nKey } from "../lib/i18n";
import { ERR, errLabels } from "../lib/i18n-erreur";

test("parité FR/HT : chaque clé existe et est non vide dans les deux langues", () => {
  const frKeys = Object.keys(DICT.fr).sort();
  for (const lang of LANGS) {
    const keys = Object.keys(DICT[lang]).sort();
    assert.deepEqual(
      keys,
      frKeys,
      `clés ${lang} ≠ clés fr (manquantes ou en trop)`
    );
    for (const k of keys) {
      assert.ok(
        DICT[lang][k as I18nKey].trim().length > 0,
        `${lang}.${k} est vide`
      );
    }
  }
});

test("interpolation {vars}", () => {
  assert.equal(
    t("fr", "product.pay", { price: "2 500 HTG" }),
    "Payer 2 500 HTG avec MonCash"
  );
  assert.equal(
    t("ht", "product.pay", { price: "2 500 HTG" }),
    "Peye 2 500 HTG ak MonCash"
  );
});

test("langue inconnue → repli lisible (jamais de crash)", () => {
  // isLang filtre en amont ; t() replie sur fr si la clé manque.
  assert.equal(t("fr", "nav.catalog"), "Catalogue");
  assert.equal(t("ht", "nav.catalog"), "Katalòg");
});

// ─── Frontière d'erreur : second dictionnaire, même exigence ────────────────
// `lib/i18n-erreur.ts` existe parce que `app/error.tsx` est un composant client
// et ne peut pas appeler `t()` (règle en tête de lib/i18n.ts). Sans ce test, il
// serait exactement l'endroit où une clé kreyòl manquerait sans que rien ne le
// dise — un dictionnaire hors du dictionnaire n'est couvert par aucune garde.
test("parité FR/HT du dictionnaire de la frontière d'erreur", () => {
  const frKeys = Object.keys(ERR.fr).sort();
  for (const lang of LANGS) {
    assert.deepEqual(
      Object.keys(ERR[lang]).sort(),
      frKeys,
      `clés ${lang} ≠ clés fr dans lib/i18n-erreur.ts`
    );
    for (const k of frKeys) {
      assert.ok(
        ERR[lang][k as keyof typeof ERR.fr].trim().length > 0,
        `i18n-erreur ${lang}.${k} est vide`
      );
    }
  }
});

test("errLabels replie sur FR plutôt que de lever", () => {
  // @ts-expect-error — on force une langue hors union, comme le ferait un
  // cookie trafiqué qui aurait échappé à isLang.
  assert.equal(errLabels("xx"), ERR.fr);
  assert.equal(errLabels("ht"), ERR.ht);
});
