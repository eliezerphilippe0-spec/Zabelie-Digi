import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANGS, type Lang } from "../lib/i18n";
import {
  POLITIQUE,
  IDENTITE,
  resoudre,
  champsManquants,
} from "../lib/policy-privacy";

/**
 * LA POLITIQUE DE CONFIDENTIALITÉ — CE QUI DOIT RESTER VRAI.
 *
 * Deux défauts mesurés le 2026-08-12, signalés par le porteur :
 *
 *   1. `app/confidentialite/page.tsx` portait 208 lignes de français EN DUR.
 *      Un utilisateur kreyòl — le public principal de ce produit — lisait sa
 *      politique de confidentialité en français.
 *   2. Le pied de page faisait pareil sur « Légal » et « Confidentialité »,
 *      deux chaînes en dur entourées de voisines qui, elles, passaient toutes
 *      par `t(lang, …)`.
 *
 * Et un troisième, trouvé en réparant les deux premiers : **cinq marqueurs
 * `[À COMPLÉTER]` étaient EN LIGNE**, visibles de n'importe qui — entité
 * juridique, e-mail de contact (deux fois), durée de purge, région
 * d'hébergement. Traduire sans les regrouper les aurait multipliés par quatre.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Que les traductions soient JUSTES.
 * Elles sont de l'agent, non relues par un juriste ni par un locuteur natif ;
 * les versions traduites le disent elles-mêmes. Ce fichier vérifie la
 * STRUCTURE et la COUVERTURE — qu'aucune langue ne perde une section en
 * route, et qu'aucun blanc ne se referme en silence.
 */

test("les quatre langues portent la MÊME structure de document", () => {
  /* Une section oubliée dans une langue ne se verrait nulle part : la page
   * rend ce qu'on lui donne, sans se plaindre du reste. Le croisement est
   * donc le seul endroit où l'oubli peut apparaître. */
  const ref = POLITIQUE.fr;
  for (const lang of LANGS) {
    const doc = POLITIQUE[lang];
    assert.equal(
      doc.sections.length,
      ref.sections.length,
      `${lang} porte ${doc.sections.length} sections, le français en a ${ref.sections.length}`,
    );
    doc.sections.forEach((s, i) => {
      assert.equal(
        s.blocs.length,
        ref.sections[i].blocs.length,
        `${lang}, section ${i + 1} (« ${s.titre} ») : ${s.blocs.length} blocs contre ${ref.sections[i].blocs.length} en français`,
      );
      s.blocs.forEach((b, j) => {
        const r = ref.sections[i].blocs[j];
        assert.equal(
          "ul" in b,
          "ul" in r,
          `${lang}, section ${i + 1}, bloc ${j + 1} : liste et paragraphe ne se correspondent pas`,
        );
        if ("ul" in b && "ul" in r) {
          assert.equal(
            b.ul.length,
            r.ul.length,
            `${lang}, section ${i + 1} : ${b.ul.length} puces contre ${r.ul.length} en français`,
          );
        }
      });
    });
  }
});

test("aucune langue ne laisse le document en français par accident", () => {
  // Le défaut d'origine, sous sa forme la plus simple : une version traduite
  // identique au français, mot pour mot. Le titre suffit à le voir.
  for (const lang of LANGS.filter((l) => l !== "fr")) {
    assert.notEqual(
      POLITIQUE[lang].titre,
      POLITIQUE.fr.titre,
      `Le titre de la version ${lang} est identique au français — la traduction n'a pas eu lieu.`,
    );
  }
});

test("les versions traduites disent laquelle fait foi", () => {
  // Une traduction non relue qui se présenterait comme le texte de référence
  // serait un engagement qu'on n'a pas pris.
  for (const lang of LANGS.filter((l) => l !== "fr")) {
    assert.ok(
      POLITIQUE[lang].avisTraduction,
      `La version ${lang} ne dit pas qu'elle est une traduction.`,
    );
  }
  assert.equal(
    POLITIQUE.fr.avisTraduction,
    undefined,
    "La version française est la référence : elle n'a pas d'avis de traduction.",
  );
});

test("un champ non renseigné se VOIT, dans les quatre langues", () => {
  /* Le pire cas serait qu'un blanc se rende en chaîne vide : la phrase se
   * lirait « Responsable du traitement : . » et personne ne remarquerait
   * qu'il manque quelque chose. Le marqueur doit être visible. */
  for (const lang of LANGS) {
    for (const cle of Object.keys(IDENTITE) as (keyof typeof IDENTITE)[]) {
      const rendu = resoudre(`X **{${cle}}** Y`, lang as Lang);
      assert.ok(
        /\[.+\]/.test(rendu),
        `En ${lang}, « ${cle} » vide ne produit aucun marqueur visible : « ${rendu} »`,
      );
      assert.ok(
        !rendu.includes(`{${cle}}`),
        `En ${lang}, le gabarit « {${cle}} » se rend TEL QUEL au lecteur.`,
      );
    }
  }
});

test("les blancs sont COMPTÉS — leur nombre ne peut pas grossir en silence", () => {
  /* Assertion volontairement figée sur le compte du jour. Elle échouera si
   * quelqu'un ajoute un sixième blanc — et aussi le jour où le porteur en
   * remplira un, ce qui est le seul « échec » qu'on souhaite : il oblige à
   * venir ici baisser le chiffre, donc à constater le progrès.
   *
   * C'est la péremption dans les deux sens, appliquée à une dette.
   *
   * ⚠️ `retentionKyc` (ajouté le 2026-08-15) n'est PAS un blanc de la même
   * nature que les quatre autres. Ceux-là attendent une saisie — une raison
   * sociale, une adresse e-mail — que le porteur connaît déjà. Celui-ci
   * attend un AVIS : `zabelie_kyc_config.retention_jours` porte bien un
   * défaut technique de 90 jours, mais une obligation de vigilance
   * anti-blanchiment peut imposer une durée MINIMALE de conservation, donc
   * plus longue, pas plus courte. Recopier le 90 d'aujourd'hui dans la
   * politique publierait un engagement qu'un conseil peut inverser. */
  const vides = champsManquants();
  assert.deepEqual(
    vides.sort(),
    ["email", "entite", "hebergement", "purge", "retentionKyc"],
    `Les faits non renseignés de la politique ont changé : ${vides.join(", ")}. ` +
      `Mettre ce test à jour EN MÊME TEMPS que lib/policy-privacy.ts.`,
  );
  assert.equal(
    Object.keys(IDENTITE).length,
    5,
    "Le nombre de faits attendus par la politique a changé.",
  );
});

test("la page rend le document, elle ne le recopie pas", () => {
  /* L'assertion porte sur ce qui COMMANDE le rendu — la lecture de la langue
   * et le parcours des sections — pas sur l'absence d'un mot français, qui
   * serait vraie d'une page vide. */
  const src = readFileSync("app/confidentialite/page.tsx", "utf8");
  assert.match(src, /const lang = await getLang\(\)/, "La page doit lire la langue.");
  assert.match(src, /POLITIQUE\[lang\]/, "La page doit choisir le document par la langue.");
  assert.match(
    src,
    /doc\.sections\.map\(/,
    "La page doit parcourir les sections du document plutôt que les écrire.",
  );
  assert.doesNotMatch(
    src,
    /\[À COMPLÉTER/,
    "Un marqueur est revenu EN DUR dans la page : il échapperait au comptage.",
  );
});

test("le pied de page ne porte plus de libellé légal en dur", () => {
  const src = readFileSync("components/site-footer.tsx", "utf8");
  assert.match(src, /t\(lang, "footer\.legal"\)/);
  assert.match(src, /t\(lang, "footer\.privacy"\)/);
  // La condition qui compte : plus AUCUN de ces deux mots hors d'un appel `t`.
  assert.doesNotMatch(
    src,
    />\s*(Légal|Confidentialité)\s*</,
    "« Légal » ou « Confidentialité » est de nouveau écrit en dur dans le JSX.",
  );
});
