import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONDITIONS } from "../lib/policy-terms";
import type { Lang } from "../lib/i18n";

/**
 * LE GABARIT CGU — ses gardes.
 *
 * Le document est un GABARIT : structure d'une marketplace avec escrow,
 * remplie des seuls termes déjà tranchés, et quatre marqueurs juridiques
 * explicites par langue. Ces tests gardent trois choses :
 *
 *   1. La PARITÉ : quatre versions, même structure, section par section.
 *      Une section perdue dans une langue ne se verrait nulle part sinon —
 *      c'est le défaut exact qui a motivé `lib/policy-privacy.ts`.
 *   2. Le CLIQUET des marqueurs, dans les deux sens : un marqueur en PLUS
 *      rougit (pas de nouveau blanc sans témoin), un marqueur en MOINS
 *      rougit aussi (remplir un blanc est une décision porteur — la
 *      consigner ici est le prix du geste). Même motif que le comptage des
 *      blancs de la politique de confidentialité.
 *   3. Les INTERDITS et les COMMANDES : pas de cash à la livraison dans
 *      aucune langue, pas d'IDENTITE dupliquée, le lien du pied de page
 *      présent — assertions sur ce qui commande (href, import), jamais sur
 *      un libellé seul.
 */

const LANGS: Lang[] = ["fr", "ht", "en", "es"];

/** Un marqueur juridique, dans la convention de chaque langue. */
const MARQUEUR: Record<Lang, RegExp> = {
  fr: /\[À COMPLÉTER\s*:[^\]]+\]/g,
  ht: /\[POU KONPLETE\s*:[^\]]+\]/g,
  en: /\[TO BE COMPLETED:[^\]]+\]/g,
  es: /\[POR COMPLETAR:[^\]]+\]/g,
};

/** Tout le texte d'une version, aplati. */
function texte(lang: Lang): string {
  return CONDITIONS[lang].sections
    .flatMap((s) => [s.titre, ...s.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul))])
    .join("\n");
}

// ── 1. Parité de structure ──────────────────────────────────────────────────

test("les quatre versions ont les mêmes 13 sections, bloc à bloc", () => {
  const ref = CONDITIONS.fr.sections;
  assert.equal(ref.length, 13, "le gabarit compte 13 sections (docs/26 §légal)");
  for (const lang of LANGS) {
    const sections = CONDITIONS[lang].sections;
    assert.equal(
      sections.length, ref.length,
      `${lang} : ${sections.length} sections au lieu de ${ref.length}`,
    );
    sections.forEach((s, i) => {
      // Le numéro en tête de titre est la colonne vertébrale de la parité :
      // « 8. » en français doit être « 8. » partout.
      assert.equal(
        s.titre.split(".")[0], ref[i].titre.split(".")[0],
        `${lang} : section ${i} numérotée « ${s.titre} » vs « ${ref[i].titre} »`,
      );
      assert.equal(
        s.blocs.length, ref[i].blocs.length,
        `${lang} : section « ${s.titre} » a ${s.blocs.length} blocs, le français en a ${ref[i].blocs.length}`,
      );
    });
  }
});

test("l'avis « le français fait foi » est sur les traductions, jamais sur l'original", () => {
  assert.equal(CONDITIONS.fr.avisTraduction, undefined);
  for (const lang of ["ht", "en", "es"] as const) {
    assert.ok(CONDITIONS[lang].avisTraduction, `${lang} : avis de traduction absent`);
  }
});

// ── 2. Le cliquet des marqueurs juridiques ──────────────────────────────────

test("quatre marqueurs juridiques par langue — ni plus, ni moins", () => {
  /* FIGÉ le 2026-08-14 : âge minimum (§1), fenêtre de litige (§8),
   * résiliation plateforme (§11), droit applicable (§12).
   * Pour REMPLIR un marqueur (décision porteur + conseil juridique) :
   * décrémenter ici DANS LE MÊME COMMIT. Pour en AJOUTER : ne pas — un
   * nouveau blanc juridique est une décision, pas un réflexe. */
  const ATTENDU = 4;
  for (const lang of LANGS) {
    const n = (texte(lang).match(MARQUEUR[lang]) ?? []).length;
    assert.equal(
      n, ATTENDU,
      `${lang} : ${n} marqueur(s) au lieu de ${ATTENDU} — un blanc a été ouvert ou ` +
        `rempli sans mettre ce compte à jour dans le même geste.`,
    );
  }
});

test("les marqueurs des quatre langues couvrent les MÊMES sections", () => {
  // Un marqueur rempli en français mais oublié en kreyòl laisserait le
  // lecteur kreyòl devant un blanc que le texte de référence a tranché.
  // `match` et jamais `.test()` : un regex `/g` est À ÉTAT (`lastIndex`), et
  // `.test()` répété sauterait une occurrence sur deux en silence.
  const parSection = (lang: Lang) =>
    CONDITIONS[lang].sections
      .map((s, i) => ({
        i,
        n: s.blocs.filter((b) => "p" in b && (b.p.match(MARQUEUR[lang]) ?? []).length > 0).length,
      }))
      .filter((x) => x.n > 0)
      .map((x) => `${x.i}:${x.n}`)
      .join(",");
  const ref = parSection("fr");
  for (const lang of LANGS) {
    assert.equal(parSection(lang), ref, `${lang} : marqueurs placés différemment du français`);
  }
});

// ── 3. Interdits et commandes ───────────────────────────────────────────────

test("aucune version ne promet le cash à la livraison", () => {
  /* La décision porteur du 2026-08-13 : Zabelie ne fait PAS de COD. Le texte
   * a le droit de dire qu'on ne le fait pas ; il n'a pas le droit de le
   * proposer. On cherche donc la promesse (proposer/accepter/disponible),
   * pas la mention. Frontières Unicode, flags u+i — règle `\b` du dépôt. */
  const PROMESSE: RegExp[] = [
    /(proposons|acceptons|disponible[^.]{0,40})[^.]{0,60}(paiement|peman|pago|payment)[^.]{0,30}(livraison|livrezon|entrega|delivery)/iu,
    /cash on delivery is (available|offered|accepted)/iu,
  ];
  for (const lang of LANGS) {
    for (const re of PROMESSE) {
      assert.doesNotMatch(texte(lang), re, `${lang} : promesse de paiement à la livraison`);
    }
  }
});

test("les CGU réutilisent l'IDENTITE de la politique — jamais une copie", () => {
  const src = readFileSync("lib/policy-terms.ts", "utf8");
  // Remplir `entite`/`email` dans policy-privacy doit remplir les DEUX
  // documents. Une seconde IDENTITE ferait diverger les deux pages en
  // silence — le défaut que les blancs regroupés existent pour empêcher.
  assert.doesNotMatch(src, /const IDENTITE|export const IDENTITE/, "IDENTITE dupliquée");
  assert.match(src, /\{entite\}/, "les CGU ne référencent pas {entite}");
  assert.match(src, /\{email\}/, "les CGU ne référencent pas {email}");
  const page = readFileSync("app/conditions/page.tsx", "utf8");
  assert.match(
    page,
    /import \{[^}]*\bresoudre\b[^}]*\} from "@\/lib\/policy-privacy"/,
    "la page ne résout pas les blancs par le resoudre partagé",
  );
});

test("le pied de page mène aux conditions, via i18n", () => {
  const footer = readFileSync("components/site-footer.tsx", "utf8");
  // La commande, pas le libellé : le href, et la clé i18n à côté de lui.
  assert.match(
    footer,
    /href="\/conditions"[\s\S]{0,120}footer\.terms/,
    "lien /conditions absent du pied de page, ou libellé hors i18n",
  );
});
