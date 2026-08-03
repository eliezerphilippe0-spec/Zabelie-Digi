import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isTopupFirstPartyEnabled,
  TOPUP_CLOSED_STATUS,
} from "../lib/topup-flag";

/**
 * La vente de recharge EN PROPRE est close (décision porteur, 2026-08-01 —
 * `docs/02-DECISIONS.md`). Ce test empêche sa réouverture par inadvertance.
 *
 * TROIS CHOSES DISTINCTES, ET C'EST LA DISTINCTION QUI COMPTE
 * -----------------------------------------------------------
 *   1. le drapeau existe et son défaut est FERMÉ ;
 *   2. les surfaces de VENTE le consultent — page d'achat, création de
 *      commande, synchro du catalogue ;
 *   3. les surfaces de SERVICE APRÈS-VENTE ne le consultent PAS. Consultation
 *      d'une commande, confirmation d'un virement Zelle reçu, remboursement :
 *      un acheteur qui a payé hier doit être servi aujourd'hui.
 *
 * Le point 3 est celui qu'un « nettoyage » futur cassera : il est tentant
 * d'ajouter la garde partout « par cohérence ». Ce serait fermer une boutique
 * en gardant l'argent.
 *
 * LIMITE ASSUMÉE
 * --------------
 * Les points 2 et 3 lisent la SOURCE des routes, comme
 * `product-kind-discipline` et `ancres-navigation` : monter un Route Handler
 * Next.js demanderait un harnais dont le coût dépasse ce qu'il prouverait. Le
 * test vérifie que la garde est ÉCRITE au bon endroit, pas qu'elle s'exécute.
 */

const VENTE = [
  "app/rechaj/page.tsx",
  "app/api/zabelie/topup/orders/route.ts",
  "app/api/admin/topup/sync-catalog/route.ts",
];

const APRES_VENTE = [
  "app/rechaj/[orderId]/page.tsx",
  "app/api/zabelie/topup/orders/[id]/route.ts",
  "app/api/admin/topup/confirm-zelle/route.ts",
  "app/api/admin/topup/refunds/route.ts",
];

const lire = (p: string) => readFileSync(p, "utf8");

test("le défaut est FERMÉ, et seul `true` ouvre", () => {
  const avant = process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED;
  try {
    delete process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED;
    assert.equal(isTopupFirstPartyEnabled(), false, "absente doit valoir fermé");

    // Une fonctionnalité close par le porteur ne doit pas rouvrir parce qu'un
    // environnement contient une valeur approximative.
    for (const v of ["", "false", "0", "1", "yes", "TRUE", "True", " true "]) {
      process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED = v;
      assert.equal(isTopupFirstPartyEnabled(), false, `"${v}" ne doit pas ouvrir`);
    }
    process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED = "true";
    assert.equal(isTopupFirstPartyEnabled(), true, '"true" doit ouvrir');
  } finally {
    if (avant === undefined) delete process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED;
    else process.env.ZABELIE_TOPUP_FIRSTPARTY_ENABLED = avant;
  }
});

test("chaque surface de VENTE consulte le drapeau", () => {
  for (const f of VENTE) {
    assert.match(
      lire(f),
      /isTopupFirstPartyEnabled\(\)/,
      `${f} ne consulte pas le drapeau : la vente de recharge en propre y ` +
        "reste ouverte alors que le porteur l'a close (docs/02-DECISIONS.md)."
    );
  }
});

test("aucune surface d'APRÈS-VENTE ne consulte le drapeau", () => {
  for (const f of APRES_VENTE) {
    assert.doesNotMatch(
      lire(f),
      /isTopupFirstPartyEnabled\(\)/,
      `${f} consulte le drapeau. Cette route sert des commandes DÉJÀ PASSÉES ` +
        "— suivi, confirmation de virement, remboursement. La fermer revient " +
        "à fermer la boutique en gardant l'argent des acheteurs."
    );
  }
});

test("la fermeture répond 410, pas 404 ni 503", () => {
  // 503 dirait « revenez plus tard », 404 « ça n'a jamais existé ». Ni l'un ni
  // l'autre n'est vrai : la ressource a existé et ne reviendra pas.
  assert.equal(TOPUP_CLOSED_STATUS, 410);
  for (const f of VENTE.filter((f) => f.startsWith("app/api/"))) {
    assert.match(
      lire(f),
      /TOPUP_CLOSED_STATUS/,
      `${f} n'utilise pas le statut partagé — une route qui invente son ` +
        "propre code se désaligne des autres sans que rien ne le dise."
    );
  }
});

test("aucun lien de navigation ne pointe vers la page de vente", () => {
  // Même règle que `ancres-navigation` : un lien n'est pas plus permanent que
  // sa cible. La page redirige désormais ; un lien vers elle serait un
  // aller-retour inutile affiché comme une fonctionnalité.
  for (const f of ["components/site-nav.tsx", "components/site-footer.tsx"]) {
    assert.doesNotMatch(
      lire(f),
      /href="\/rechaj"/,
      `${f} garde un lien vers /rechaj, qui redirige maintenant vers ` +
        "/catalogue. La navigation annoncerait un service fermé."
    );
  }
});
