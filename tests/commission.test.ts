import test from "node:test";
import assert from "node:assert/strict";
import {
  commissionHTG,
  netHTG,
  rateBps,
  ROUNDING_IN_FORCE,
  type CreatorTier,
} from "../lib/commission";

test("taux par tier : 10 % standard, 6 % Elite", () => {
  assert.equal(rateBps("standard"), 1000);
  assert.equal(rateBps("elite"), 600);
  // Tier inconnu → repli standard (jamais 0 % par erreur).
  assert.equal(rateBps("???" as CreatorTier), 1000);
});

test("commission standard 10 % (multiples : les deux règles s'accordent)", () => {
  assert.equal(commissionHTG(2500, "standard"), 250);
  assert.equal(netHTG(2500, "standard"), 2250);
});

test("commission Elite 6 %", () => {
  assert.equal(commissionHTG(1000, "elite"), 60);
  assert.equal(netHTG(1000, "elite"), 940);
});

/**
 * Les deux règles sont testées pour de bon, y compris celle qui n'est pas
 * déployée. Sans ça, la branche dormante ne serait parcourue par personne et
 * ses écarts se découvriraient le jour de la bascule — c'est-à-dire sur de
 * l'argent réel.
 */
test("règle `round` — l'arrondi va à la plateforme (état actuel de la base)", () => {
  assert.equal(commissionHTG(25, "standard", "round"), 3); // 2,5 → 3 (12 % réels)
  assert.equal(netHTG(25, "standard", "round"), 22);
  assert.equal(commissionHTG(2599, "standard", "round"), 260); // 259,9 → 260
  assert.equal(commissionHTG(5, "standard", "round"), 1); // 0,5 → 1
  assert.equal(commissionHTG(4, "standard", "round"), 0); // 0,4 → 0
  assert.equal(commissionHTG(0, "standard", "round"), 0);
});

test("règle `floor` — l'arrondi va au vendeur (migration 0044, non appliquée)", () => {
  assert.equal(commissionHTG(25, "standard", "floor"), 2); // 2,5 → 2 (8 % réels)
  assert.equal(netHTG(25, "standard", "floor"), 23);
  assert.equal(commissionHTG(2599, "standard", "floor"), 259);
  assert.equal(commissionHTG(2599, "elite", "floor"), 155);
  assert.equal(commissionHTG(9, "standard", "floor"), 0); // seuil zéro — cf. D-5
  assert.equal(commissionHTG(0, "standard", "floor"), 0);
});

test("`floor` ne penche JAMAIS vers la plateforme", () => {
  for (const tier of ["standard", "elite"] as CreatorTier[]) {
    const bps = tier === "standard" ? 1000 : 600;
    for (let gross = 0; gross <= 5000; gross++) {
      const exact = (gross * bps) / 10000;
      const c = commissionHTG(gross, tier, "floor");
      assert.ok(c <= exact, `${tier}@${gross}: commission ${c} > part exacte ${exact}`);
      assert.ok(exact - c < 1, `${tier}@${gross}: plus d'une gourde cédée`);
    }
  }
});

/**
 * Le garde qui compte pour l'estimation vendeur : la valeur par défaut suit
 * `ROUNDING_IN_FORCE`, donc l'écran montre la règle DÉPLOYÉE. Si quelqu'un
 * bascule la constante sans appliquer `0044` (ou l'inverse), c'est ici que le
 * couplage se voit — pas sur la fiche d'un vendeur qui touche 1 HTG de moins
 * que le chiffre promis.
 */
test("l'estimation suit la règle en vigueur, jamais la règle souhaitée", () => {
  const attendu = ROUNDING_IN_FORCE === "floor" ? 2 : 3;
  assert.equal(
    commissionHTG(25, "standard"),
    attendu,
    `ROUNDING_IN_FORCE='${ROUNDING_IN_FORCE}' mais le calcul par défaut ne le suit pas`,
  );
  assert.equal(commissionHTG(25, "standard"), commissionHTG(25, "standard", ROUNDING_IN_FORCE));
});

test("invariant : net + commission = brut, quelle que soit la règle", () => {
  for (const rule of ["round", "floor"] as const) {
    for (const gross of [1, 9, 25, 99, 100, 2500, 2599, 999999]) {
      for (const tier of ["standard", "elite"] as CreatorTier[]) {
        assert.equal(
          netHTG(gross, tier, rule) + commissionHTG(gross, tier, rule),
          gross,
          `gross=${gross} tier=${tier} rule=${rule}`,
        );
      }
    }
  }
});
