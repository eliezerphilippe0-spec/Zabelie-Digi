import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { DownloadButton } from "@/components/download-button";
import { DigitalLessonProgress } from "@/components/digital-lesson-progress";
import { getDigitalAccess } from "@/lib/digital-studio-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { UUID_RE, releaseAllowed, formatDigitalSize, type DigitalRelease } from "@/lib/digital-studio";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const metadata = { title: "Bibliothèque — Zabelie", robots: { index: false, follow: false } };
export default async function DigitalLibraryPage({ params, searchParams }: { params: Promise<{ orderId: string }>; searchParams: Promise<{ version?: string }> }) {
  const [{ orderId }, query, lang] = await Promise.all([params, searchParams, getLang()]);
  const access = isSupabaseConfigured() && UUID_RE.test(orderId) && (!query.version || UUID_RE.test(query.version)) ? await getDigitalAccess(orderId, query.version) : null;
  const shell = (content: React.ReactNode) => <div className="bg-grain min-h-dvh"><SiteNav/><main id="main" className="mx-auto max-w-5xl px-5 py-12"><Link href="/mes-achats?vue=numerique" className="mb-6 inline-flex min-h-11 items-center text-sm underline">{t(lang, "purchases.view.digital")}</Link>{content}</main><SiteFooter/></div>;
  if (!access) return shell(<><h1 className="text-3xl font-bold">{t(lang, "purchases.view.digital")}</h1><p className="mt-5">{t(lang, "studio.unavailable")}</p><Link className="mt-5 inline-flex min-h-11 items-center underline" href={`/connexion?next=${encodeURIComponent(`/mes-achats/${orderId}`)}`}>{t(lang, "nav.login")}</Link></>);
  const { original, release } = access;
  const admin = createAdminClient();
  const [{ data: versions }, { data: progress, error: progressError }] = await Promise.all([
    admin.from("zabelie_digital_releases").select("id,product_id,version").eq("product_id", original.product_id).gte("version", original.version).order("version", { ascending: false }).limit(50),
    admin.from("zabelie_digital_progress").select("lesson_id,completed").eq("order_id", orderId).eq("release_id", release.id),
  ]);
  const available = (versions ?? []).filter(v => releaseAllowed(original, v as DigitalRelease));
  if (!available.some(v => v.id === original.id)) available.push({ id: original.id, product_id: original.product_id, version: original.version });
  const completed = new Set((progress ?? []).filter(p => p.completed).map(p => p.lesson_id));
  const done = release.payload.lessons.filter(l => completed.has(l.id)).length;
  const resume = Math.max(0, release.payload.lessons.findIndex(l => !completed.has(l.id)));
  const labels = { download: t(lang, "purchases.download"), error: t(lang, "purchases.download.error"), network: t(lang, "error.network") };
  function download(assetId: string) { return <DownloadButton orderId={orderId} releaseId={release.id} assetId={assetId} labels={labels}/>; }
  return shell(<>
    <div className="border-b border-line pb-6"><p className="text-sm font-semibold text-mist">{t(lang, `studio.${release.manifest.mode}`)}</p><h1 className="mt-2 break-words text-3xl font-extrabold tracking-tight sm:text-4xl">{release.title}</h1><p className="mt-3 text-sm text-mist">{t(lang, "studio.version", { version: String(release.version) })} · {new Date(release.created_at).toLocaleDateString(lang === "ht" ? "fr-HT" : lang)}</p></div>
    {available.length > 1 && <aside className="mt-6 rounded-xl border border-line p-4"><p className="font-semibold">{t(lang, "studio.newVersion")}</p><nav aria-label={t(lang, "studio.versions")} className="mt-2 flex flex-wrap gap-2">{available.map(v => <Link key={v.id} href={`/mes-achats/${orderId}?version=${v.id}`} aria-current={v.id === release.id ? "page" : undefined} className="inline-flex min-h-11 items-center rounded-full border border-line px-4 text-sm underline">{t(lang, "studio.version", { version: String(v.version) })}{v.id === original.id ? ` · ${t(lang, "studio.acquired")}` : ""}</Link>)}</nav></aside>}
    <section className="mt-6 rounded-2xl border border-line p-5"><h2 className="text-lg font-bold">{t(lang, "digital.license")}</h2><p className="mt-2 whitespace-pre-line break-words text-sm">{original.details.license || t(lang, "digital.check")}</p><p className="mt-3 text-sm text-mist">{t(lang, original.manifest.include_updates ? "studio.updatesIncluded" : "studio.originalOnly")}</p></section>
    {release.payload.lessons.length > 0 && <section className="mt-8"><h2 className="text-xl font-bold">{t(lang, "studio.lessons")}</h2>{progressError ? <p role="alert" className="mt-3 text-danger-text">{t(lang, "studio.error")}</p> : <div className="mt-3"><label htmlFor="course-progress" className="text-sm">{t(lang, "studio.progress", { done: String(done), total: String(release.payload.lessons.length) })}</label><progress id="course-progress" value={done} max={release.payload.lessons.length} className="mt-2 block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand"/></div>}
      <ol className="mt-5 space-y-4">{release.payload.lessons.map((lesson, i) => <li key={lesson.id} id={`lecon-${lesson.id}`} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5"><details open={i === resume}><summary className="min-h-11 cursor-pointer"><span className="block text-xs text-mist">{lesson.chapter}</span><span className="text-lg font-semibold">{i + 1}. {lesson.title}</span></summary><div className="mt-5 whitespace-pre-line break-words leading-relaxed">{lesson.body}</div>{lesson.assetId && <div className="mt-5">{download(lesson.assetId)}</div>}</details>{!progressError && <DigitalLessonProgress orderId={orderId} releaseId={release.id} lessonId={lesson.id} completed={completed.has(lesson.id)} labels={{ complete: t(lang, "studio.complete"), completed: t(lang, "studio.completed"), error: t(lang, "studio.error") }}/>}</li>)}</ol>
    </section>}
    <section className="mt-8"><h2 className="text-xl font-bold">{t(lang, "studio.files")}</h2><ul className="mt-4 divide-y divide-line rounded-2xl border border-line">{release.payload.files.map(f => <li key={f.id} className="flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-0"><p className="break-all font-semibold">{f.file_name}</p><p className="numeric mt-1 text-sm text-mist">{formatDigitalSize(f.size_bytes, lang)}</p></div>{download(f.id)}</li>)}</ul></section>
  </>);
}
