import { mergeOffers, recommendationAttribution, type PublicOffer } from "@/lib/product-offers";
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


test("automatic suggestions fill only free slots without repeating seller choices",()=>{
  const make=(target_product_id:string,origin?: "purchases"):PublicOffer=>({id:origin?null:target_product_id,source_product_id:id,origin,offer_kind:"cross_sell",target_product_id,title:"Produit",slug:"produit",price_htg:500,product_kind:KIND_FILE});
  const manual=[make("a"),make("b")],automatic=[make("a","purchases"),make("c","purchases"),make("d","purchases")];
  assert.deepEqual(mergeOffers(manual,automatic).map(o=>o.target_product_id),["a","b","c"]);
  assert.equal(mergeOffers([],automatic).length,3);
  assert.deepEqual(mergeOffers(manual,[]),manual);
});
test("automatic links use their source and malformed attribution is ignored",()=>{
  assert.equal(offerHref({id:null,slug:"guide-kreyol",source_product_id:id,origin:"purchases"}),"/produit/guide-kreyol?recommande="+id);
  assert.deepEqual(recommendationAttribution(id),{zabelie_recommendation_source_id:id});
  for(const bad of [null,{},123,"../../other","bad-id"]) assert.deepEqual(recommendationAttribution(bad),{});
});
