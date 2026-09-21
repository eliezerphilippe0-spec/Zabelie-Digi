import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOfferSelection, eligibleOffer, offerHref, EMPTY_OFFERS } from "../lib/product-offers";
import { KIND_FILE, KIND_SERVICE, KIND_PHYSICAL } from "../lib/product-kind";
import { offerCopy } from "../lib/product-offer-copy";
const id="00000000-0000-0000-0000-000000000001", target="00000000-0000-0000-0000-000000000002";
test("offer selection is explicit, unique and bounded to known slots",()=>{
  assert.deepEqual(parseOfferSelection({}),EMPTY_OFFERS);
  assert.deepEqual(parseOfferSelection({upsell:target}),{...EMPTY_OFFERS,upsell:target});
  for(const input of [null,[],true,{upsell:"/other"},{upsell:target,cross_sell:target},{unknown:target},{downsell:{}},{upsell:5}]) assert.equal(parseOfferSelection(input),null);
});
test("upgrades and alternatives use comparable published products with strict price order",()=>{
  const source={id,kind:KIND_FILE,price_htg:1000,status:"published"} as const;
  const other={...source,id:target,price_htg:2000};
  assert.equal(eligibleOffer(source,other,"upsell"),true);
  assert.equal(eligibleOffer(source,other,"downsell"),false);
  assert.equal(eligibleOffer(source,{...other,price_htg:0},"downsell"),true);
  assert.equal(eligibleOffer(source,{...other,price_htg:1000},"upsell"),false);
  assert.equal(eligibleOffer(source,{...other,kind:KIND_SERVICE},"upsell"),false);
  assert.equal(eligibleOffer(source,{...other,kind:KIND_PHYSICAL},"cross_sell"),true);
  assert.equal(eligibleOffer(source,{...other,status:"draft"},"cross_sell"),false);
  assert.equal(eligibleOffer(source,source,"cross_sell"),false);
});
test("offer links stay on the marketplace and preserve attribution",()=>{
  assert.equal(offerHref({slug:"guide-kreyol",id:target}),"/produit/guide-kreyol?offre="+target);
  assert.ok(offerHref({slug:"//outside.example?a=1",id:target}).startsWith("/produit/%2F%2F"));
});
test("every offer control is translated in all four marketplace languages",()=>{
  for(const lang of ["fr","ht","en","es"] as const) for(const value of Object.values(offerCopy(lang))) assert.ok(value.trim());
  assert.notEqual(offerCopy("ht").save,offerCopy("fr").save);
});
