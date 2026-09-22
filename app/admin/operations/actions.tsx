"use client";
import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
const subscribe=()=>()=>undefined;
const clientReady=()=>true;
const serverReady=()=>false;
export function ReconcileAction(){
 const ready=useSyncExternalStore(subscribe,clientReady,serverReady);
 const router=useRouter();const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const lock=useRef(false);
 async function run(){if(lock.current)return;lock.current=true;setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/reconcile",{method:"POST",headers:{"Content-Type":"application/json"},body:"{}",signal:AbortSignal.timeout(250000)});
   if(!r.ok)throw new Error("unavailable");
   const data=await r.json();
   const errors=(data.errors?.length??0)+(data.topup?.error?1:0)+(data.kobara?.error?1:0)+(data.kobara?.errors?.length??0)+(data.stripe?.error?1:0)+(data.stripe?.errors?.length??0);
   setMessage(data.ignore?"Une vérification est déjà en cours.":errors?"Vérification partielle : certains opérateurs restent à vérifier.":"Vérification terminée. Les statuts reflètent les réponses des opérateurs.");
   router.refresh();
  }catch{setMessage("Résultat non confirmé. Rechargez la file avant de réessayer.");}finally{lock.current=false;setBusy(false);}
 }
 return <div><button type="button" disabled={busy||!ready} onClick={run} className="min-h-11 rounded-xl bg-cloud px-4 py-3 text-sm font-semibold text-ink disabled:opacity-60">{busy?"Consultation des opérateurs…":"Vérifier les paiements en attente"}</button><p role="status" className="mt-2 max-w-xl text-sm text-mist">{message}</p></div>;
}
export function RefundReceiptForm({orderId}:{orderId:string}){
 const ready=useSyncExternalStore(subscribe,clientReady,serverReady);
 const router=useRouter();const [busy,setBusy]=useState(false);const [notice,setNotice]=useState("");
 async function submit(e:React.FormEvent<HTMLFormElement>){e.preventDefault();if(busy)return;const form=e.currentTarget;const fields=new FormData(form);setBusy(true);setNotice("");
 try{
 const r=await fetch("/api/admin/refund-receipt",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,method:fields.get("method"),reference:fields.get("reference"),paidAt:new Date(String(fields.get("date"))).toISOString(),confirmed:fields.get("confirm")==="on"})});
 if(!r.ok)throw new Error("unconfirmed");form.reset();setNotice("Référence enregistrée.");router.refresh();
 }catch{setNotice("Référence non enregistrée. Vérifiez la date et le statut de la commande.");}finally{setBusy(false);}}
 return <details className="mt-3 text-sm"><summary className="min-h-11 cursor-pointer">Enregistrer le retour effectif des fonds</summary><form onSubmit={submit} className="mt-3 space-y-3">
 <p className="text-xs text-mist">Ce formulaire ne transfère aucun argent. Vérifiez le justificatif opérateur ou la remise en espèces avant de confirmer.</p>
 <label className="block">Moyen utilisé<select name="method" required className="ml-2 min-h-11 rounded-xl border border-line bg-surface p-2">{["moncash","natcash","stripe","zelle","bank","cash"].map(m=><option key={m} value={m}>{m}</option>)}</select></label>
 <label className="block">Référence opérateur ou reçu<input name="reference" required minLength={5} maxLength={120} className="mt-1 min-h-11 w-full rounded-xl border border-line bg-surface p-2"/></label>
 <label className="block">Date du retour des fonds<input name="date" type="date" required className="ml-2 min-h-11 rounded-xl border border-line bg-surface p-2"/></label>
 <label className="flex min-h-11 items-center gap-3"><input name="confirm" type="checkbox" required/>J’ai vérifié le justificatif du retour des fonds.</label>
 <button disabled={busy||!ready} className="min-h-11 rounded-xl border border-line px-4 py-2">Enregistrer la référence</button><p role="status">{notice}</p>
 </form></details>;
}
