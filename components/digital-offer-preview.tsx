import type { DigitalManifest } from "@/lib/digital-studio";
import { t, type Lang } from "@/lib/i18n";
export function DigitalOfferPreview({ manifest: m, lang }: { manifest: DigitalManifest; lang: Lang }) {
  return <section className="mt-6 space-y-6 rounded-2xl border border-line bg-surface p-5" aria-label={t(lang, "studio.preview")}>
    <p className="text-sm font-semibold text-cloud">{t(lang, `studio.${m.mode}`)}</p>
    {(["preview", "outcomes", "prerequisites"] as const).map(k => m[k] ? <div key={k}><h2 className="text-lg font-bold">{t(lang, `studio.${k}`)}</h2><p className="mt-2 whitespace-pre-line break-words leading-relaxed">{m[k]}</p></div> : null)}
    {m.files.length > 0 && <div><h2 className="text-lg font-bold">{t(lang, "studio.files")}</h2><ul className="mt-3 space-y-2">{m.files.map(f => <li key={f.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2"><span className="break-all">{f.file_name}</span><span className="numeric text-sm text-mist">{(f.size_bytes / 1024 / 1024).toFixed(1)} MB</span></li>)}</ul></div>}
    {m.lessons.length > 0 && <div><h2 className="text-lg font-bold">{t(lang, "studio.lessons")}</h2><ol className="mt-3 space-y-3">{m.lessons.map((l, i) => <li key={l.id} className="rounded-xl border border-line p-4"><p className="text-xs text-mist">{l.chapter}</p>{l.free && l.body ? <details><summary className="min-h-11 cursor-pointer font-semibold">{i + 1}. {l.title} · {t(lang, "studio.preview")}</summary><p className="mt-3 whitespace-pre-line break-words leading-relaxed">{l.body}</p></details> : <p className="py-2 font-semibold">{i + 1}. {l.title}</p>}</li>)}</ol></div>}
    {m.faq.length > 0 && <div><h2 className="text-lg font-bold">{t(lang, "studio.faq")}</h2>{m.faq.map((f, i) => <details key={i} className="mt-2 border-b border-line py-2"><summary className="flex min-h-11 cursor-pointer items-center font-semibold">{f.question}</summary><p className="pb-3 whitespace-pre-line break-words leading-relaxed">{f.answer}</p></details>)}</div>}
    {m.include_updates && <p className="text-sm font-semibold">{t(lang, "studio.updatesIncluded")}</p>}
  </section>;
}
