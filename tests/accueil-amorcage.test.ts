import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT, LANGS, type I18nKey } from "../lib/i18n";

/**
 * L'ACCUEIL À CATALOGUE VIDE EST UNE PAGE DE RECRUTEMENT VENDEUR.
 *
 * Constat de départ, mesuré le 2026-08-04 : la base contient **0 produit**.
 * `HomeRow` s'efface à vide (V-13), donc sans bloc dédié l'accueil montrait un
 * trou entre le hero et la FAQ. Un trou ne recrute personne, et un carrousel à
 * deux produits ne dit pas « petite sélection » — il dit « personne ne vend
 * ici », et le visiteur a raison.
 *
 * ⚠️ CE QUE CE TEST NE FAIT PAS. Il lit la SOURCE, pas un rendu. Il prouve que
 * la condition existe et que les libellés sont là, pas que le bloc s'affiche.
 * La preuve d'affichage est la mesure Playwright à 360 px, qui tourne à la
 * main et dont le résultat est consigné dans le commit — les deux sont
 * nécessaires, aucun ne remplace l'autre.
 */

const PAGE = readFileSync("app/page.tsx", "utf8");
const CLES: I18nKey[] = [
  "home.seed.t",
  "home.seed.b",
  "home.seed.p1",
  "home.seed.p2",
  "home.seed.p3",
  "home.seed.cta",
] as I18nKey[];

test("le bloc d'amorçage est conditionné, dans les DEUX sens", () => {
  // Sens 1 — il existe une condition, il n'est pas rendu inconditionnellement.
  assert.match(
    PAGE,
    /const enAmorcage = products\.length < SEUIL_AMORCAGE;/,
    "la condition d'amorçage a disparu ou changé de forme"
  );
  assert.match(PAGE, /\{enAmorcage && \(/, "le bloc n'est plus conditionné");

  // Sens 2 — le seuil est un nombre, pas `0`. Avec `< 0` le bloc ne
  // s'afficherait JAMAIS, et le test ci-dessus resterait vert : c'est
  // exactement la mutation qui passe une relecture.
  const m = PAGE.match(/const SEUIL_AMORCAGE = (\d+);/);
  assert.ok(m, "SEUIL_AMORCAGE introuvable");
  assert.ok(
    Number(m[1]) >= 1,
    `SEUIL_AMORCAGE vaut ${m[1]} — le bloc ne s'afficherait jamais`
  );
});

test("les six libellés existent dans les QUATRE langues", () => {
  for (const lang of LANGS) {
    for (const cle of CLES) {
      const v = DICT[lang][cle];
      assert.ok(v && v.trim().length > 0, `${lang}/${cle} vide ou absent`);
    }
  }
});

test("le bloc ne promet ni délai, ni chiffre non mesuré", () => {
  // La spec proposait « 340 moun chèche yon bagay nou pa genyen ». Le capteur
  // existe mais `SEARCH_FINGERPRINT_SALT` n'est pas posée : la table est vide.
  // Afficher ce nombre serait le « 12k+ avis » de Bloop au-dessus de 38 fiches
  // à 0.0 — la faute que la spec elle-même identifie au §4.5.
  const chiffre = /\b\d{2,}\s*(moun|personnes|people|personas)\b/i;
  // « Livraison » : Zabelie ne livre pas — ni flotte, ni entrepôt, ni contrat
  // transporteur. Le vendeur livre.
  const livraison = /\b(livrezon|livraison|delivery|entrega)\b/i;

  for (const lang of LANGS) {
    for (const cle of CLES) {
      const v = DICT[lang][cle];
      assert.ok(!chiffre.test(v), `${lang}/${cle} affiche un chiffre non mesuré : « ${v} »`);
      assert.ok(!livraison.test(v), `${lang}/${cle} promet une livraison : « ${v} »`);
    }
  }
});

test("le seul chemin du bloc mène à /vendre", () => {
  // Le bloc porte UNE action. Un bloc de recrutement avec deux sorties n'en a
  // aucune.
  const i = PAGE.indexOf("home.seed.t");
  const j = PAGE.indexOf("home.seed.cta");
  assert.ok(i > 0 && j > i, "bornes du bloc introuvables");
  const zone = PAGE.slice(i, j + 200);
  const liens = [...zone.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(liens, ["/vendre"], `liens du bloc : ${liens.join(", ")}`);
});

test("« Kijan sa mache » est AU-DESSUS des rails produits", () => {
  // Il vivait après la FAQ, en bas de page. En Haïti la confiance n'est pas
  // acquise : elle EST le produit. Un acheteur qui ignore qui détient son
  // argent ne descend pas 500 lignes pour l'apprendre.
  const comment = PAGE.indexOf('id="comment"');
  const premierRail = PAGE.indexOf("<HomeRow");
  const faq = PAGE.indexOf('id="faq"');
  assert.ok(comment > 0 && premierRail > 0 && faq > 0, "ancres introuvables");
  assert.ok(
    comment < premierRail,
    "« Kijan sa mache » est repassé sous les rails produits"
  );
  assert.ok(comment < faq, "« Kijan sa mache » est repassé sous la FAQ");
});
