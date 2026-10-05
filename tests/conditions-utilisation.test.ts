import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONDITIONS } from "../lib/policy-terms";
import type { Lang } from "../lib/i18n";

/**
 * LE GABARIT CGU — ses gardes.
 *
 * Le document est un GABARIT : structure d'une marketplace avec règlement vendeur,
 * remplie des termes déjà tranchés et des clauses préparées sur instruction
 * du porteur le 2026-10-05. L'identité réelle reste séparée. Ces tests gardent :
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
  // 13 → 14 le 2026-08-15 : section « Services optionnels payants » ajoutée
  // 14 → 15 le 2026-08-15 : section « Vérification d'identité du vendeur »
  // (§7). Elle n'ouvre AUCUN blanc : la durée de conservation n'est pas
  // répétée ici, elle renvoie à la politique de confidentialité — un seul
  // endroit porte le chiffre, et c'est celui que le cliquet des blancs
  // surveille déjà (docs/36).
  // sur décision porteur (surplus IA, docs/34) — gabarit à faire relire par
  // le conseil, comme le reste du document.
  assert.equal(ref.length, 15, "le gabarit compte 15 sections (docs/26 §légal + docs/34 + docs/36)");
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
      /* ⚠️ TROU MESURÉ le 2026-08-15, en éprouvant la section 7 par mutation :
       * retirer une PUCE de la liste kreyòl laissait la suite VERTE. Le
       * contrôle comparait le nombre de blocs — un `ul` reste un `ul` qu'il
       * porte trois puces ou quatre. La politique de confidentialité
       * croisait déjà `ul.length` ; les CGU ne l'avaient jamais fait, et le
       * défaut est resté invisible tant qu'aucune section à liste n'avait été
       * traduite. Un lecteur kreyòl aurait perdu une obligation contractuelle
       * sans que rien ne le signale. */
      s.blocs.forEach((b, j) => {
        const r = ref[i].blocs[j];
        assert.equal(
          "ul" in b, "ul" in r,
          `${lang} : section « ${s.titre} », bloc ${j + 1} — liste et paragraphe ne se correspondent pas`,
        );
        if ("ul" in b && "ul" in r) {
          assert.equal(
            b.ul.length, r.ul.length,
            `${lang} : section « ${s.titre} » a ${b.ul.length} puces, le français en a ${r.ul.length}`,
          );
        }
      });
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

test("aucun marqueur contractuel après la rédaction autorisée du 2026-10-05", () => {
  /* FIGÉ le 2026-08-14 : âge minimum (§1), fenêtre de litige (§9),
   * résiliation plateforme (§12), droit applicable (§13) — numéros décalés
   * d'un cran le 2026-08-15 par l'insertion du §8 (services payants), qui
   * n'ouvre AUCUN blanc nouveau : les faits y sont tous tranchés (docs/34).
   * Pour REMPLIR un marqueur (décision porteur + conseil juridique) :
   * décrémenter ici DANS LE MÊME COMMIT. Pour en AJOUTER : ne pas — un
   * nouveau blanc juridique est une décision, pas un réflexe.
   *
   * 4 → 3 le 2026-10-02 : fenêtre de litige (§10) rédigée par l'agent sur
   * mandat du porteur (« Je rédige, vous validez »), d'après `0043`/`0068`.
   * ⚖️ À VALIDER par le porteur et son conseil avant fusion. Restent : âge
   * minimum (§1), résiliation plateforme (§13), droit applicable (§14). */
  // 3 → 0 le 2026-10-05 : instruction directe « implémenter tous,
  // n'attend pas le lancement ». Capacité selon les règles applicables,
  // modération effective + contact hors compte, droit haïtien sans forum
  // exclusif. Aucun fait d'identité ni validation juridique n'est inventé.
  const ATTENDU = 0;
  for (const lang of LANGS) {
    const n = (texte(lang).match(MARQUEUR[lang]) ?? []).length;
    assert.equal(
      n, ATTENDU,
      `${lang} : ${n} marqueur(s) au lieu de ${ATTENDU} — un blanc a été ouvert ou ` +
        `rempli sans mettre ce compte à jour dans le même geste.`,
    );
  }
});

test("les clauses rédigées protègent capacité, recours et droits impératifs dans les quatre langues", () => {
  const attentes: Record<Lang, { capacite: RegExp; motif: RegExp; horsCompte: RegExp; fonds: RegExp; droit: RegExp; facultatif: RegExp; imperatif: RegExp }> = {
    fr: { capacite: /capacité juridique/iu, motif: /enregistrée avec son motif/iu, horsCompte: /sans accès au compte/iu, fonds: /n'efface ni vos droits sur les sommes dues/iu, droit: /droit haïtien/iu, facultatif: /démarche est facultative/iu, imperatif: /droits impératifs du consommateur/iu },
    ht: { capacite: /kapasite jiridik/iu, motif: /anrejistre sispansyon an ak rezon/iu, horsCompte: /pa gen aksè nan kont/iu, fonds: /pa efase dwa ou sou lajan/iu, droit: /lwa ayisyen/iu, facultatif: /demach sa a pa obligatwa/iu, imperatif: /dwa obligatwa/iu },
    en: { capacite: /legal capacity/iu, motif: /suspension and its reason are recorded/iu, horsCompte: /without access to the account/iu, fonds: /does not extinguish your rights to sums owed/iu, droit: /Haitian law/iu, facultatif: /step is optional/iu, imperatif: /mandatory consumer rights/iu },
    es: { capacite: /capacidad jurídica/iu, motif: /suspensión y su motivo quedan registrados/iu, horsCompte: /sin acceso a la cuenta/iu, fonds: /no extingue sus derechos sobre los importes debidos/iu, droit: /derecho haitiano/iu, facultatif: /trámite es opcional/iu, imperatif: /derechos imperativos del consumidor/iu },
  };
  for (const lang of LANGS) {
    const sections = CONDITIONS[lang].sections;
    const contenu = (numero: number) => sections.find(s => s.titre.startsWith(`${numero}.`))!
      .blocs.flatMap(b => "p" in b ? [b.p] : b.ul).join("\n");
    const capacite = contenu(1), suspension = contenu(13), droit = contenu(14);
    assert.match(capacite, attentes[lang].capacite);
    assert.doesNotMatch(capacite, /\d/u, `${lang} : âge chiffré ajouté sans arbitrage`);
    for (const cle of ["motif", "horsCompte", "fonds"] as const) assert.match(suspension, attentes[lang][cle]);
    assert.match(suspension, /\{email\}/u, `${lang} : recours dépend d'un compte accessible`);
    assert.doesNotMatch(suspension, /\d/u, `${lang} : délai de préavis inventé`);
    for (const cle of ["droit", "facultatif", "imperatif"] as const) assert.match(droit, attentes[lang][cle]);
    assert.match(droit, /\{email\}/u);
    assert.doesNotMatch(droit, /Port-au-Prince|Paris|New York|Miami/iu, `${lang} : tribunal local exclusif inventé`);
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

test("le §10 ne chiffre aucun délai : les valeurs restent l'arbitrage D-14", () => {
  /* Rédigé le 2026-10-02 d'après `0043` : « l'échéance affichée », « le délai
   * fixé par Zabelie ». Les durées vivent dans `zabelie_fulfillment_limits`,
   * proposées et NON décidées (`docs/28` D-14, à revoir après les vingt
   * premières commandes, par `UPDATE`). Un chiffre recopié ici deviendrait un
   * engagement contractuel que le prochain `UPDATE` rendrait faux. */
  const DELAI = /(?<!\p{L})\d+\s*(jours?|jou|days?|d[ií]as?|heures?|hours?|horas?|h)(?!\p{L})/iu;
  // L'instrument d'abord : il voit un délai dans chaque langue, et pas un
  // chiffre sans unité (« J+7 » nomme une règle, il ne fixe pas un délai ici).
  for (const d of ["sous 7 jours", "apre 5 jou", "within 5 days", "48 h", "en 3 días"]) {
    assert.match(d, DELAI, `délai non vu : ${d}`);
  }
  assert.doesNotMatch("la maturation J+7 et la section 10", DELAI);
  for (const lang of LANGS) {
    const s10 = CONDITIONS[lang].sections.find((s) => s.titre.startsWith("10."));
    assert.ok(s10, `${lang} : section 10 introuvable`);
    const texte = s10.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul)).join("\n");
    assert.doesNotMatch(texte, DELAI, `${lang} : le §10 chiffre un délai`);
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

test("les quatre versions attribuent la remise au vendeur et excluent la livraison Zabelie", () => {
  // La distinction commande l'offre : pas seulement une absence de promesse,
  // mais un vendeur responsable de sa remise et aucune tarification transport
  // par la plateforme. Le test porte sur la section des obligations vendeur.
  const GARDES: Record<Lang, RegExp[]> = {
    fr: [/Le vendeur organise la remise/iu, /Zabelie ne stocke ni ne livre/iu, /ne facture pas de frais de livraison/iu],
    ht: [/Vandè a òganize remiz la/iu, /Zabelie pa estoke ni livre/iu, /pa faktire frè livrezon/iu],
    en: [/The seller arranges the handover/iu, /Zabelie does not store or deliver/iu, /or charge delivery fees/iu],
    es: [/El vendedor organiza la entrega/iu, /Zabelie no almacena ni entrega/iu, /ni cobra gastos de entrega/iu],
  };
  for (const lang of LANGS) {
    const section = CONDITIONS[lang].sections.find((s) => s.titre.startsWith("4."));
    assert.ok(section);
    const contenu = section.blocs.flatMap((b) => "p" in b ? [b.p] : b.ul).join("\n");
    for (const garde of GARDES[lang]) assert.match(contenu, garde, `${lang} : responsabilité de remise incomplète`);
  }
});

test("le registre décrit ses capacités sans prétendre à une qualification BRH", () => {
  const GARDES: Record<Lang, RegExp[]> = {
    fr: [/ne permet pas d'alimenter un solde/iu, /Zabelie ne propose pas de service Zabelie Pay autonome/iu, /n'atteste pas d'un agrément ni d'une validation de la BRH/iu],
    ht: [/pa pèmèt alimante yon balans/iu, /Zabelie pa ofri yon sèvis Zabelie Pay otonòm/iu, /pa prèv yon otorizasyon ni yon validasyon BRH/iu],
    en: [/does not allow topping up a balance/iu, /Zabelie does not offer a standalone Zabelie Pay service/iu, /does not attest to authorisation or approval by the BRH/iu],
    es: [/No permite recargar un saldo/iu, /Zabelie no ofrece un servicio Zabelie Pay autónomo/iu, /no acredita una autorización ni una aprobación de la BRH/iu],
  };
  for (const lang of LANGS) {
    const section = CONDITIONS[lang].sections.find((s) => s.titre.startsWith("6."));
    assert.ok(section);
    const contenu = section.blocs.flatMap((b) => "p" in b ? [b.p] : b.ul).join("\n");
    for (const garde of GARDES[lang]) assert.match(contenu, garde, `${lang} : garde financière absente`);
    assert.doesNotMatch(contenu, /ne constitue ni un compte|pa yon kont peman|neither a payment account|no constituye una cuenta/iu);
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
