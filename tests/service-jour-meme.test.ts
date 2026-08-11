import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";

/**
 * ZÉRO JOUR EST UNE VALEUR, PAS UN VIDE.
 *
 * « Livré le jour même » se dit `delivery_days = 0`. Or zéro est *falsy* en
 * JavaScript, et il se faisait avaler à TROIS endroits successifs — chacun
 * silencieux, chacun suffisant à effacer l'information :
 *   1. le formulaire : `form.deliveryDays ? Number(…) : null` envoyait null ;
 *   2. la route : `d < 1` refusait 0 avec « entre 1 et 365 jours » ;
 *   3. la fiche produit : `product.deliveryDays && (…)` masquait la pastille.
 *
 * Le premier et le troisième sont la MÊME faute — un test de vérité là où il
 * fallait un test de présence — et c'est pour ça qu'ils méritent un garde
 * commun : corriger l'un sans l'autre laisse le défaut entier.
 */

test("la route accepte 0 jour et refuse le négatif", () => {
  const src = readFileSync("app/api/products/route.ts", "utf8");
  assert.ok(
    src.includes("d < 0 || d > 365"),
    "la borne basse n'est pas 0 — le délai « jour même » est refusé côté serveur"
  );
  assert.ok(!src.includes("d < 1 ||"), "la borne « au moins 1 jour » est revenue");
});

test("le formulaire n'avale pas la saisie « 0 »", () => {
  const src = readFileSync("components/publish-form.tsx", "utf8");
  assert.ok(
    src.includes('form.deliveryDays.trim() !== ""'),
    "le test de présence a été remplacé par un test de vérité : « 0 » redeviendrait null"
  );
  assert.ok(src.includes("min={0}"), "le champ interdit encore 0 côté navigateur");
});

test("la fiche produit affiche la pastille à 0 jour", () => {
  const src = readFileSync("app/produit/[slug]/page.tsx", "utf8");
  assert.ok(
    src.includes("product.deliveryDays != null"),
    "le test truthy est revenu — la pastille disparaît à 0"
  );
  assert.ok(
    src.includes("product.deliveryDays === 0"),
    "aucune branche « jour même » : 0 s'afficherait « Livraison en 0 jour(s) »"
  );
});

test("« jour même » est traduit dans les quatre langues", () => {
  for (const lang of LANGS) {
    const v = (DICT[lang] as Record<string, string>)["product.delivery.sameday"];
    assert.ok(v && v.trim().length > 0, `product.delivery.sameday vide en ${lang}`);
    assert.ok(
      !v.includes("{days}"),
      `${lang} : la formule « jour même » ne doit pas porter de compteur`
    );
  }
});
