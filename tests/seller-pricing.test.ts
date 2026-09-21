import test from "node:test";
import assert from "node:assert/strict";
import { fixedFeeHTG, sellerFeeHTG, launchState, type SellerPricing, type SellerLaunch } from "../lib/seller-pricing";
import { recordDiscovery, attributedSource } from "../lib/sale-attribution";
import { readSellerPricing } from "../lib/seller-pricing-server";
import type { SupabaseClient } from "@supabase/supabase-js";

const pricing: SellerPricing = { direct_rate_bps: 1000, direct_fixed_usd_cents: 50, discovery_rate_bps: 3000, usd_htg_micros: 132_000_000, launch_days: 30, submission_days: 7, launch_sales_limit: 3, launch_discount_bps: 5000, payments_ready: true, attribution_days: 7 };
test("Gumroad-shaped fees: direct, discovery, free and launch discount in integer HTG", () => {
  assert.equal(fixedFeeHTG(pricing),66);
  assert.equal(sellerFeeHTG(1000,"direct",pricing),166);
  assert.equal(sellerFeeHTG(1000,"discovery",pricing),300);
  assert.equal(sellerFeeHTG(1000,"direct",pricing,true),83);
  assert.equal(sellerFeeHTG(1000,"discovery",pricing,true),150);
  assert.equal(sellerFeeHTG(0,"direct",pricing),0);
  assert.equal(sellerFeeHTG(1,"direct",pricing),1);
  assert.equal(sellerFeeHTG(999,"direct",pricing),165);
  assert.equal(sellerFeeHTG(999,"direct",pricing,true),82);
  assert.throws(()=>sellerFeeHTG(-1,"direct",pricing));
  assert.throws(()=>sellerFeeHTG(0.5,"direct",pricing));
});
test("a full fee waiver is configurable", () => {
  assert.equal(sellerFeeHTG(1000,"direct",{...pricing,launch_discount_bps:10000},true),0);
});
const now = Date.parse("2026-09-21T12:00:00Z");
const launch: SellerLaunch = { submitted_at:"2026-09-20T12:00:00Z", submission_deadline:"2026-09-22T12:00:00Z",published_at:"2026-09-21T12:00:00Z",starts_at:new Date(now).toISOString(),ends_at:new Date(now+30*86400000).toISOString(),used_sales:0,sales_limit:3,eligible:true };
test("launch begins at publication/readiness, expires exactly and never restarts", () => {
  assert.equal(launchState({...launch,submitted_at:null,eligible:false},now),"submit");
  assert.equal(launchState({...launch,starts_at:null,ends_at:null},now),"waiting");
  assert.equal(launchState(launch,now),"active");
  assert.equal(launchState(launch,now+30*86400000),"expired");
  assert.equal(launchState({...launch,used_sales:3},now),"exhausted");
  assert.equal(launchState({...launch,eligible:false},now),"ineligible");
});
test("attribution is signed, product-scoped, expires, and refresh cannot prolong it", () => {
  const key="test-server-key";
  const cookie=recordDiscovery(undefined,"product-a",7,key,now);
  assert.equal(attributedSource(cookie,"product-a",key,now),"discovery");
  assert.equal(attributedSource(cookie,"product-b",key,now),"direct");
  assert.equal(attributedSource(cookie,"product-a","wrong-key",now),"direct");
  assert.equal(attributedSource(cookie+"x","product-a",key,now),"direct");
  assert.equal(attributedSource("garbage","product-a",key,now),"direct");
  assert.equal(attributedSource(cookie,"product-a",key,now+7*86400000),"direct");
  const refreshed=recordDiscovery(cookie,"product-a",7,key,now+6*86400000);
  assert.equal(attributedSource(refreshed,"product-a",key,now+7*86400000),"direct");
});
test("attribution bounds browser storage and handles multiple products", () => {
  let cookie: string|undefined;
  for(let i=0;i<25;i++) cookie=recordDiscovery(cookie,"product-"+i,7,"test-server-key",now);
  assert.ok(cookie!.length<3800);
  assert.equal(attributedSource(cookie,"product-24","test-server-key",now),"discovery");
  assert.equal(attributedSource(cookie,"product-0","test-server-key",now),"direct");
});
function client(data: unknown,error: unknown=null) {
  return {from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data,error})})})})} as unknown as SupabaseClient;
}
test("pricing distinguishes staged rollout from a broken configuration read",async()=>{
  assert.equal(await readSellerPricing(client(null,{code:"42P01"})),null);
  assert.equal(await readSellerPricing(client({enabled:false})),null);
  await assert.rejects(readSellerPricing(client(null,{code:"PGRST301"})),/unavailable/);
  await assert.rejects(readSellerPricing(client({...pricing,enabled:true,usd_htg_micros:null})),/fx_missing/);
  assert.equal((await readSellerPricing(client({...pricing,enabled:true})))?.direct_rate_bps,1000);
});

