import test from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { reconcileStripe, type StripeReconcileDeps } from "../lib/stripe-reconcile";
function fixture(session: Partial<Stripe.Checkout.Session> = {}, fail?: string) {
 const calls: string[]=[];
 const deps:StripeReconcileDeps={
  listPending:async()=>[{order_id:"order",idempotency_key:"order",raw:{stripe_session_id:"cs_saved"}}],
  retrieve:async()=>{if(fail==="network") throw Error("offline");return {id:"cs_saved",metadata:{order_id:"order"},mode:"payment",currency:"usd",amount_total:1250,payment_status:"paid",status:"complete",...session} as Stripe.Checkout.Session;},
  confirm:async()=>{calls.push("confirm");return fail==="confirm"?{status:"failed"}:{status:"confirmed"};},
  expire:async()=>{calls.push("expire");return fail==="expire"?{error:"unavailable"}:{};},
 };
 return {deps,calls};
}
test("a paid session is confirmed only after provider verification",async()=>{
 const f=fixture();const r=await reconcileStripe(f.deps);assert.equal(r.confirmed,1);assert.deepEqual(f.calls,["confirm"]);
});
for(const session of [{id:"cs_foreign"},{metadata:{order_id:"foreign"}},{currency:"htg"},{mode:"subscription"},{amount_total:-1},{amount_total:1.2},{amount_total:null}] as Partial<Stripe.Checkout.Session>[]) {
 test("mismatched Stripe session cannot mutate the order: "+JSON.stringify(session),async()=>{
  const f=fixture(session);const r=await reconcileStripe(f.deps);assert.equal(r.errors.length,1);assert.deepEqual(f.calls,[]);
 });
}
test("a still-open or processing session is retained",async()=>{
 for(const status of ["open","complete"] as const){const f=fixture({status,payment_status:"unpaid"});const r=await reconcileStripe(f.deps);assert.equal(r.pending,1);assert.deepEqual(f.calls,[]);}
});
test("only a formal unpaid expiry permits releasing a reservation",async()=>{
 const f=fixture({status:"expired",payment_status:"unpaid"});const r=await reconcileStripe(f.deps);assert.equal(r.expired,1);assert.deepEqual(f.calls,["expire"]);
});
test("a network cut never expires or confirms a payment",async()=>{
 const f=fixture({},"network");const r=await reconcileStripe(f.deps);assert.equal(r.errors.length,1);assert.deepEqual(f.calls,[]);
});
test("a rejected amount in SQL is not reported as confirmed",async()=>{
 const f=fixture({},"confirm");const r=await reconcileStripe(f.deps);assert.equal(r.confirmed,0);assert.equal(r.errors.length,1);
});
test("a missing session is explicit and leaves the order intact",async()=>{
 const f=fixture();f.deps.listPending=async()=>[{order_id:"order",idempotency_key:"order",raw:null}];const r=await reconcileStripe(f.deps);assert.equal(r.missingSession,1);assert.deepEqual(f.calls,[]);
});
