"use client";
import { useState, useId, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { OFFER_KINDS, type OfferSelection, type OfferKind } from "@/lib/product-offers";
import type { OfferCopy } from "@/lib/product-offer-copy";
export function ProductOffersEditor({ productId, initial, choices, confirmed, copy }: {
  productId: string; initial: OfferSelection;
  choices: Record<OfferKind, { id: string; label: string }[]>; confirmed: Record<OfferKind, number>; copy: OfferCopy;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter(), formId = useId();
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/products/offers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, offers: value }) });
      const result = await response.json().catch(() => null);
      setMessage(response.ok ? copy.saved : (result?.error ?? copy.unavailable));
      if (response.ok) router.refresh();
    } catch { setMessage(copy.unavailable); } finally { setBusy(false); }
  }
  return <details className="mt-4 rounded-xl border border-line p-4">
    <summary className="min-h-11 cursor-pointer font-semibold">{copy.title}</summary>
    <p className="mt-2 text-sm text-mist">{copy.intro}</p>
    <form onSubmit={save} className="mt-4 space-y-4">
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-80">
        {OFFER_KINDS.map(kind => <div key={kind}>
          <label htmlFor={formId + kind} className="mb-2 block text-sm font-semibold">{copy[kind]}</label>
          <select id={formId + kind} value={value[kind] ?? ""} onChange={e => { setValue({ ...value, [kind]: e.target.value || null }); setMessage(""); }}
            className="min-h-11 w-full min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm">
            <option value="">{copy.none}</option>
            {value[kind] && !choices[kind].some(p => p.id === value[kind]) && <option value={value[kind]!}>{copy.unavailable}</option>}
            {choices[kind].map(p => <option key={p.id} value={p.id} disabled={OFFER_KINDS.some(k => k !== kind && value[k] === p.id)}>{p.label}</option>)}
          </select>
          <p className="mt-1 text-xs text-mist">{copy.sales} : {value[kind] === initial[kind] ? confirmed[kind] : "—"}</p>
        </div>)}
        <p className="text-xs text-mist">{copy.rules}</p>
        <p className="text-xs text-mist">{copy.salesHint}</p>
        {!choices.cross_sell.length && <p className="text-sm text-mist">{copy.empty}</p>}
        <button type="submit" className="min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand">{busy ? copy.saving : copy.save}</button>
      </fieldset>
      <p role="status" aria-live="polite" className="text-sm text-mist">{message}</p>
    </form>
  </details>;
}
