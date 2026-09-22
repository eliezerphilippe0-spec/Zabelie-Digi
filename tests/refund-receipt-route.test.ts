import test from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {loadRoute} from "./helpers/route-harness";
const input={orderId:"11300000-0000-4000-8000-000000000020",method:"moncash",reference:"REF-RECETTE",paidAt:"2026-09-22T12:00:00Z",confirmed:true};
function fixture(options:{admin?:boolean;audit?:boolean;error?:string}={}){
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const route=loadRoute("app/api/admin/refund-receipt/route.ts",{
  zod:{z},
  "@/lib/auth":{getAdminUser:async()=>options.admin===false?null:{id:"verified-admin",role:"admin"}},
  "@/lib/admin-audit":{exigerTraceAdmin:async(_db:unknown,act:{action:string})=>{assert.match(act.action,/^[a-z_]+\.[a-z_]+$/);return options.audit!==false;}},
  "@/lib/api-erreur":{erreurTraduite:(error:string,status:number)=>Response.json({error},{status})},
  "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{data:{ok:true},error:options.error?{code:options.error}:null};}})},
 });
 return{calls,post:(body:unknown=input)=>route.POST(new Request("https://example.test/api/admin/refund-receipt",{method:"POST",body:JSON.stringify(body)}))};
}
test("a receipt needs MFA-aware admin authorization and a successful audit record",async()=>{
 for(const [opts,status] of [[{admin:false},403],[{audit:false},503]] as const){const f=fixture(opts);assert.equal((await f.post()).status,status);assert.equal(f.calls.length,0);}
});
test("a receipt cannot be submitted without explicit verification or with a forged actor",async()=>{
 for(const body of [{...input,confirmed:false},{...input,actor:"another"},{...input,method:"unknown"},{...input,reference:"xx"}]){
  const f=fixture();assert.equal((await f.post(body)).status,400);assert.equal(f.calls.length,0);
 }
});
test("recording a receipt invokes only the evidence RPC, never a financial transfer",async()=>{
 const f=fixture();const res=await f.post();assert.equal(res.status,200);assert.equal(res.headers.get("cache-control"),"no-store");
 assert.deepEqual(f.calls.map(c=>c.name),["zabelie_record_refund_receipt"]);assert.equal(f.calls[0].args.p_actor,"verified-admin");
});
test("conflicting evidence and missing accounting reversal are explicit conflicts",async()=>{
 for(const error of ["23505","22023"]){assert.equal((await fixture({error}).post()).status,409);}
 assert.equal((await fixture({error:"XX000"}).post()).status,503);
});
