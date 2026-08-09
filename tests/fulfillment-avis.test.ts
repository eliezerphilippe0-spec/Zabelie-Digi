import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GENRES_AVIS,
  estGenreAvis,
  composerAvis,
  reculHeures,
} from "@/lib/fulfillment-notices";

/**
 * L'AVIS EST LA CONDITION DE LÉGITIMITÉ DE L'AUTO-RÉCEPTION.
 *
 * Un silence ne vaut consentement que si la personne a su que l'horloge
 * tournait. Ces messages ne sont donc pas de la décoration transactionnelle :
 * ce sont eux qui font la différence entre « on facture un silence » et « on
 * exproprie quelqu'un qui n'a jamais su ». Un avis muet sur la DATE, ou sans
 * chemin pour dire « je n'ai pas reçu », ne remplit pas cette fonction — même
 * s'il part, même s'il s'affiche bien.
 *
 * D'où des contrôles qui portent sur le CONTENU, pas seulement sur la
 * plomberie.
 */

const MIGRATION = "supabase/migrations/0043_fulfillment.sql";

/** Même extracteur que `fulfillment-etats`, autre énumération. */
function genresSQL(sql: string): string[] {
  const sansCommentaires = sql.replace(/--[^\n]*/g, "");
  const bloc = /create\s+type\s+fulfillment_notice_kind\s+as\s+enum\s*\(([^)]*)\)/i.exec(
    sansCommentaires
  );
  assert.ok(bloc, "bloc `create type fulfillment_notice_kind` introuvable");
  return [...bloc![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

const CHAMPS = {
  productTitle: "Pièce détachée",
  orderRef: "ZB-2026-0001",
  deadlineLabel: "16/08/2026",
  purchasesUrl: "https://exemple.test/mes-achats",
};

test("les genres SQL sont exactement ceux du module", () => {
  const enSQL = genresSQL(readFileSync(MIGRATION, "utf8"));
  assert.ok(enSQL.length >= 3, `genres lus : ${enSQL.length}`);
  assert.deepEqual(
    [...enSQL].sort(),
    [...GENRES_AVIS].sort(),
    "`fulfillment_notice_kind` et GENRES_AVIS ont divergé : un genre ajouté en " +
      "base n'aurait PAS de message, et l'avis ne partirait jamais — en silence."
  );
});

test("le garde d'exécution refuse ce qui ne vient pas de l'énumération", () => {
  assert.ok(estGenreAvis("reminder_buyer"));
  assert.ok(!estGenreAvis("shipped")); // état de remise, pas genre d'avis
  assert.ok(!estGenreAvis(""));
  assert.ok(!estGenreAvis(null));
});

test("chaque genre produit un sujet et un corps non vides", () => {
  for (const g of GENRES_AVIS) {
    const m = composerAvis(g, CHAMPS);
    assert.ok(m.subject.trim().length > 0, `${g} : sujet vide`);
    assert.ok(m.html.length > 200, `${g} : corps suspicieusement court`);
    assert.ok(m.html.includes(CHAMPS.productTitle), `${g} : le produit n'est pas nommé`);
    assert.ok(m.html.includes(CHAMPS.purchasesUrl), `${g} : aucun chemin de retour`);
  }
});

/**
 * LES DEUX AVIS QUI PRÉCÈDENT L'ÉCHÉANCE DOIVENT LA DIRE — DANS LES DEUX
 * LANGUES.
 *
 * ⚠️ LA PREMIÈRE VERSION DE CE TEST NE VALAIT RIEN, et c'est mesuré, pas
 * supposé. Elle demandait seulement `html.includes(deadlineLabel)`. Mutation
 * jouée : date retirée de la phrase KREYÒL de l'avis de remise, phrase
 * française intacte → le test est resté VERT. Il aurait laissé passer un avis
 * qui, pour un lecteur kreyòl — la langue de référence du produit — ne dit
 * plus que l'horloge tourne. Exactement le motif que le CLAUDE.md décrit :
 * l'instrument valide toujours la langue qui compte le moins.
 *
 * Le contrôle porte donc sur l'ANCRAGE : la date doit suivre un mot kreyòl
 * (`anvan`, `apre`) ET un mot français (`avant`, `Après`). Un gabarit qui perd
 * une des deux phrases échoue en nommant la langue.
 *
 * `auto_received` est exclu : il arrive APRÈS, l'échéance y serait un chiffre
 * périmé. Seule exclusion, et elle est nommée.
 */
const compact = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

test("l'avis et le rappel portent la date, en kreyòl ET en français", () => {
  const d = echapper(CHAMPS.deadlineLabel);
  const ancres: Record<string, { kr: RegExp; fr: RegExp }> = {
    // « Si ou pa reponn anvan <date> » / « avant le <date> »
    shipped_buyer: {
      kr: new RegExp(`anvan\\s+${d}`, "iu"),
      fr: new RegExp(`avant le\\s+${d}`, "iu"),
    },
    // « <date> — apre dat sa a » / « Après cette date »
    reminder_buyer: {
      kr: new RegExp(`${d}\\s*—\\s*apre`, "iu"),
      fr: new RegExp(`${d}[\\s\\S]{0,120}apr[eè]s cette date`, "iu"),
    },
  };

  for (const g of ["shipped_buyer", "reminder_buyer"] as const) {
    const texte = compact(composerAvis(g, CHAMPS).html);
    assert.match(
      texte,
      ancres[g].kr,
      `${g} : la date n'est pas ancrée dans la phrase KREYÒL. Un lecteur kreyòl ` +
        "ne saurait pas que l'horloge tourne, et son silence ne vaudrait pas " +
        "consentement."
    );
    assert.match(texte, ancres[g].fr, `${g} : la date n'est pas ancrée dans la phrase française.`);
  }

  // Connu-négatif de l'instrument : une date absente doit se voir.
  const muet = composerAvis("auto_received", CHAMPS);
  assert.ok(
    !muet.html.includes(CHAMPS.deadlineLabel),
    "l'avis final ne doit pas annoncer une échéance déjà passée"
  );
  // Et le motif kreyòl doit vraiment mordre : sur un texte où seule la phrase
  // française porte la date, il ne doit PAS correspondre.
  assert.ok(
    !ancres.shipped_buyer.kr.test("Sans réponse de votre part avant le 16/08/2026"),
    "le motif kreyòl accepte un texte purement français — il ne vérifie rien"
  );
});

/**
 * Zabelie n'observe pas la remise. Un avis qui AFFIRMERAIT la livraison ferait
 * exactement la promesse que le reste du dépôt refuse de faire — et il la
 * ferait au pire moment, juste avant que le silence paie le vendeur.
 */
test("aucun avis n'affirme la remise : le vendeur la DÉCLARE", () => {
  const m = composerAvis("shipped_buyer", CHAMPS);
  // Le verbe de déclaration doit y être, en kreyòl comme en français.
  assert.match(m.html, /di li remèt/i, "kreyòl : la déclaration n'est pas dite comme telle");
  assert.match(m.html, /déclare avoir remis/i, "français : idem");
  // Et l'affirmation nue doit être absente. Frontières `\p{L}` avec `u` ET
  // `i` : `\b` tomberait du mauvais côté d'un accent (« livrée » finit par un
  // `e` nu, mais « remèt » non — le motif doit valoir pour les deux).
  const affirme = /(?<!\p{L})(livrée|livré|livraison effectuée|bien reçu)(?!\p{L})/iu;
  assert.ok(
    !affirme.test(m.html),
    `l'avis affirme une livraison que Zabelie n'a pas observée : ${m.html.slice(0, 200)}`
  );
  // Connu-positif du motif, accents en position de frontière compris.
  for (const s of ["colis livré", "commande livrée", "bien reçu hier"]) {
    assert.ok(affirme.test(s), `le motif ne voit pas « ${s} »`);
  }
});

/**
 * Le recul n'existe que pour l'appel MANUEL — à la cadence quotidienne du cron
 * il ne change rien. Il doit donc croître, et surtout être PLAFONNÉ : sans
 * plafond, `2 ** 10` heures dépasserait la borne temporelle du balayage et un
 * avis n'aurait plus jamais sa chance.
 */
test("le recul croît puis plafonne", () => {
  assert.equal(reculHeures(0), 1);
  assert.equal(reculHeures(1), 1);
  assert.equal(reculHeures(2), 2);
  assert.equal(reculHeures(4), 8);
  assert.equal(reculHeures(6), 24);
  assert.equal(reculHeures(50), 24, "sans plafond, l'avis ne repasserait jamais");
});
