"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DIGITAL_MODES, EMPTY_DIGITAL_STUDIO, type DigitalStudio } from "@/lib/digital-studio";
import type { StudioLabels } from "@/lib/digital-studio-labels";
const input = "w-full rounded-xl border border-line bg-surface px-3 py-2 text-base";
const button = "min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60";
export function DigitalStudioEditor({ productId, initial, assets, labels }: { productId: string; initial?: DigitalStudio; assets: { id: string; file_name: string }[]; labels: StudioLabels }) {
  const [value, setValue] = useState(initial ?? EMPTY_DIGITAL_STUDIO);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "saved" | "error">("idle");
  const router = useRouter();
  function change(next: DigitalStudio) { setValue(next); setState("idle"); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setState("idle");
    try {
      const response = await fetch("/api/products/digital-studio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, studio: { ...value, lessons: value.mode === "course" ? value.lessons : [] } }) });
      if (!response.ok) { setState("error"); return; }
      setState("saved"); router.refresh();
    } catch { setState("error"); } finally { setBusy(false); }
  }
  function move(index: number, delta: number) {
    const lessons = [...value.lessons];
    [lessons[index], lessons[index + delta]] = [lessons[index + delta], lessons[index]];
    change({ ...value, lessons });
  }
  return <details className="rounded-xl border border-line p-4">
    <summary className="min-h-11 cursor-pointer text-lg font-semibold">{labels.title}</summary>
    <p className="mt-2 max-w-3xl text-sm text-mist">{labels.intro}</p>
    <form onSubmit={save} className="mt-5">
      <fieldset disabled={busy} className="grid gap-5 disabled:opacity-60">
        <label className="grid gap-2">{labels.mode}<select className={input} value={value.mode} onChange={e => change({ ...value, mode: e.target.value as DigitalStudio["mode"] })}>{DIGITAL_MODES.map(mode => <option key={mode} value={mode}>{labels[mode]}</option>)}</select></label>
        {(["preview", "outcomes", "prerequisites"] as const).map(key => <label key={key} className="grid gap-2">{labels[key]}<textarea className={input} rows={key === "preview" ? 5 : 3} maxLength={key === "preview" ? 6000 : key === "outcomes" ? 1600 : 1200} value={value[key]} onChange={e => change({ ...value, [key]: e.target.value })}/></label>)}
        <div><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={value.include_updates} onChange={e => change({ ...value, include_updates: e.target.checked })}/>{labels.updates}</label><p className="text-sm text-mist">{labels.updatesHint}</p></div>
        {value.mode === "course" && <section aria-label={labels.lessons}>
          <h3 className="font-semibold">{labels.lessons}</h3>
          <ol className="mt-3 space-y-4">{value.lessons.map((lesson, i) => {
            function patch(update: Partial<typeof lesson>) { change({ ...value, lessons: value.lessons.map((l, j) => j === i ? { ...l, ...update } : l) }); }
            return <li key={lesson.id} className="rounded-xl border border-line p-4"><div className="flex flex-wrap items-center gap-2"><strong className="mr-auto">{i + 1}. {lesson.title || labels.lesson}</strong><button className={button} type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`${labels.up} ${i + 1}`}>{labels.up}</button><button className={button} type="button" disabled={i === value.lessons.length - 1} onClick={() => move(i, 1)} aria-label={`${labels.down} ${i + 1}`}>{labels.down}</button><button className={button} type="button" onClick={() => change({ ...value, lessons: value.lessons.filter(l => l.id !== lesson.id) })}>{labels.remove}</button></div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="grid gap-2">{labels.chapter}<input className={input} maxLength={120} value={lesson.chapter} onChange={e => patch({ chapter: e.target.value })}/></label><label className="grid gap-2">{labels.lesson}<input required className={input} maxLength={160} value={lesson.title} onChange={e => patch({ title: e.target.value })}/></label></div>
              <label className="mt-4 grid gap-2">{labels.body}<textarea className={input} rows={7} maxLength={12000} value={lesson.body} onChange={e => patch({ body: e.target.value })}/></label>
              <label className="mt-4 grid gap-2">{labels.resource}<select className={input} value={lesson.assetId} onChange={e => patch({ assetId: e.target.value })}><option value="">{labels.none}</option>{assets.map(a => <option key={a.id} value={a.id}>{a.file_name}</option>)}</select></label>
              <label className="mt-3 flex min-h-11 items-center gap-3"><input type="checkbox" checked={lesson.free} onChange={e => patch({ free: e.target.checked })}/>{labels.free}</label><p className="text-sm text-mist">{labels.freeHint}</p>
            </li>;
          })}</ol>
          <button type="button" className={`${button} mt-3`} disabled={value.lessons.length >= 40} onClick={() => change({ ...value, lessons: [...value.lessons, { id: crypto.randomUUID(), chapter: "", title: "", body: "", assetId: "", free: false }] })}>{labels.addLesson}</button>
        </section>}
        <section aria-label={labels.faq}><h3 className="font-semibold">{labels.faq}</h3><div className="mt-3 space-y-4">{value.faq.map((f, i) => <div key={i} className="grid gap-3 rounded-xl border border-line p-4"><label className="grid gap-2">{labels.question}<input required className={input} maxLength={200} value={f.question} onChange={e => change({ ...value, faq: value.faq.map((v, j) => i === j ? { ...v, question: e.target.value } : v) })}/></label><label className="grid gap-2">{labels.answer}<textarea required className={input} rows={3} maxLength={1600} value={f.answer} onChange={e => change({ ...value, faq: value.faq.map((v, j) => i === j ? { ...v, answer: e.target.value } : v) })}/></label><button type="button" className={button} onClick={() => change({ ...value, faq: value.faq.filter((_, j) => i !== j) })}>{labels.remove}</button></div>)}</div><button type="button" className={`${button} mt-3`} disabled={value.faq.length >= 8} onClick={() => change({ ...value, faq: [...value.faq, { question: "", answer: "" }] })}>{labels.addFaq}</button></section>
        <button type="submit" className="min-h-11 rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand">{busy ? labels.saving : labels.save}</button>
      </fieldset>
      {state === "saved" && <p role="status" className="mt-3 text-success-text">{labels.saved}</p>}
      {state === "error" && <p role="alert" className="mt-3 text-danger-text">{labels.error}</p>}
    </form>
  </details>;
}
export function DigitalDraftAction({ productId, assetId, labels }: { productId: string; assetId?: string; labels: StudioLabels }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const router = useRouter();
  async function act() {
    setBusy(true); setError(false);
    try { const res = await fetch("/api/products/digital-studio", { method: assetId ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, assetId }) }); if (!res.ok) setError(true); else router.refresh(); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <div>{!assetId && <p className="mb-3 max-w-2xl text-sm text-mist">{labels.reviseHint}</p>}<button className={button} type="button" disabled={busy} onClick={act}>{busy ? labels.saving : assetId ? labels.remove : labels.revise}</button>{error && <p role="alert" className="text-sm text-danger-text">{labels.error}</p>}</div>;
}
