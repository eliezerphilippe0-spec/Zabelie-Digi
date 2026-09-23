import test from "node:test";
import assert from "node:assert/strict";
import {loadRoute} from "./helpers/route-harness";
import {supportInput,caseUpdateInput} from "../lib/support-case";
const actor="11300000-0000-4000-8000-000000000001";
const input={orderId:"11300000-0000-4000-8000-000000000020",requestId:"11300000-0000-4000-8000-000000000030",reason:"debited",message:"Mon paiement doit être vérifié."};
function fixture(options:{user?:boolean;member?:boolean;readError?:boolean;rate?:boolean;dbError?:boolean;admin?:boolean;jev?:boolean;duplicate?:boolean}={}) {
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const scheduled:(()=>unknown)[]=[];const triaged:unknown[]=[];
 const api=loadRoute(options.admin===undefined?"app/api/support/cases/route.ts":"app/api/admin/support/route.ts",{
  "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.user===false?null:{id:actor}},error:null})},rpc:async()=>({data:options.member!==false,error:options.readError?{}:null})})},
  "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return {data:options.dbError?null:{ok:true,id:"11300000-0000-4000-8000-000000000099",...(options.duplicate?{duplicate:true}:{})},error:options.dbError?{}:null};}})},
  "next/server":{NextResponse:{json:Response.json},after:(task:()=>unknown)=>{scheduled.push(task);}},
  "@/lib/jev/triage-server":{jevTriageActive:()=>options.jev===true,triageSupportInBackground:async(i:unknown)=>{triaged.push(i);}},
  "@/lib/support-case":{supportInput,caseUpdateInput},
  "@/lib/api-erreur":{erreurTraduite:(error:string,status:number)=>Response.json({error},{status})},
  "@/lib/zabelie-rate-limit":{rateLimit:async()=>options.rate!==false},
  "@/lib/admin-audit":{exigerTraceAdmin:async()=>true},
  "@/lib/auth":{getAdminUser:async()=>options.admin?{id:actor,role:"admin"}:null},
 });
 return {calls,scheduled,triaged,post:(body:unknown=input)=>api.POST(new Request("https://example.test/api/support/cases",{method:"POST",body:JSON.stringify(body)}))};
}
for(const [name,opts,status] of [
 ["anonymous",{user:false},401],["foreign buyer",{member:false},403],["membership unavailable",{readError:true},503],["rate exceeded",{rate:false},429],
] as const) test(name+" cannot write support",async()=>{const f=fixture(opts);assert.equal((await f.post()).status,status);assert.equal(f.calls.length,0);});
test("the actor comes from the verified session, never the body",async()=>{
 const f=fixture();assert.equal((await f.post({...input,actor:"foreign"})).status,400);assert.equal(f.calls.length,0);
 assert.equal((await f.post()).status,200);assert.equal(f.calls[0].args.p_actor,actor);assert.equal(f.calls[0].args.p_status,undefined);
});
test("a buyer cannot close a case using the public endpoint",async()=>{
 const f=fixture();assert.equal((await f.post({...input,status:"resolved"})).status,400);assert.equal(f.calls.length,0);
});
test("an unavailable write remains retryable without false success",async()=>{assert.equal((await fixture({dbError:true}).post()).status,503);});
test("administration requires the MFA-aware admin guard",async()=>{
 const f=fixture({admin:false});assert.equal((await f.post()).status,403);assert.equal(f.calls.length,0);
 const a=fixture({admin:true});const {reason:_,...body}=input;assert.equal((await a.post({...body,status:"waiting_seller"})).status,200);assert.equal(a.calls[0].args.p_status,"waiting_seller");
});
test("Jev triage off by default: nothing scheduled, response unchanged",async()=>{
 const f=fixture();const r=await f.post();assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,id:"11300000-0000-4000-8000-000000000099"});
 assert.equal(f.scheduled.length,0);assert.equal(f.triaged.length,0);
});
test("Jev triage on: scheduled after the write, observation only, same response",async()=>{
 const f=fixture({jev:true});const r=await f.post();assert.equal(r.status,200);
 assert.deepEqual(await r.json(),{ok:true,id:"11300000-0000-4000-8000-000000000099"});
 assert.equal(f.triaged.length,0,"triage must not run before the response");
 assert.equal(f.scheduled.length,1);await f.scheduled[0]();
 // L'objet naît dans le bac à sable vm de la route (autre realm) : on compare son contenu.
 assert.deepEqual(JSON.parse(JSON.stringify(f.triaged)),[{caseId:"11300000-0000-4000-8000-000000000099",requestId:input.requestId,body:input.message}]);
});
test("Jev triage never runs on a replay or a failed write",async()=>{
 for(const opts of [{jev:true,duplicate:true},{jev:true,dbError:true},{jev:true,rate:false},{jev:true,member:false}]){
  const f=fixture(opts);await f.post();assert.equal(f.scheduled.length,0,JSON.stringify(opts));
 }
});
