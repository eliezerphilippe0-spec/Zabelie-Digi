import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { ReconcileAction, RefundReceiptForm } from "./actions";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHTG } from "@/lib/sample-data";
import { operationHref,operationLabels,type Operation,type MarketMetrics } from "@/lib/operations";
export const dynamic="force-dynamic";
export const metadata={title:"Opérations — Zabelie",robots:{index:false,follow:false}};
export default async function OperationsPage({searchParams}:{searchParams:Promise<{page?:string}>}){
 const user=await getAdminUser();
 if(!user||user.role!=="admin")return <AdminShell title="Accès refusé" actif="/admin/operations"><p className="mt-4">Une session administrateur vérifiée est requise.</p></AdminShell>;
 const page=Math.max(1,Math.min(3000,Math.floor(Number((await searchParams).page)||1)));
 const admin=createAdminClient();
 const [queue,metrics]=await Promise.all([
  admin.rpc("zabelie_operations_queue",{p_limit:30,p_offset:(page-1)*30}),admin.rpc("zabelie_market_metrics",{p_days:30}),
 ]);
 const rows=(queue.data?.rows??[]) as Operation[];const total=Number(queue.data?.total??0);const stats=metrics.data as MarketMetrics|null;
 return <AdminShell title="Ventes à suivre en Haïti" actif="/admin/operations" userName={user.displayName}>
 <p className="mt-3 max-w-2xl text-sm text-mist">Paiements, remise en main propre, dossiers clients et versements vendeurs. Les montants sont en gourdes ; les dates suivent l’heure de Port-au-Prince.</p>
 <div className="mt-6"><ReconcileAction/></div>
 <div className="mt-4 flex flex-wrap gap-4 text-sm"><Link className="inline-flex min-h-11 items-center underline" href="/admin#zelle">Vérifier un dépôt Zelle</Link><Link className="inline-flex min-h-11 items-center underline" href="/admin/livraisons">Suivi des remises</Link><Link className="inline-flex min-h-11 items-center underline" href="/admin#commandes">Décisions de remboursement</Link></div>
 <section className="mt-8"><h2 className="text-xl font-bold">Dossiers à traiter</h2>
 {queue.error?<p role="alert" className="mt-3 text-danger-text">La file est indisponible. Cela ne signifie pas qu’il n’y a aucun incident.</p>:<>
 <p className="mt-2 text-sm text-mist">{total} situations à traiter. Une commande peut nécessiter plusieurs actions.</p>
 {rows.length===0?<p className="mt-4">Aucune situation dans cette page de la file.</p>:<ol className="mt-4 space-y-3">{rows.map(row=><li key={row.kind+row.id} className="rounded-2xl border border-line p-4">
 <div className="flex flex-wrap justify-between gap-2"><h3 className="font-semibold">{operationLabels[row.kind]}</h3><span className="numeric">{formatHTG(row.amount_htg)}</span></div>
 <p className="mt-2 break-all text-xs text-mist">{row.reference??row.id} · {row.rail??"HTG"} · {new Date(row.since).toLocaleString("fr-HT",{timeZone:"America/Port-au-Prince"})}</p>
 <Link className="mt-2 inline-flex min-h-11 items-center text-sm underline" href={operationHref(row)}>Consulter et suivre</Link>
 {row.kind==="refund"&&row.order_id&&<RefundReceiptForm orderId={row.order_id}/>}
 </li>)}</ol>}
 <nav className="mt-4 flex gap-5">{page>1&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page-1)}>Précédent</Link>}{page*30<total&&<Link className="inline-flex min-h-11 items-center underline" href={"?page="+(page+1)}>Suivant</Link>}</nav>
 </>}
 </section>
 <section className="mt-10 border-t border-line pt-6"><h2 className="text-xl font-bold">Marché haïtien : les 30 derniers jours</h2>
 {metrics.error||!stats?<p className="mt-3 text-danger-text">Les mesures sont indisponibles.</p>:<>
 <p className="mt-2 text-xs text-mist">Commandes payantes réelles uniquement, hors comptes d’essai et achats du vendeur à lui-même. Une commande en attente n’est pas nécessairement abandonnée. La zone est celle déclarée par le vendeur, pas une preuve de couverture de livraison.</p>
 <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">{[["Commandes créées",stats.orders],["Achats confirmés",stats.paid],["Encore en attente",stats.pending],["Acheteurs revenus",stats.repeat_buyers]].map(([label,value])=><div key={label} className="rounded-xl border border-line p-4"><dt className="text-xs text-mist">{label}</dt><dd className="mt-2 text-xl font-bold numeric">{value}</dd></div>)}</dl>
 <p className="mt-4 text-sm">Délai médian inscription → première vente : {stats.first_sale_median_hours===null?"pas encore mesurable":Math.round(stats.first_sale_median_hours)+" h"}.</p>
 <h3 className="mt-6 font-semibold">Offres publiées par zone et catégorie</h3>
 <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-line"><th className="p-3">Zone</th><th className="p-3">Catégorie</th><th className="p-3">Offres</th><th className="p-3">Vendeurs</th><th className="p-3">Achats</th></tr></thead><tbody>{stats.markets.map((m,i)=><tr key={i} className="border-b border-line"><td className="p-3">{m.zone}</td><td className="p-3">{m.category}</td><td className="p-3">{m.products}</td><td className="p-3">{m.sellers}</td><td className="p-3">{m.paid}</td></tr>)}</tbody></table></div>
 <Link href="/admin#demande" className="mt-4 inline-flex min-h-11 items-center text-sm underline">Voir les recherches sans résultat pour recruter les bons vendeurs</Link>
 </>}
 </section>
 </AdminShell>;
}
