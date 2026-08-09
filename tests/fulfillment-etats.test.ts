import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { ETATS_REMISE, cleEtatRemise, estEtatRemise } from "@/lib/fulfillment";
import { DICT, LANGS, type I18nKey } from "@/lib/i18n";

/**
 * L'ÉNUMÉRATION VIT EN BASE, L'ÉCRAN VIT EN TYPESCRIPT, ET RIEN NE LES RELIE.
 *
 * Même défaut que `lib/product-kind.ts`, et il vaut d'être redit parce qu'il
 * ne se voit jamais : ajouter une valeur à `fulfillment_status` ne casse
 * AUCUNE compilation ici. Le jour où un `partially_received` apparaîtrait en
 * SQL, la page acheteur afficherait un état vide — pas une erreur, pas un
 * journal, du blanc. La garantie ne vient pas du type mais du `switch`
 * exhaustif de `cleEtatRemise`, et ce croisement est ce qui force le `switch`
 * à être mis à jour.
 *
 * Éprouvé sur cas connu-positif ET connu-négatif : voir le premier test.
 */

const MIGRATION = "supabase/migrations/0043_fulfillment.sql";

/**
 * Extrait les libellés de l'énumération `fulfillment_status`.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS D'ABORD, et ce n'est pas de la prudence :
 * la première version s'arrêtait au premier `)`, et le premier `)` du bloc
 * réel n'est pas celui qui ferme l'énumération — c'est celui de
 * « (ou délai d'auto-réception) », un commentaire de fin de ligne. Elle rendait
 * TROIS états sur cinq, et son corpus synthétique — écrit à l'œil, sans
 * parenthèse dans les commentaires — la validait parfaitement.
 *
 * C'est exactement le motif que le dépôt documente ailleurs : un jeu de cas
 * choisi à la main contient les cas auxquels on pense, jamais celui qui casse.
 * Le corpus ci-dessous porte donc la parenthèse, et il aurait échoué.
 *
 * La borne `[^)]*` reste nécessaire APRÈS ce nettoyage : sans elle, le motif
 * avalerait `fulfillment_notice_kind`, définie plus bas dans le même fichier.
 */
function etatsSQL(sql: string): string[] {
  const sansCommentaires = sql.replace(/--[^\n]*/g, "");
  const bloc = /create\s+type\s+fulfillment_status\s+as\s+enum\s*\(([^)]*)\)/i.exec(
    sansCommentaires
  );
  assert.ok(bloc, "bloc `create type fulfillment_status` introuvable dans " + MIGRATION);
  return [...bloc![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("l'extracteur survit à une parenthèse en commentaire, et ne déborde pas", () => {
  const faux = `
    create type fulfillment_status as enum (
      'a',  -- l'acheteur confirme (ou délai d'auto-réception)
      'b',  -- une autre ligne (avec parenthèses) encore
      'c'
    );
    create type fulfillment_notice_kind as enum ('x', 'y');
  `;
  // Connu-positif : les TROIS valeurs. Avec l'ancienne version, le résultat
  // était `["a"]` — et le test passait, parce que son corpus n'avait pas de
  // parenthèse.
  assert.deepEqual(etatsSQL(faux), ["a", "b", "c"]);
  // Connu-négatif : la seconde énumération n'a pas débordé dans la première.
  assert.ok(!etatsSQL(faux).includes("x"));
});

/**
 * Ce que le nettoyage des commentaires NE peut pas casser, et pourquoi.
 *
 * Retirer `--…` d'un SQL quelconque est dangereux : un `--` DANS un littéral
 * serait mutilé. Ici il ne peut pas s'en trouver — les libellés d'une
 * énumération Postgres sont des identifiants `snake_case`, et le motif
 * d'extraction lui-même n'accepte que `[a-z_]+`. Un libellé exotique ne serait
 * donc pas silencieusement abîmé : il ne serait pas extrait du tout, et le
 * test de comparaison ci-dessous rougirait en le nommant.
 *
 * La première version de cette garde essayait de le vérifier sur le fichier
 * brut et se trompait : sa tranche s'arrêtait au premier `)`, qui appartient à
 * un commentaire, et l'apostrophe de « n'a rien déclaré » faisait correspondre
 * son motif à cheval sur deux littéraux. Une garde fausse vaut moins que pas
 * de garde — celle-ci est remplacée par l'argument ci-dessus, vérifiable.
 */
test("les libellés extraits sont bien des identifiants, pas du texte libre", () => {
  for (const e of etatsSQL(readFileSync(MIGRATION, "utf8"))) {
    assert.match(e, /^[a-z][a-z_]*$/, `libellé inattendu : ${e}`);
  }
});

// ───────────────────────── Les contrôles ─────────────────────────────────────

const enSQL = etatsSQL(readFileSync(MIGRATION, "utf8"));

test("les cinq états SQL sont exactement ceux du module", () => {
  assert.ok(enSQL.length >= 5, `états lus dans le SQL : ${enSQL.length}`);
  assert.deepEqual(
    [...enSQL].sort(),
    [...ETATS_REMISE].sort(),
    "L'énumération `fulfillment_status` et `ETATS_REMISE` ont divergé. " +
      "Ajouter la valeur au module ET au `switch` de `cleEtatRemise` — sinon " +
      "l'écran acheteur affiche du blanc, sans erreur ni journal."
  );
});

test("chaque état porte un libellé non vide dans les quatre langues", () => {
  for (const etat of ETATS_REMISE) {
    const cle = cleEtatRemise(etat) as I18nKey;
    for (const lang of LANGS) {
      const s = DICT[lang][cle];
      assert.ok(
        typeof s === "string" && s.trim().length > 0,
        `état ${etat} → ${cle} : vide en ${lang}`
      );
    }
  }
});

test("le garde d'exécution refuse ce qui ne vient pas de l'énumération", () => {
  // Le type est effacé au build : la valeur qui arrive de la base est du
  // `string` quelconque, et c'est ce garde-là qui la trie.
  assert.ok(estEtatRemise("shipped"));
  assert.ok(!estEtatRemise("delivered")); // état d'`orders`, pas de la remise
  assert.ok(!estEtatRemise("SHIPPED"));
  assert.ok(!estEtatRemise(undefined));
  assert.ok(!estEtatRemise(null));
});

/**
 * `action_required` porte volontairement un libellé NEUTRE. Nommer l'état par
 * une issue — « à rembourser » — institutionnaliserait le remboursement d'une
 * commande honorée, alors que sur ce marché la remise en main propre sans clic
 * est le cas le plus fréquent. La décision est écrite dans `0043` §1 ; ce test
 * l'empêche d'être défaite par un libellé d'écran.
 */
test("aucun libellé d'état ne présuppose un remboursement", () => {
  const interdits = /rembours|refund|reembols|ranbours/i;
  for (const etat of ETATS_REMISE) {
    const cle = cleEtatRemise(etat) as I18nKey;
    for (const lang of LANGS) {
      assert.ok(
        !interdits.test(DICT[lang][cle]),
        `état ${etat} (${lang}) annonce une issue : « ${DICT[lang][cle]} »`
      );
    }
  }
  // Connu-positif de l'instrument : le motif attrape bien ce qu'il vise, dans
  // les quatre langues — y compris accentué et en kreyòl.
  for (const t of ["À rembourser", "refund required", "reembolso", "pou ranbourse"]) {
    assert.ok(interdits.test(t), `le motif ne voit pas « ${t} »`);
  }
});
