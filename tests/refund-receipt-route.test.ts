import test from "node:test";
import assert from "node:assert/strict";
import {z} from "zod";
import {loadRoute} from "./helpers/route-harness";
import { t, LANGS } from "../lib/i18n";
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
 for(const body of [{...input,confirmed:false},{...input,actor:"another"},{...input,method:"unknown"},{...input,method:"cash"},{...input,method:"bank"},{...input,reference:"xx"}]){
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

function accountingFixture(options: { admin?: boolean; audit?: boolean; error?: boolean; duplicate?: boolean } = {}) {
 const calls: string[] = [];
 const route = loadRoute("app/api/admin/refund/route.ts", {
  zod: { z },
  "@/lib/auth": { getAdminUser: async () => options.admin === false ? null : { id: "verified-admin", role: "admin" } },
  "@/lib/admin-audit": { exigerTraceAdmin: async (_db: unknown, act: { actorId: string; targetId: string }) => {
   calls.push("audit"); assert.equal(act.actorId, "verified-admin"); assert.equal(act.targetId, input.orderId); return options.audit !== false;
  } },
  "@/lib/api-erreur": { erreurTraduite: (error: string, status: number) => Response.json({ error }, { status }) },
  "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name: string, args: { p_order_id: string }) => {
   calls.push(name); assert.equal(args.p_order_id, input.orderId);
   return { data: options.duplicate ? "already_reversed" : "reversed", error: options.error ? { message: "PRIVATE_SQL_DETAILS" } : null };
  } }) },
  "@/lib/webhooks-apres": { repartirApresReponse: () => calls.push("dispatch") },
 });
 return { calls, post: (body: unknown = { orderId: input.orderId }) => route.POST(new Request("https://example.test/api/admin/refund", { method: "POST", body: JSON.stringify(body) })) };
}

test("accounting reversal needs MFA-aware admin, a UUID and an audit before the existing RPC", async () => {
 for (const [opts, status] of [[{ admin: false }, 403], [{ audit: false }, 503]] as const) {
  const f = accountingFixture(opts); assert.equal((await f.post()).status, status); assert.ok(!f.calls.includes("refund_order"));
 }
 for (const body of [{}, { orderId: "not-a-uuid" }, { orderId: [] }, { orderId: input.orderId, actorId: "forged" }]) {
  const f = accountingFixture(); assert.equal((await f.post(body)).status, 400); assert.deepEqual(f.calls, []);
 }
});

test("reversal does not promise an operator transfer or leak SQL; replay stays delegated to the DB", async () => {
 for (const duplicate of [false, true]) {
  const f = accountingFixture({ duplicate }); const res = await f.post();
  assert.equal(res.status, 200); assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal((await res.json()).result, duplicate ? "already_reversed" : "reversed");
  assert.deepEqual(f.calls, ["audit", "refund_order", "dispatch"]);
 }
 const f = accountingFixture({ error: true }); const res = await f.post();
 assert.equal(res.status, 503); assert.equal((await res.json()).error, "api.unavailable");
 assert.deepEqual(f.calls, ["audit", "refund_order"]);
});

test("four languages distinguish accounting reversal from an external return of funds", () => {
 for (const lang of LANGS) for (const key of ["admin.refund.button", "admin.refund.confirm", "admin.refund.error", "admin.refund.notice", "admin.refund.operations", "api.checkout.selfPurchase"] as const) {
  assert.ok(t(lang, key).length > 5); assert.notEqual(t(lang, key), key);
 }
 assert.match(t("fr", "admin.refund.confirm"), /Aucun argent n’est transféré/);
 assert.match(t("en", "admin.refund.confirm"), /does not transfer any money/);
 assert.match(t("ht", "admin.refund.confirm"), /pa transfere okenn lajan/);
 assert.match(t("es", "admin.refund.confirm"), /no transfiere dinero/);
});

test("the real admin button asks about accounting only and links the existing evidence queue", async () => {
 type Element = { type: unknown; props: Record<string, unknown> };
 const element = (type: unknown, props: Record<string, unknown>): Element => ({ type, props });
 function find(tree: unknown, type: string): Element | undefined {
  if (Array.isArray(tree)) return tree.map(child => find(child,type)).find(Boolean);
  if (!tree || typeof tree !== "object") return undefined;
  const node=tree as Element; return node.type===type?node:find(node.props?.children,type);
 }
 for (const lang of LANGS) {
  const labels={button:t(lang,"admin.refund.button"),confirm:t(lang,"admin.refund.confirm"),error:t(lang,"admin.refund.error"),connection:t(lang,"admin.refund.connection"),notice:t(lang,"admin.refund.notice"),operations:t(lang,"admin.refund.operations")};
  const confirmations:string[]=[]; const requests:string[]=[]; let approved=false; let refreshed=0;
  const component=loadRoute("components/admin-refund-button.tsx",{
   react:{useState:(v:unknown)=>[v,()=>undefined]},
   "react/jsx-runtime":{jsx:element,jsxs:element},
   "next/navigation":{useRouter:()=>({refresh:()=>{refreshed++;}})},
  },{}, {window:{confirm:(message:string)=>{confirmations.push(message);return approved;}},fetch:async(url:string)=>{requests.push(url);return Response.json({ok:true,result:"reversed"});}}) as unknown as {AdminRefundButton(p:unknown):Element};
  const tree=component.AdminRefundButton({orderId:input.orderId,labels});
  assert.equal(find(tree,"button")?.props.children,labels.button);
  assert.equal(find(tree,"a")?.props.href,"/admin/operations");
  assert.equal(find(tree,"a")?.props.children,labels.operations);
  await (find(tree,"button")!.props.onClick as ()=>Promise<void>)();
  assert.deepEqual(requests,[]); assert.equal(refreshed,0);
  approved=true; await (find(tree,"button")!.props.onClick as ()=>Promise<void>)();
  assert.deepEqual(requests,["/api/admin/refund"]); assert.equal(refreshed,1);
  assert.deepEqual(confirmations,[labels.confirm,labels.confirm]);
 }
});
