import test from "node:test";
import assert from "node:assert/strict";
import {loadRoute} from "./helpers/route-harness";
import {supportInput,caseUpdateInput} from "../lib/support-case";
const actor="11300000-0000-4000-8000-000000000001";
const otherActor="11300000-0000-4000-8000-000000000002";
const input={orderId:"11300000-0000-4000-8000-000000000020",requestId:"11300000-0000-4000-8000-000000000030",reason:"debited",message:"Mon paiement doit être vérifié."};
function fixture(options:{user?:boolean;actorId?:string;member?:boolean;readError?:boolean;rate?:boolean;dbError?:boolean;admin?:boolean;jev?:boolean;duplicate?:boolean}={}) {
 const calls:{name:string;args:Record<string,unknown>}[]=[];
 const effects:string[]=[];
 const scheduled:(()=>unknown)[]=[];const triaged:unknown[]=[];
 const api=loadRoute(options.admin===undefined?"app/api/support/cases/route.ts":"app/api/admin/support/route.ts",{
  "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.user===false?null:{id:options.actorId??actor}},error:null})},rpc:async()=>{effects.push("membership");return {data:options.member!==false,error:options.readError?{}:null};}})},
  "@/lib/supabase/admin":{createAdminClient:()=>{effects.push("admin-client");return {rpc:async(name:string,args:Record<string,unknown>)=>{effects.push("write");calls.push({name,args});return {data:options.dbError?null:{ok:true,id:"11300000-0000-4000-8000-000000000099",...(options.duplicate?{duplicate:true}:{})},error:options.dbError?{}:null};}};}},
  "next/server":{NextResponse:{json:Response.json},after:(task:()=>unknown)=>{scheduled.push(task);}},
  "@/lib/jev/triage-server":{jevTriageActive:()=>options.jev===true,triageSupportInBackground:async(i:unknown)=>{triaged.push(i);}},
  "@/lib/support-case":{supportInput,caseUpdateInput},
  "@/lib/api-erreur":{erreurTraduite:(error:string,status:number)=>Response.json({error},{status})},
  "@/lib/zabelie-rate-limit":{rateLimit:async()=>{effects.push("rate-limit");return options.rate!==false;}},
  "@/lib/admin-audit":{exigerTraceAdmin:async()=>{effects.push("audit");return true;}},
  "@/lib/auth":{getAdminUser:async()=>options.admin?{id:options.actorId??actor,role:"admin"}:null},
 });
 return {calls,effects,scheduled,triaged,post:(body:unknown=input)=>api.POST(new Request("https://example.test/api/support/cases",{method:"POST",body:JSON.stringify(body)}))};
}
for(const admin of [false,true]) {
 const endpoint=admin?"admin":"participant";
 const body=admin?{orderId:input.orderId,requestId:input.requestId,message:input.message,status:"waiting_seller"}:input;
 const options=admin?{admin:true,actorId:otherActor}:{actorId:otherActor};
 test(endpoint+" rejects a stale form actor before privileged clients, rate limiting, membership, audit or write",async()=>{
  const f=fixture({...options,jev:true});
  assert.equal((await f.post({...body,expectedActorId:actor})).status,403);
  assert.deepEqual(f.effects,[]);assert.deepEqual(f.calls,[]);assert.deepEqual(f.scheduled,[]);
 });
 test(endpoint+" accepts the current actor and legacy clients while deriving the author only from the session",async()=>{
  for(const expected of [{expectedActorId:otherActor},{}]) {
   const f=fixture(options);assert.equal((await f.post({...body,...expected})).status,200);
   assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,"zabelie_submit_support");
   assert.equal(f.calls[0].args.p_actor,otherActor);
   assert.equal(f.calls[0].args.p_request_id,input.requestId);
   assert.equal(f.calls[0].args.p_body,input.message);
   assert.equal(f.calls[0].args.p_expected_actor_id,undefined,"the guard must not add a new database argument");
  }
 });
 test(endpoint+" rejects malformed expected actors without privileged side effects",async()=>{
  for(const expectedActorId of ["", "another-account", null, 12, [], {}]) {
   const f=fixture(options);assert.equal((await f.post({...body,expectedActorId})).status,400);
   assert.deepEqual(f.effects,[]);assert.deepEqual(f.calls,[]);
  }
 });
 test(endpoint+" authenticates before parsing an expected actor",async()=>{
  const f=fixture(admin?{admin:false}:{user:false});
  assert.equal((await f.post({...body,expectedActorId:"invalid"})).status,admin?403:401);
  assert.deepEqual(f.effects,[]);assert.deepEqual(f.calls,[]);
 });
}
for(const [name,opts,status] of [
 ["anonymous",{user:false},401],["foreign buyer",{member:false},403],["membership unavailable",{readError:true},503],["rate exceeded",{rate:false},429],
] as const) test(name+" cannot write support",async()=>{
 for(const body of [input,{...input,expectedActorId:actor}]) {
  const f=fixture(opts);assert.equal((await f.post(body)).status,status);assert.equal(f.calls.length,0);
 }
});
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
