import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { POLICY_PATH, POLICY_VERSION } from "../lib/policy";

/**
 * La politique doit rester atteignable depuis les quatre endroits exigés.
 *
 * Une page de règles que personne ne croise ne vaut rien : l'attestation de
 * R3 renverra à une version que le vendeur est censé avoir pu lire. Un lien
 * retiré au fil d'un remaniement de mise en page ne casse aucun test, ne
 * lève aucune erreur, et ne se voit pas — c'est exactement le genre de
 * disparition silencieuse que ce dépôt attrape par un garde plutôt que par
 * la vigilance.
 */

const POINTS: { fichier: string; pourquoi: string }[] = [
  { fichier: join("components", "site-footer.tsx"), pourquoi: "pied de page" },
  { fichier: join("app", "vendre", "page.tsx"), pourquoi: "parcours vendeur" },
  {
    fichier: join("components", "publish-form.tsx"),
    pourquoi: "formulaire de mise en ligne (fichier / service)",
  },
  {
    fichier: join("components", "physical-product-form.tsx"),
    pourquoi: "formulaire de mise en ligne (physique)",
  },
];

test("la page existe au chemin annoncé", () => {
  const page = join("app", POLICY_PATH.replace(/^\//, ""), "page.tsx");
  assert.ok(existsSync(page), `${page} manquant alors que POLICY_PATH vaut ${POLICY_PATH}`);
});

test("les quatre points d'accès mènent à la politique", () => {
  const manquants = POINTS.filter(
    ({ fichier }) => !readFileSync(fichier, "utf8").includes("POLICY_PATH"),
  );
  assert.deepEqual(
    manquants.map((m) => `${m.fichier} (${m.pourquoi})`),
    [],
    "Point(s) d'accès perdu(s) vers la politique produits interdits.",
  );
});

/**
 * La version est une VALEUR, pas un libellé : elle ne vit pas dans les
 * dictionnaires i18n, sinon le français et le Kreyòl pourraient enregistrer
 * deux versions différentes dans l'attestation de R3.
 */
test("la version n'est pas traduite", () => {
  const i18n = readFileSync(join("lib", "i18n.ts"), "utf8");
  assert.doesNotMatch(
    i18n,
    /"policy\.version"\s*:/,
    "La version de la politique est passée dans i18n : elle peut désormais " +
      "diverger entre les deux langues, et l'attestation R3 enregistrerait " +
      "une version différente selon la langue du navigateur.",
  );
  assert.match(POLICY_VERSION, /^v\d+$/, "format de version inattendu");
});
