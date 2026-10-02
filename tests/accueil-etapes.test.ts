import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { DICT, LANGS, type I18nKey, type Lang } from "@/lib/i18n";

/**
 * LES TROIS ÉTAPES D'ACHAT NOMMENT CE QUE L'ACHETEUR VERRA VRAIMENT.
 *
 * « Comment recevoir votre achat ? » (accueil, et « Pour acheter » sur /aide)
 * disait « Cherchez / Vérifiez le paiement / Recevez » : rien sur le contact
 * avec le vendeur, rien sur la retenue du paiement, rien sur l'échéance. Une
 * analyse de conversion du 2026-10-02 en a tiré « logistique floue » et
 * « aucune garantie acheteur visible dès l'accueil » — alors que les trois
 * mécanismes existent, en production (`0043` appliquée le 2026-08-09, `0068`
 * pour les prestations le 2026-08-13, balayage quotidien dans `vercel.json`).
 *
 * Les étapes réécrites renvoient à trois choses que l'écran montre ailleurs.
 * Ce garde les tient ensemble, parce qu'un libellé qui bouge d'un côté laisse
 * l'accueil décrire un bouton qui n'existe plus :
 *   1. le bloc « Écrire au vendeur » de la fiche (`msg.ask.title`) ;
 *   2. la phrase d'escrow déjà validée sur la fiche, le panier et la page de
 *      succès (`trust.2.b`), AVEC sa portée : produit physique ou prestation.
 *      Sur un fichier, la maturation J+7 n'attend aucune remise (`0059`) — la
 *      fiche produit ne l'affiche d'ailleurs pas sur un fichier ;
 *   3. la page où vivent « J'ai reçu » et « Je n'ai pas reçu » (`purchases.title`).
 *
 * Comparaison sans casse ni distinction ’/' : la phrase reprise en milieu de
 * phrase perd sa majuscule, et le français de l'accueil emploie l'apostrophe
 * typographique là où `trust.2.b` emploie la droite.
 */

/** Minuscule, apostrophes unifiées, espaces fines et insécables ramenées. */
function norme(s: string): string {
  return s.toLowerCase().replace(/[’ʼ]/g, "'").replace(/[  ]/g, " ");
}

function contient(phrase: string, fragment: string): boolean {
  return norme(phrase).includes(norme(fragment));
}

/** La portée de la phrase d'escrow, dans la langue de chaque dictionnaire. */
const PORTEE: Record<Lang, string> = {
  fr: "produit physique",
  ht: "pwodui fizik",
  en: "physical product",
  es: "producto físico",
};

/** Chaque étape, et la clé dont elle doit reprendre la valeur exacte. */
const RENVOIS: { etape: I18nKey; reprend: I18nKey; pourquoi: string }[] = [
  { etape: "home.b1.b", reprend: "msg.ask.title", pourquoi: "le nom du bloc de messagerie de la fiche" },
  { etape: "home.b2.b", reprend: "trust.2.b", pourquoi: "la phrase d'escrow validée sur la fiche" },
  { etape: "home.b3.b", reprend: "purchases.title", pourquoi: "la page des boutons de réception" },
];

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("la comparaison ignore la casse et l'apostrophe, et rien d'autre", () => {
  // Connu-positif : la reprise réelle de `trust.2.b` en milieu de phrase.
  assert.ok(contient("Pour un objet, le vendeur n’est payé qu’après la remise.", "Le vendeur n'est payé qu'après la remise"));
  // Connu-négatif : un mot changé n'est plus la même phrase.
  assert.ok(!contient("le vendeur est payé avant la remise", "Le vendeur n'est payé qu'après la remise"));
  assert.ok(!contient("Contactez le vendeur", "Écrire au vendeur"));
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("chaque étape reprend, dans les quatre langues, le libellé que l'écran affiche", () => {
  for (const lang of LANGS) {
    const d = DICT[lang];
    for (const { etape, reprend, pourquoi } of RENVOIS) {
      assert.ok(
        contient(d[etape], d[reprend]),
        `${lang} : ${etape} ne reprend plus ${reprend} (${pourquoi}).\n` +
          `  étape   : ${d[etape]}\n  attendu : ${d[reprend]}`
      );
    }
  }
});

test("la phrase d'escrow de l'accueil porte sa portée : jamais sur un fichier", () => {
  for (const lang of LANGS) {
    const etape = DICT[lang]["home.b2.b"];
    assert.ok(
      contient(etape, PORTEE[lang]),
      `${lang} : home.b2.b affirme la retenue du paiement sans dire qu'elle vaut ` +
        `pour un ${PORTEE[lang]} ou une prestation. Sur un fichier, elle est fausse.`
    );
  }
});

test("les gestes que les étapes promettent existent dans le code", () => {
  // Étape 1 : le bloc nommé est rendu sur la fiche produit.
  assert.ok(
    readFileSync("app/produit/[slug]/page.tsx", "utf8").includes('t(lang, "msg.ask.title")'),
    "la fiche produit ne rend plus le bloc « Écrire au vendeur »"
  );
  // Étape 3 : les deux boutons, et les routes qu'ils appellent.
  const achats = readFileSync("app/mes-achats/page.tsx", "utf8");
  for (const cle of ["ship.received.cta", "ship.notreceived.cta"]) {
    assert.ok(achats.includes(`"${cle}"`), `Mes achats ne rend plus ${cle}`);
  }
  for (const route of ["received", "not-received"]) {
    assert.ok(existsSync(`app/api/fulfillment/${route}/route.ts`), `route /api/fulfillment/${route} absente`);
  }
  // L'échéance affichée n'est tenue que si le balayage tourne.
  const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { path: string }[];
  assert.ok(
    crons.some((c) => c.path === "/api/fulfillment/sweep"),
    "aucun cron n'appelle /api/fulfillment/sweep : l'échéance affichée ne tranche plus rien"
  );
});

test("l'accueil et l'aide rendent les trois étapes, dans l'ordre", () => {
  for (const fichier of ["app/page.tsx", "app/aide/page.tsx"]) {
    const src = readFileSync(fichier, "utf8");
    const positions = ["home.b1.t", "home.b2.t", "home.b3.t"].map((k) => src.indexOf(`"${k}"`));
    assert.ok(positions.every((p) => p >= 0), `${fichier} : une étape n'est plus rendue (${positions})`);
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
      `${fichier} : les étapes ne sont plus dans l'ordre 1 → 2 → 3`
    );
  }
});
