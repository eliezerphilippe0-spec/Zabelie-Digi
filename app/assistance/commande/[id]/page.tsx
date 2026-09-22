import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { SupportCaseForm } from "@/components/support-case-form";
import { getAdminUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLang } from "@/lib/i18n-server";
import { supportCopy } from "@/lib/support-copy";
import type { SupportCase, SupportMessage } from "@/lib/support-case";
import { formatHTG } from "@/lib/sample-data";
export const dynamic="force-dynamic";
export const metadata={title:"Zabelie",robots:{index:false,follow:false}};
export default async function OrderSupportPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string}>}) {
 const {id}=await params; if(!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 const lang=await getLang();const labels=supportCopy(lang);
 const client=await createClient();const {data:{user}}=await client.auth.getUser();
 if(!user) redirect("/connexion?next="+encodeURIComponent("/assistance/commande/"+id));
 const administrator=await getAdminUser();const isAdmin=administrator?.role==="admin";
 if(!isAdmin) {
  const {data,error}=await client.rpc("zabelie_order_participant",{p_order_id:id});
  if(error) throw new Error("support_membership_unavailable");
  if(!data) notFound();
 }
 const admin=createAdminClient();
 const [orderResult,caseResult,receiptResult]=await Promise.all([
   admin.from("orders").select("id,order_ref,amount_htg,status").eq("id",id).single(),
   admin.from("zabelie_support_cases").select("*").eq("order_id",id).maybeSingle(),
   admin.from("zabelie_refund_receipts").select("paid_at,method").eq("order_id",id).maybeSingle(),
 ]);
 if(orderResult.error||caseResult.error||receiptResult.error) throw new Error("support_unavailable");
 const order=orderResult.data; if(!order) notFound();
 const dossier=caseResult.data as SupportCase|null;
 const page=Math.min(200,Math.max(1,Math.floor(Number((await searchParams).page)||1)));
 let messages:SupportMessage[]=[];let more=false;
 if(dossier){
  const {data,error}=await admin.from("zabelie_support_messages").select("id,author_id,author_role,body,created_at")
   .eq("case_id",dossier.id).order("created_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*30,page*30);
  if(error) throw new Error("support_history_unavailable");
  more=(data?.length??0)>30;messages=(data??[]).slice(0,30).reverse() as SupportMessage[];
 }
 const date=(s:string)=>new Intl.DateTimeFormat(lang==="ht"?"fr-HT":lang,{dateStyle:"medium",timeStyle:"short",timeZone:"America/Port-au-Prince"}).format(new Date(s));
 return <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-3xl px-5 py-10">
  <Link href={isAdmin?"/admin/operations":"/assistance"} className="inline-flex min-h-11 items-center text-sm underline">{isAdmin?"Administration":labels.cases}</Link>
  <h1 className="mt-4 text-3xl font-extrabold">{labels.title}</h1><p className="mt-2 break-all text-sm text-mist">{order.order_ref??order.id} · {formatHTG(order.amount_htg)}</p>
  {dossier?<div className="mt-5 rounded-xl border border-line p-4"><p className="font-semibold">{labels[dossier.status]}</p><p className="mt-2 text-sm">{labels.review}: {date(dossier.response_due_at)}</p><p className="mt-2 text-xs text-mist">{labels.reviewNote}</p></div>:<p className="mt-5 text-mist">{labels.empty}</p>}
  {order.status==="refunded"&&<p className="mt-4 rounded-xl border border-line p-4 text-sm">{receiptResult.data?labels.refundRecorded:labels.refundPending}</p>}
  {messages.length>0&&<section className="mt-6"><h2 className="font-semibold">{labels.history}</h2><ol className="mt-3 space-y-3">{messages.map(m=><li key={m.id} className="rounded-xl border border-line p-4"><p className="text-xs text-mist">{labels[m.author_role]} · {date(m.created_at)}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{m.body}</p></li>)}</ol></section>}
  <nav className="mt-4 flex gap-5">{page>1&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page-1)}>{labels.newer}</Link>}{more&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page+1)}>{labels.older}</Link>}</nav>
  <SupportCaseForm orderId={id} actorId={user.id} labels={labels} isAdmin={isAdmin}/>
 </main><SiteFooter/></div>;
}
