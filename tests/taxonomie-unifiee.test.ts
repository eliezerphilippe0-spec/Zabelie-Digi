import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * UNE SEULE TAXONOMIE — celle de la base.
 *
 * Le dépôt en portait DEUX qui ne se croisaient jamais : six libellés en dur
 * dans `lib/product-categories.ts` (« Photo », « Carrière », « Marketing »…),
 * où le vendeur publiait ; et l'arbre `zabelie_categories`, que lisaient le
 * menu, la colonne des rayons, la grille d'accueil et le catalogue.
 *
 * Conséquence mesurée en production : deux produits publiés, et le badge
 * « bientôt » qui ne pouvait PAS s'éteindre — leur rayon n'existait pas dans
 * l'arbre. Le symptôme se lisait comme un défaut de rafraîchissement ; la
 * cause était une taxonomie orpheline.
 *
 * Ce test ferme les deux moitiés du défaut : la liste en dur ne revient pas,
 * et le comptage n'oublie pas les produits non physiques.
 */

test("aucune liste de catégories en dur ne revient", () => {
  const src = readFileSync("lib/product-categories.ts", "utf8");
  assert.ok(
    !/export const PRODUCT_CATEGORIES\s*=\s*\[/.test(src),
    "la constante PRODUCT_CATEGORIES est revenue — la taxonomie redevient double"
  );
  // Connu-positif du motif : il détecte bien la forme bannie.
  assert.match(
    'export const PRODUCT_CATEGORIES = [\n  "Photo",\n]',
    /export const PRODUCT_CATEGORIES\s*=\s*\[/
  );
  assert.ok(
    src.includes("lireCategories"),
    "la liste ne vient plus de la base — c'est exactement le défaut d'origine"
  );
});

test("la validation serveur interroge la base, pas une constante", () => {
  const src = readFileSync("app/api/products/route.ts", "utf8");
  assert.ok(
    src.includes("await normalizeCategory(supabase, category)"),
    "la validation n'est plus adossée à la base"
  );
  /* ⚠️ L'ASSERTION PORTAIT SUR LE LIBELLÉ, PAS SUR CE QUI COMMANDE — corrigé
   * le 2026-08-22. Elle cherchait la chaîne « Catégorie inconnue », et elle a
   * rougi le jour où ce message est parti dans `lib/i18n.ts` pour être traduit
   * en quatre langues. Le refus n'avait pas bougé d'une ligne ; seul son
   * texte avait déménagé.
   *
   * C'est le piège de sous-chaîne de `CLAUDE.md` : un garde SUPPRIMÉ et un
   * garde dont le LIBELLÉ a changé produisent le même rouge, et — bien pire —
   * un garde rendu inatteignable aurait laissé ce test VERT, puisque la chaîne
   * serait restée dans le fichier.
   *
   * On assert donc sur la CONDITION et sur ce qu'elle commande : le résultat
   * de `normalizeCategory` est testé, et son absence rend une réponse
   * d'erreur. Rebrancher la condition sur autre chose fait rougir ; renommer
   * le message, non. */
  assert.match(
    src,
    /if\s*\(\s*!\s*categorieCanonique\s*\)[\s\S]{0,200}NextResponse\.json\([\s\S]{0,160}status:\s*400/,
    "aucun refus explicite : une catégorie hors taxonomie passerait — " +
      "le refus doit être commandé par l'absence de catégorie canonique"
  );
});

test("le formulaire reçoit ses rayons en prop, et distingue value du libellé", () => {
  const form = readFileSync("components/publish-form.tsx", "utf8");
  assert.ok(form.includes("categories: OptionCategorie[]"), "la prop categories a disparu");
  assert.ok(
    form.includes("value={c.value}") && form.includes("{c.label}"),
    "value et libellé confondus : les produits d'un vendeur kreyòl deviendraient introuvables"
  );
  const page = readFileSync("app/vendre/page.tsx", "utf8");
  assert.ok(
    page.includes("lireRayonsPublication(supabase, lang)"),
    "/vendre ne lit plus les rayons en base"
  );
});

test("le comptage des rayons n'oublie pas les produits non physiques", () => {
  const src = readFileSync("lib/taxonomy.ts", "utf8");
  assert.ok(
    src.includes('.neq("kind", KIND_PHYSICAL)'),
    "les produits non physiques ne sont plus comptés — le badge « bientôt » " +
      "redevient indélébile. ⚠️ Le littéral du type est INTERDIT ici " +
      "(product-kind-discipline) : importer KIND_PHYSICAL."
  );
  assert.ok(
    src.includes("idParLabelFr"),
    "le rapprochement libellé → rayon a disparu"
  );
  // Le double comptage est le piège symétrique : un produit physique porte
  // AUSSI son libellé de rayon dans products.category.
  const i = src.indexOf('.neq("kind", KIND_PHYSICAL)');
  const j = src.indexOf("idParLabelFr");
  assert.ok(i > -1 && j > i, "l'exclusion des physiques doit précéder le rapprochement");
});
