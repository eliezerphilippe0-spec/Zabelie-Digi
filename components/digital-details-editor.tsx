"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIGITAL_DETAIL_FIELDS, DIGITAL_DETAIL_LIMITS, EMPTY_DIGITAL_DETAILS, type DigitalDetails, type DigitalDetailField } from "@/lib/digital-details";
export type DigitalDetailsLabels = Record<DigitalDetailField, string> & { title: string; hint: string; save: string; saving: string; saved: string; error: string };
export function DigitalDetailsEditor({ productId, initial, labels }: { productId: string; initial?: DigitalDetails; labels: DigitalDetailsLabels }) {
  const [values, setValues] = useState(initial ?? EMPTY_DIGITAL_DETAILS);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(null); setState("saving");
    try {
      const response = await fetch("/api/products/digital-details", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, details: values }) });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(typeof body?.error === "string" ? body.error : labels.error);
        setState("error"); return;
      }
      setState("saved"); router.refresh();
    } catch { setState("error"); }
  }
  return <details className="rounded-xl border border-line p-4">
    <summary className="min-h-11 cursor-pointer font-semibold">{labels.title}</summary>
    <p className="mt-2 text-sm text-mist">{labels.hint}</p>
    <form onSubmit={save} className="mt-4 grid gap-4 sm:grid-cols-2">
      {DIGITAL_DETAIL_FIELDS.map((key) => <label key={key} className={`grid gap-2 text-sm ${DIGITAL_DETAIL_LIMITS[key] > 500 ? "sm:col-span-2" : ""}`}>
        {labels[key]}
        <textarea rows={DIGITAL_DETAIL_LIMITS[key] > 500 ? 3 : 2} maxLength={DIGITAL_DETAIL_LIMITS[key]} value={values[key]} disabled={state === "saving"} onChange={(event) => { setValues({ ...values, [key]: event.target.value }); setState("idle"); }} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-base" />
      </label>)}
      <button disabled={state === "saving"} className="min-h-11 rounded-xl bg-brand px-4 font-semibold text-on-brand disabled:opacity-60" type="submit">{state === "saving" ? labels.saving : labels.save}</button>
      {state === "error" && <p role="alert" className="text-sm text-danger-text">{error ?? labels.error}</p>}
      {state === "saved" && <p role="status" className="text-sm text-success">{labels.saved}</p>}
    </form>
  </details>;
}
