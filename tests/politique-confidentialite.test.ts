import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { LANGS, type Lang } from "../lib/i18n";
import {
  POLITIQUE,
  IDENTITE,
  resoudre,
  champsManquants,
} from "../lib/policy-privacy";

test("la politique distingue les coordonnées de remise du service de livraison et d'un wallet", () => {
  const GARDES: Record<Lang, RegExp[]> = {
    fr: [/registre comptable vendeur/iu, /Zabelie ne livre pas les produits/iu],
    ht: [/rejis kontab vandè a/iu, /Zabelie pa livre pwodwi yo/iu],
    en: [/seller accounting ledger/iu, /Zabelie does not deliver products/iu],
    es: [/registro contable del vendedor/iu, /Zabelie no entrega los productos/iu],
  };
  for (const lang of LANGS) {
    const contenu = POLITIQUE[lang].sections
      .filter((s) => /^(2|3)\./u.test(s.titre))
      .flatMap((s) => s.blocs.flatMap((b) => "p" in b ? [b.p] : b.ul)).join("\n");
    for (const garde of GARDES[lang]) assert.match(contenu, garde, `${lang} : périmètre vendeur imprécis`);
    assert.doesNotMatch(contenu, /wallet|pòtfèy|monedero/iu, `${lang} : portefeuille présenté comme un service`);
  }
});

test("les outils de données restent disponibles sans régime UE ou pénal affirmé automatiquement", () => {
  const EXPORT: Record<Lang, RegExp> = { fr: /exportez vos données/iu, ht: /ekspòte done ou yo/iu, en: /export your data/iu, es: /exporte sus datos/iu };
  const EFFACEMENT: Record<Lang, RegExp> = { fr: /supprimez votre compte/iu, ht: /efase kont ou/iu, en: /delete your account/iu, es: /elimine su cuenta/iu };
  for (const lang of LANGS) {
    const section = POLITIQUE[lang].sections.find((s) => s.titre.startsWith("7."));
    assert.ok(section);
    const contenu = section.blocs.flatMap((b) => "p" in b ? [b.p] : b.ul).join("\n");
    assert.match(contenu, EXPORT[lang], `${lang} : export absent`);
    assert.match(contenu, EFFACEMENT[lang], `${lang} : suppression du compte absente`);
    assert.match(contenu, /\{email\}/u, `${lang} : demande directe impossible`);
    assert.doesNotMatch(contenu, /Code pénal|Kòd penal|Penal Code|Código Penal|RGPD|GDPR|CNIL/iu);
  }
});

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
      if (IDENTITE[cle] !== null) continue;
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
   * politique publierait un engagement qu'un conseil peut inverser.
   *
   * ✅ 2026-10-04 : tranché par le porteur — 5 ans (loi haïtienne du
   * 11/11/2013), réglé en base par `0126`. `hebergement` est rempli par la
   * région MESURÉE. Les deux quittent `IDENTITE` ; reste `entite`. */
  const vides = champsManquants();
  assert.deepEqual(
    vides.sort(),
    ["entite"],
    `Les faits non renseignés de la politique ont changé : ${vides.join(", ")}. ` +
      `Mettre ce test à jour EN MÊME TEMPS que lib/policy-privacy.ts.`,
  );
  assert.equal(
    Object.keys(IDENTITE).length,
    2,
    "Le nombre de faits attendus par la politique a changé.",
  );
});

test("la durée de purge publiée est celle que le cron applique", () => {
  /* `purge` a quitté `IDENTITE` le 2026-10-02 : ce n'était pas un fait que le
   * porteur connaît, c'était un fait du CODE. Il ne reste vrai que si le
   * cron garde la même valeur — et si le cron tourne. Les deux se lisent ici,
   * dans le dépôt, pas dans la mémoire de quelqu'un. */
  const route = readFileSync("app/api/maturation/route.ts", "utf8");
  const appel = route.match(/rpc\("purge_payment_raw",\s*\{\s*p_days:\s*(\d+)\s*\}\)/);
  assert.ok(appel, "l'appel purge_payment_raw du cron de maturation a changé de forme : relire la politique");
  const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[];
  assert.ok(
    crons.some((c) => c.path === "/api/maturation"),
    "aucun cron n'appelle /api/maturation : la purge annoncée n'a plus lieu",
  );
  const UNITE: Record<Lang, string> = { fr: "jours", ht: "jou", en: "days", es: "días" };
  for (const lang of LANGS) {
    const texte = POLITIQUE[lang].sections
      .flatMap((s) => s.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul)))
      .join("\n");
    // LA phrase du payload, pas le document : « **90 jours** » figure aussi
    // dans la rétention des recherches (`0053`), et un contrôle sur le texte
    // entier resterait vert si la phrase du paiement changeait de durée.
    const phrase = texte.split("\n").find((l) => l.includes("payload"));
    assert.ok(phrase, `${lang} : la phrase du payload opérateur a disparu de la politique`);
    const annonce = `**${appel[1]} ${UNITE[lang]}**`;
    assert.ok(
      phrase.includes(annonce),
      `${lang} : la phrase du payload n'annonce plus ${annonce}, alors que le cron purge à p_days: ${appel[1]}.\n  ${phrase}`,
    );
  }
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


test("la durée de conservation des pièces d'identité publiée est celle que la purge applique", () => {
  // 0131 replaces the old day setting with calendar years after closure.
  const dossier = "supabase/migrations";
  let annees: number | null = null;
  for (const f of readdirSync(dossier).filter((x) => x.endsWith(".sql")).sort()) {
    const sql = readFileSync(`${dossier}/${f}`, "utf8");
    for (const m of sql.matchAll(/retention_annees\s*=\s*(\d+)/g)) annees = Number(m[1]);
  }
  assert.equal(annees, 5, "le réglage de conservation KYC a changé : relire la politique §9");
  const annonce = { fr: "**5 ans** après la fermeture du compte", ht: "**5 an** apre kont lan fèmen", en: "**5 years** after account closure", es: "**5 años** tras el cierre de la cuenta" } as const;
  for (const lang of LANGS) {
    const texte = POLITIQUE[lang].sections.flatMap((x) => x.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul))).join("\n");
    assert.ok(texte.includes(annonce[lang]), `${lang} : la politique n'annonce pas ${annonce[lang]}`);
  }
});

test("la région d'hébergement mesurée est nommée dans les quatre langues, sans garantie inventée", () => {
  for (const lang of LANGS) {
    const texte = POLITIQUE[lang].sections.flatMap((x) => x.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul))).join("\n");
    for (const fait of ["Supabase", "us-east-1", "Vercel", "iad1"]) assert.ok(texte.includes(fait), `${lang} : ${fait} absent`);
    assert.doesNotMatch(texte, /clauses contractuelles|standard contractual|kloz kontra|cláusulas contractuales/i, `${lang} : une garantie de transfert non constatée est affirmée`);
  }
});

test("l'effacement annonce que les pièces d'identité survivent à la fermeture du compte (0127)", () => {
  // La route anonymise tout compte qui a des pièces ; la politique doit le dire.
  const route = readFileSync("app/api/account/route.ts", "utf8");
  assert.match(route, /if \(purchases\.count === 0 && sales\.count === 0 && kyc\.count === 0 && acceptances\.count === 0\) \{/);
  const renvoi = { fr: "jusqu'au terme prévu au **§9**", ht: "jiska dat ki prevwa nan **§9**", en: "until the term set in **§9**", es: "hasta el plazo previsto en el **§9**" } as const;
  for (const lang of LANGS) {
    const texte = POLITIQUE[lang].sections.flatMap((x) => x.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul))).join("\n");
    assert.ok(texte.includes(renvoi[lang]), `${lang} : l'effacement ne mentionne pas la conservation des pièces`);
  }
});
