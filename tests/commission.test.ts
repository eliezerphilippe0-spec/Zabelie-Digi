import test from "node:test";
import assert from "node:assert/strict";
import {
  commissionHTG,
  netHTG,
  rateBps,
  type CreatorTier,
} from "../lib/commission";

test("taux par tier : 10 % standard, 6 % Elite", () => {
  assert.equal(rateBps("standard"), 1000);
  assert.equal(rateBps("elite"), 600);
  // Tier inconnu → repli standard (jamais 0 % par erreur).
  assert.equal(rateBps("???" as CreatorTier), 1000);
});

test("commission standard 10 %", () => {
  assert.equal(commissionHTG(2500, "standard"), 250);
  assert.equal(netHTG(2500, "standard"), 2250);
});

test("commission Elite 6 %", () => {
  assert.equal(commissionHTG(1000, "elite"), 60);
  assert.equal(netHTG(1000, "elite"), 940);
});

test("arrondi : commission = floor(gross * bps / 10000) — D-4, en faveur du vendeur", () => {
  // 2599 × 10 % = 259,9 → 259 (et non 260 : la fraction reste au vendeur).
  assert.equal(commissionHTG(2599, "standard"), 259);
  assert.equal(netHTG(2599, "standard"), 2340);
  // 2599 × 6 % = 155,94 → 155
  assert.equal(commissionHTG(2599, "elite"), 155);
  // Le cas qui a motivé la décision : 25 × 10 % = 2,5.
  // `round` donnait 3 (12 % réels) ; `floor` donne 2 (8 %).
  assert.equal(commissionHTG(25, "standard"), 2);
  assert.equal(netHTG(25, "standard"), 23);
  // gross 0 → 0
  assert.equal(commissionHTG(0, "standard"), 0);
});

test("D-4 : l'arrondi ne penche JAMAIS vers la plateforme", () => {
  // La propriété qui définit la décision, sur toute la plage utile :
  // la commission ne dépasse jamais la part exacte due.
  for (const tier of ["standard", "elite"] as CreatorTier[]) {
    const bps = tier === "standard" ? 1000 : 600;
    for (let gross = 0; gross <= 5000; gross++) {
      const exact = (gross * bps) / 10000;
      const c = commissionHTG(gross, tier);
      assert.ok(c <= exact, `${tier}@${gross}: commission ${c} > part exacte ${exact}`);
      assert.ok(exact - c < 1, `${tier}@${gross}: plus d'une gourde cédée`);
    }
  }
});

test("invariant : net + commission = brut", () => {
  for (const gross of [1, 99, 100, 2500, 2599, 999999]) {
    for (const tier of ["standard", "elite"] as CreatorTier[]) {
      assert.equal(
        netHTG(gross, tier) + commissionHTG(gross, tier),
        gross,
        `gross=${gross} tier=${tier}`
      );
    }
  }
});
