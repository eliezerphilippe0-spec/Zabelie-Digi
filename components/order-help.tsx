"use client";
import Link from "next/link";
import { useState } from "react";
import { MessageForm } from "@/components/message-form";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

export function OrderHelp({ orderId, orderRef, productId, labels, messageLabels, supportUrl, caseLabel }: {
  orderId: string; orderRef: string; productId?: string; labels: MarketplaceCopy;
  messageLabels: { placeholder: string; send: string; sending: string; sent: string; warn: string };
  supportUrl: string | null; caseLabel: string;
}) {
  const [reason, setReason] = useState<"debited" | "notReceived" | "wrong">("debited");
  const [copied, setCopied] = useState(false);
  const text = `${labels.order}: ${orderRef}\nID: ${orderId}\n${labels[reason]}\n`;
  return <details className="mt-3 max-w-lg rounded-xl border border-line p-3">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold">{labels.help}</summary>
    <Link href={`/assistance/commande/${orderId}`} className="inline-flex min-h-11 items-center text-sm font-semibold underline">{caseLabel}</Link>
    <label className="mt-2 block text-sm">{labels.help}<select className="mt-2 w-full rounded-xl border border-line bg-surface p-3" value={reason}
      onChange={e => { setReason(e.target.value as typeof reason); setCopied(false); }}>
      {(["debited", "notReceived", "wrong"] as const).map(r => <option key={r} value={r}>{labels[r]}</option>)}
    </select></label>
    {productId && <MessageForm key={reason} productId={productId} initialText={text} labels={{ ...messageLabels, send: labels.sendSeller }}/>}
    <p className="mt-3 text-xs text-mist">{labels.copyHint}</p>
    <textarea aria-label={labels.copy} readOnly value={text} className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-xs" rows={3} onFocus={e => e.target.select()}/>
    <div className="flex flex-wrap gap-4">
      <button className="min-h-11 text-sm underline" type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? labels.copied : labels.copy}</button>
      <a className="inline-flex min-h-11 items-center text-sm underline" href={supportUrl ?? "/aide#probleme"} target={supportUrl ? "_blank" : undefined} rel={supportUrl ? "noopener noreferrer" : undefined}>{labels.contact}</a>
    </div>
    <p className="mt-2 text-xs text-mist">{labels.helpNote}</p>
  </details>;
}
