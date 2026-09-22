"use client";
import { useState } from "react";
import { availabilityNeedsReview, type ProductCommitment } from "@/lib/product-commitments";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

export function ProductCommitmentEditor({ productId, initial, labels, service }: { productId: string; initial?: ProductCommitment; labels: MarketplaceCopy; service: boolean }) {
  const [zones, setZones] = useState(initial?.zones ?? "");
  const [pickup, setPickup] = useState(initial?.pickup ?? "");
  const [days, setDays] = useState(initial?.delivery_days?.toString() ?? "");
  const [fees, setFees] = useState(initial?.fees ?? "quote");
  const [next, setNext] = useState(initial?.next_available ?? "");
  const [confirm, setConfirm] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState(initial?.availability_confirmed_at ?? null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const input = "mt-1 w-full rounded-xl border border-line bg-surface p-3 text-sm";
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/products/commitments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, details: { zones, pickup, delivery_days: days === "" ? null : Number(days), fees, next_available: next || null, confirmAvailability: confirm } }) });
      const data = await response.json();
      if (!response.ok) throw new Error("save-failed");
      setConfirmedAt(data.commitment.availability_confirmed_at);
      setConfirm(false);
      setState("saved");
    } catch { setState("error"); }
  }
  return <details className="mt-4 rounded-xl border border-line p-4"><summary className="min-h-11 cursor-pointer font-semibold">{labels.delivery}</summary>
    <form onSubmit={save} className="mt-3 space-y-3">
      <p className="text-xs text-mist">{labels.publicHint}</p>
      <label className="block text-sm">{labels.zones}<input className={input} value={zones} maxLength={300} onChange={e => setZones(e.target.value)}/></label>
      {!service && <label className="block text-sm">{labels.pickup}<input className={input} value={pickup} maxLength={180} onChange={e => setPickup(e.target.value)}/></label>}
      <label className="block text-sm">{labels.days}<input type="number" min={0} max={365} step={1} className={input} value={days} onChange={e => setDays(e.target.value)}/></label>
      <label className="block text-sm">{labels.fees}<select className={input} value={fees} onChange={e => setFees(e.target.value as "included" | "quote")}><option value="quote">{labels.quote}</option><option value="included">{labels.included}</option></select></label>
      {service && <label className="block text-sm">{labels.next}<input type="date" className={input} value={next} onChange={e => setNext(e.target.value)}/></label>}
      {availabilityNeedsReview(confirmedAt) && <p className="text-sm text-warning-text">{labels.reminder}</p>}
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirm} onChange={e => setConfirm(e.target.checked)}/>{labels.confirm}</label>
      <button disabled={state === "saving"} className="min-h-11 rounded-xl border border-line px-4 text-sm font-semibold disabled:opacity-50">{state === "saving" ? labels.saving : labels.save}</button>
      {state === "saved" && <p role="status" className="text-sm text-success-text">{labels.saved}</p>}
      {state === "error" && <p role="alert" className="text-sm text-danger-text">{labels.error}</p>}
    </form>
  </details>;
}
