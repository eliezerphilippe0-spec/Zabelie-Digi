import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeCouponCode,
  discountedPriceHtg,
  couponApplies,
  type CouponRow,
} from "../lib/zabelie-coupons";
import { commissionHTG, netHTG } from "../lib/commission";

test("normalizeCouponCode : trim, majuscules, format borné", () => {
  assert.equal(normalizeCouponCode("  promo50 "), "PROMO50");
  assert.equal(normalizeCouponCode("noel-2026"), "NOEL-2026");
  assert.equal(normalizeCouponCode("ab"), null); // trop court
  assert.equal(normalizeCouponCode("a".repeat(25)), null); // trop long
  assert.equal(normalizeCouponCode("promo 50"), null); // espace interdit
  assert.equal(normalizeCouponCode("promo_50"), null); // underscore interdit
  assert.equal(normalizeCouponCode(""), null);
});

test("discountedPriceHtg : arrondi entier, plancher 10 HTG, bornes", () => {
  assert.equal(discountedPriceHtg(2500, 20), 2000);
  assert.equal(discountedPriceHtg(2500, 50), 1250);
  // Arrondi au plus proche : 999 × 33 % = 329,67 → 330 ; 999 − 330 = 669.
  assert.equal(discountedPriceHtg(999, 33), 669);
  // Jamais 0 : plancher à 10 HTG même à −90 %.
  assert.equal(discountedPriceHtg(15, 90), 10);
  assert.equal(discountedPriceHtg(100, 90), 10);
  // Bornes du pourcentage revérifiées (défense en profondeur).
  assert.throws(() => discountedPriceHtg(1000, 0));
  assert.throws(() => discountedPriceHtg(1000, 91));
  assert.throws(() => discountedPriceHtg(1000, 12.5));
});

test("plancher 10 HTG : le ledger reste sain (net > 0, entiers, somme exacte)", () => {
  // Les arrondis sur petits montants sont là où les ledgers se désalignent :
  // on fige le comportement au plancher, via l'oracle de la formule SQL.
  //
  // ⚠️ « commission ≥ 1 » a été RETIRÉ — c'était une conséquence de `round`,
  // pas une règle, et D-4 n'est pas tranchée. Les propriétés ci-dessous sont
  // vraies sous LES DEUX règles ; les valeurs exactes, elles, dépendent de
  // celle qui est déployée et sont vérifiées dans `commission.test.ts`.
  for (const rule of ["round", "floor"] as const) {
  for (const tier of ["standard", "elite"] as const) {
    for (let gross = 10; gross <= 100; gross++) {
      const c = commissionHTG(gross, tier, rule);
      const n = netHTG(gross, tier, rule);
      assert.ok(Number.isInteger(c) && Number.isInteger(n), `${tier}@${gross}: entiers`);
      assert.ok(c >= 0, `${tier}@${gross}: commission jamais négative (obtenu ${c})`);
      assert.ok(n > 0, `${tier}@${gross}: net vendeur > 0 (obtenu ${n})`);
      assert.ok(n <= gross, `${tier}@${gross}: net jamais supérieur au brut`);
      assert.equal(c + n, gross, `${tier}@${gross}: commission + net = brut`);
    }
  }
  }
  // Au plancher de coupon (10 HTG), la part standard vaut 1,0 gourde exacte :
  // c'est le seul point où les deux règles ne peuvent pas diverger.
  assert.equal(commissionHTG(10, "standard", "round"), 1);
  assert.equal(commissionHTG(10, "standard", "floor"), 1);
  assert.equal(netHTG(10, "standard", "round"), 9);
  // La part Elite (0,6) est justement là où elles divergent — et c'est le
  // seuil zéro discuté en D-5 : sous `floor`, la plateforme ne prélève rien.
  assert.equal(commissionHTG(10, "elite", "round"), 1);
  assert.equal(commissionHTG(10, "elite", "floor"), 0);
});

test("couponApplies : vendeur, produit, expiration, plafond, actif", () => {
  const base: CouponRow = {
    id: "c1",
    seller_id: "s1",
    product_id: null,
    percent: 20,
    max_uses: null,
    uses: 0,
    expires_at: null,
    active: true,
  };
  const now = new Date("2026-07-06T12:00:00Z");

  assert.equal(couponApplies(base, "p1", "s1", now), true);
  // Mauvais vendeur → le code d'un autre vendeur ne s'applique jamais.
  assert.equal(couponApplies(base, "p1", "s2", now), false);
  // Restreint à un produit précis.
  assert.equal(couponApplies({ ...base, product_id: "p1" }, "p1", "s1", now), true);
  assert.equal(couponApplies({ ...base, product_id: "p2" }, "p1", "s1", now), false);
  // Expiré / pas encore expiré.
  assert.equal(
    couponApplies({ ...base, expires_at: "2026-07-06T11:00:00Z" }, "p1", "s1", now),
    false
  );
  assert.equal(
    couponApplies({ ...base, expires_at: "2026-07-07T00:00:00Z" }, "p1", "s1", now),
    true
  );
  // Plafond atteint.
  assert.equal(couponApplies({ ...base, max_uses: 5, uses: 5 }, "p1", "s1", now), false);
  assert.equal(couponApplies({ ...base, max_uses: 5, uses: 4 }, "p1", "s1", now), true);
  // Désactivé.
  assert.equal(couponApplies({ ...base, active: false }, "p1", "s1", now), false);
});
