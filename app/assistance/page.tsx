import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { createClient } from "@/lib/supabase/server";
import { getLang } from "@/lib/i18n-server";
import { supportCopy } from "@/lib/support-copy";
import type { SupportCase } from "@/lib/support-case";
export const dynamic = "force-dynamic";
export const metadata = { title: "Zabelie", robots: { index: false, follow: false } };
export default async function CasesPage({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const client=await createClient();
 const {data:{user}}=await client.auth.getUser();
 if(!user) redirect("/connexion?next=%2Fassistance");
 const labels=supportCopy(await getLang());
 const page=Math.max(1,Math.min(1000,Math.floor(Number((await searchParams).page)||1)));
 // Session client: RLS returns cases for this buyer OR this seller, including digital sales.
 const {data,error}=await client.from("zabelie_support_cases")
  .select("id,order_id,status,updated_at,order:orders(order_ref)")
  .order("updated_at",{ascending:false}).order("id",{ascending:false}).range((page-1)*30,page*30);
 if(error) throw new Error("support_inbox_unavailable");
 const more=(data?.length??0)>30;
 return <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-3xl px-5 py-10">
  <h1 className="text-3xl font-extrabold">{labels.cases}</h1>
  {!data?.length?<p className="mt-5 text-mist">{labels.casesEmpty}</p>:<ul className="mt-6 space-y-3">{data.slice(0,30).map(row=>{
   const order=Array.isArray(row.order)?row.order[0]:row.order;
   return <li key={row.id}><Link className="block min-h-11 rounded-xl border border-line p-4" href={`/assistance/commande/${row.order_id}`}>
    <span className="block break-all font-semibold">{order?.order_ref??row.order_id}</span>
    <span className="mt-2 block text-sm text-mist">{labels[row.status as SupportCase["status"]]}</span>
   </Link></li>;
  })}</ul>}
  <nav className="mt-5 flex gap-5">{page>1&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page-1)}>{labels.newer}</Link>}{more&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page+1)}>{labels.older}</Link>}</nav>
 </main><SiteFooter/></div>;
}
