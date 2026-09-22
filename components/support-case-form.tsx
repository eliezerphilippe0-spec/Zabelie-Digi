"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { caseStatuses, supportReasons } from "@/lib/support-case";
import { useSessionDraft } from "@/lib/use-session-draft";
import type { SupportCopy } from "@/lib/support-copy";
type Draft = { message: string; requestId: string; reason: typeof supportReasons[number]; status: typeof caseStatuses[number] };
const empty: Draft = {message:"",requestId:"",reason:"debited",status:"open"};
function validDraft(v: unknown): v is Draft {
 if (!v || typeof v !== "object") return false;
 const d=v as Draft;
 return typeof d.message==="string" && d.message.length<=2000 && typeof d.requestId==="string"
  && (d.requestId==="" || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(d.requestId))
  && supportReasons.includes(d.reason) && caseStatuses.includes(d.status);
}
export function SupportCaseForm({orderId, actorId, labels, isAdmin=false}: {orderId:string;actorId:string;labels:SupportCopy;isAdmin?:boolean}) {
 const router=useRouter();
 const [draft,setDraft,clear]=useSessionDraft<Draft>("zabelie:case:"+actorId+":"+orderId,empty,validDraft);
 const [busy,setBusy]=useState(false); const locked=useRef(false);
 const [notice,setNotice]=useState("");
 async function send(e:React.FormEvent) {
   e.preventDefault(); if(locked.current) return;
   if(!navigator.onLine) {setNotice(labels.offline);return;}
   locked.current=true;setBusy(true);setNotice("");
   const requestId=draft.requestId || crypto.randomUUID();
   setDraft({...draft,requestId});
   try {
     const response=await fetch(isAdmin?"/api/admin/support":"/api/support/cases",{
       method:"POST",headers:{"Content-Type":"application/json"},signal:AbortSignal.timeout(15000),
       body:JSON.stringify({orderId,requestId,message:draft.message,...(isAdmin?{status:draft.status}:{reason:draft.reason})}),
     });
     if(!response.ok) throw new Error("unconfirmed");
     clear();setDraft(empty);setNotice(labels.saved);router.refresh();
   }catch {setNotice(labels.error);}finally{locked.current=false;setBusy(false);}
 }
 return <form onSubmit={send} className="mt-6 space-y-4 rounded-2xl border border-line p-5">
   <label className="block text-sm font-semibold">{isAdmin?labels.status:labels.reason}
     {isAdmin?<select className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface p-3" disabled={busy} value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value as Draft["status"],requestId:""})}>{caseStatuses.map(s=><option key={s} value={s}>{labels[s]}</option>)}</select>:
     <select className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface p-3" disabled={busy} value={draft.reason} onChange={e=>setDraft({...draft,reason:e.target.value as Draft["reason"],requestId:""})}>{supportReasons.map(r=><option key={r} value={r}>{labels[r]}</option>)}</select>}
   </label>
   <label className="block text-sm font-semibold">{labels.message}<textarea required minLength={10} maxLength={2000} rows={5} disabled={busy} value={draft.message} onChange={e=>setDraft({...draft,message:e.target.value,requestId:""})} className="mt-2 w-full rounded-xl border border-line bg-surface p-3"/></label>
   <p className="text-xs text-mist">{labels.hint}</p><p className="text-xs text-mist">{labels.noAuto}</p>
   <button disabled={busy} className="min-h-11 rounded-xl bg-cloud px-5 py-3 text-sm font-semibold text-ink disabled:opacity-60">{busy?labels.sending:labels.send}</button>
   <p role="status" className="text-sm">{notice}</p>
 </form>;
}
