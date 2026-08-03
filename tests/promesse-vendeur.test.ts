import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TOUTE PROPRIÉTÉ AFFIRMÉE D'UN VENDEUR DOIT ÊTRE ADOSSÉE À UN CHAMP QUI
 * EXISTE EN BASE.
 *
 * Ce qui a produit cette garde : `home.sub` promettait « **Vandè verifye**
 * toupre w » / « Des vendeurs **vérifiés** près de chez vous » — dans les
 * quatre langues — alors qu'AUCUN champ de vérification vendeur n'existe dans
 * les 53 migrations. Pire : le commentaire du hero, dix lignes plus haut,
 * expliquait qu'on avait refusé « Machann verifye » dans le badge de confiance
 * pour cette raison exacte. La promesse a été retirée du badge et a survécu
 * dans le sous-titre.
 *
 * Pourquoi ça pèse plus lourd qu'un délai de livraison : « Instant » est une
 * attente qu'on peut expliquer. « Vendeur vérifié » est un ENGAGEMENT DE
 * CONFIANCE, sur un marché où l'acheteur avance son argent avant de recevoir.
 * Laisser croire qu'on contrôle ses vendeurs sans le faire se paie à la
 * première mauvaise transaction, et ça ne se rattrape pas par un correctif.
 *
 * ⚠️ CE QUE CETTE GARDE NE FAIT PAS — et c'est délibéré. Elle ne DÉCIDE pas si
 * une phrase est une promesse. Une expression régulière ne distingue pas
 * « le vendeur garantit » (obligation DU vendeur) de « nos vendeurs sont
 * garantis » (engagement ENVERS l'acheteur), ni une affirmation de sa négation
 * — « Zabelie **ne vérifie pas** l'âge de l'acheteur » contient les mêmes mots
 * que ce qu'on traque. Prétendre trancher automatiquement, ce serait un
 * instrument qui ment.
 *
 * Elle DÉTECTE et exige un CLASSEMENT : toute clé où un mot d'engagement
 * côtoie un mot de vendeur doit être rangée à la main, soit adossée à une
 * colonne dont l'existence est vérifiée, soit écartée avec sa raison. Une clé
 * nouvelle ne peut pas passer sans que quelqu'un la regarde.
 */

const I18N = "lib/i18n.ts";
const MIGRATIONS = "supabase/migrations";

/** Mots qui engagent la plateforme sur une qualité. Quatre langues. */
const ENGAGEMENT =
  /(?<![\p{L}])(v[ée]rifi[ée]?e?s?|verifye|verified|verificad[oa]s?|certifi[ée]e?s?|s[èe]tifye|certified|certificad[oa]s?|garanti(?:e|es|s)?|guaranteed|garantizad[oa]s?|agr[ée]{2}s?|vetted|trusted|de confiance|kontwole|contr[ôo]l[ée]s?|approved|aprobad[oa]s?)(?![\p{L}])/iu;

/** Mots qui désignent le vendeur ou sa boutique. Quatre langues. */
const VENDEUR =
  /(?<![\p{L}])(vendeur|vendeurs|vendeuse|vand[èe]|machann|seller|sellers|merchant|merchants|vendedor|vendedores|boutique|boutik|shop|tienda)(?![\p{L}])/iu;

/**
 * Classement à la main. Deux formes seulement :
 *   • `colonne` — la promesse est adossée à ce champ, dont l'EXISTENCE est
 *     vérifiée dans `supabase/migrations/`. Une colonne inventée fait échouer.
 *   • `horsSujet` — la phrase n'est pas un engagement de la plateforme sur son
 *     vendeur, et la raison le dit.
 *
 * ⚠️ Une exemption ne suffit pas à rendre une phrase vraie. `horsSujet` dit
 * « ce n'est pas cette promesse-là », jamais « cette promesse est tenue ».
 */
type Classement = { colonne: string } | { horsSujet: string };

const CLASSEMENT: Record<string, Classement> = {
  "policy.alcohol.items": {
    horsSujet:
      "Obligation DU vendeur, pas engagement de la plateforme : « le vendeur " +
      "garantit qu'il a le droit de vendre ce qu'il met en ligne ». C'est le " +
      "vendeur qui s'engage, l'acheteur ne reçoit aucune garantie de Zabelie.",
  },
  "policy.alcohol.p2": {
    horsSujet:
      "NÉGATION explicite : « Zabelie ne vérifie pas l'âge de l'acheteur et " +
      "ne livre pas ». La phrase dit exactement le contraire d'une promesse — " +
      "c'est le genre de formulation qu'on veut protéger, pas interdire.",
  },
};

// ────────────────────────── Extraction ───────────────────────────────────────

/**
 * Une clé et TOUT ce qui la suit jusqu'à la clé suivante. Segment plutôt que
 * valeur exacte : les valeurs de `lib/i18n.ts` s'écrivent sur une ligne, sur
 * la suivante, ou concaténées sur plusieurs. Un extracteur trop précis
 * manquerait des chaînes — et ici un faux NÉGATIF est un défaut qui passe,
 * alors qu'un faux positif ne coûte qu'une ligne de classement.
 */
function segments(brut: string): Map<string, string> {
  // Les COMMENTAIRES du dictionnaire sont retirés d'abord. Sans ça, le
  // commentaire qui explique pourquoi Zabelie ne livre pas — et qui contient
  // « le vendeur DÉCLARE » — faisait détecter `product.delivery` comme une
  // promesse. Un commentaire n'atteint aucun écran.
  const src = brut.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
  const out = new Map<string, string>();
  const re = /^ {2}"([^"]+)":([\s\S]*?)(?=^ {2}"|^\};|^} satisfies)/gm;
  for (const m of src.matchAll(re)) {
    out.set(m[1], (out.get(m[1]) ?? "") + m[2]);
  }
  return out;
}

/**
 * La colonne existe-t-elle vraiment ? Déclaration dans un `create table` ou
 * ajout par `add column`. Le registre déclare, le catalogue atteste : ce
 * contrôle lit le DÉPÔT, donc il prouve qu'une migration la crée — pas qu'elle
 * est appliquée. Une promesse adossée à une colonne d'une migration non
 * appliquée reste une promesse en attente, et c'est à l'en-tête de la
 * migration de le dire.
 */
function colonneDeclaree(nom: string): boolean {
  const motif = new RegExp(
    String.raw`(^\s*${nom}\s+[a-z]|add\s+column\s+(?:if\s+not\s+exists\s+)?${nom}\b)`,
    "im"
  );
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .some((f) => motif.test(readFileSync(join(MIGRATIONS, f), "utf8")));
}

function detecter(segs: Map<string, string>): string[] {
  return [...segs.entries()]
    .filter(([, v]) => ENGAGEMENT.test(v) && VENDEUR.test(v))
    .map(([k]) => k)
    .sort();
}

const segs = segments(readFileSync(I18N, "utf8"));
const detectees = detecter(segs);

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("le détecteur voit la promesse retirée, et ne voit pas ce qui n'en est pas une", () => {
  // Connu-positif : la phrase EXACTE qui vient d'être retirée de `home.sub`,
  // dans les quatre langues. Si le détecteur la laisse passer, il ne sert à
  // rien — c'est littéralement le défaut qu'il existe pour attraper.
  for (const [langue, phrase] of [
    ["fr", "Des vendeurs vérifiés près de chez vous."],
    ["ht", "Vandè verifye toupre w."],
    ["en", "Verified sellers near you."],
    ["es", "Vendedores verificados cerca de ti."],
  ] as const) {
    const faux = new Map([["home.sub", phrase]]);
    assert.deepEqual(detecter(faux), ["home.sub"], `non détecté en ${langue} : ${phrase}`);
  }

  // Connu-négatif : un engagement SANS vendeur ne concerne pas cette garde.
  // « Paiement sécurisé avec MonCash » parle du paiement, et c'est vrai.
  assert.deepEqual(detecter(new Map([["badge.pay", "Paiement sécurisé avec MonCash"]])), []);
  // Un vendeur SANS engagement non plus.
  assert.deepEqual(detecter(new Map([["nav.sell", "Kòmanse vann"]])), []);

  // Le contrôle d'existence de colonne, dans LES DEUX SENS.
  //
  // Le connu-vrai a servi tout de suite : il portait `payout_phone`, qui vit
  // dans la SPEC D-8 (`docs/23`) et dans aucune migration de cette branche. Un
  // contrôle qui ne sait que dire « non » aurait laissé passer n'importe quel
  // adossement. `amount_htg` est déclarée en `0001_schema.sql:69`, mesurée.
  assert.equal(colonneDeclaree("seller_verified_at"), false);
  assert.equal(colonneDeclaree("amount_htg"), true);
});

test("l'extracteur a lu le dictionnaire, et pas le vide", () => {
  assert.ok(segs.size >= 250, `clés lues : ${segs.size}`);
  assert.ok(segs.get("home.h1")?.includes("Louvri"), "segment `home.h1` incomplet");
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("toute promesse sur un vendeur est classée, et tout adossement existe", () => {
  const nonClassees = detectees.filter((k) => !(k in CLASSEMENT));
  assert.deepEqual(
    nonClassees,
    [],
    `Clé(s) affirmant une propriété d'un vendeur sans classement : ${nonClassees.join(", ")}.\n` +
      "Adosser à une colonne qui existe, ou écarter avec la raison. Ne pas " +
      "rétrécir les motifs pour faire disparaître la ligne."
  );

  // Un adossement vers une colonne inexistante est pire que pas d'adossement :
  // il donne l'apparence d'une preuve.
  const inventees = Object.entries(CLASSEMENT)
    .filter(([, c]) => "colonne" in c && !colonneDeclaree(c.colonne))
    .map(([k, c]) => `${k} → ${(c as { colonne: string }).colonne}`);
  assert.deepEqual(
    inventees,
    [],
    `Adossement(s) vers une colonne qu'aucune migration ne déclare : ${inventees.join(", ")}.`
  );

  // Exemption périmée : une clé classée qui ne déclenche plus rien.
  const perimees = Object.keys(CLASSEMENT).filter((k) => !detectees.includes(k));
  assert.deepEqual(
    perimees,
    [],
    `Classement(s) devenu(s) inutile(s) : ${perimees.join(", ")} — ces clés ne ` +
      "portent plus de mot d'engagement, retirer l'entrée de CLASSEMENT."
  );
});
