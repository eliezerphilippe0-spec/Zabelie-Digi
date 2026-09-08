import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth";
import type { DigitalStudio } from "@/lib/digital-studio";
import { t } from "@/lib/i18n";
export async function DigitalModeration({ productId }: { productId: string }) {
  const user = await getCurrentUser();
  if (user?.role !== "admin") return null;
  const admin = createAdminClient();
  const [{ data, error }, { data: files, error: fileError }] = await Promise.all([
    admin.from("zabelie_digital_studio").select("*").eq("product_id", productId).maybeSingle(),
    admin.from("product_assets").select("id,file_name").eq("product_id", productId),
  ]);
  if (error || fileError) return <p role="alert" className="mt-3 text-danger-text">{t("fr", "studio.error")}</p>;
  const studio = data as DigitalStudio | null;
  if (!studio && !files?.length) return null;
  return <details className="mt-4 rounded-xl border border-line p-3"><summary className="min-h-11 cursor-pointer font-semibold">{t("fr", "studio.title")}</summary>
    {studio && <><p className="mt-3 font-bold">{t("fr", `studio.${studio.mode}`)}</p>{(["preview", "outcomes", "prerequisites"] as const).map(k => studio[k] && <div key={k} className="mt-3"><h3 className="font-semibold">{t("fr", `studio.${k}`)}</h3><p className="whitespace-pre-line break-words">{studio[k]}</p></div>)}{studio.include_updates && <p className="mt-3">{t("fr", "studio.updatesIncluded")}</p>}
      <ol className="mt-3 space-y-3">{studio.lessons.map(l => <li key={l.id}><details className="rounded-xl border border-line p-3"><summary className="min-h-11 cursor-pointer">{l.chapter} · {l.title}{l.free ? ` · ${t("fr", "studio.preview")}` : ""}</summary><p className="whitespace-pre-line break-words">{l.body}</p><p className="mt-2 text-xs">{t("fr", "studio.resource")}: {files?.find(f => f.id === l.assetId)?.file_name ?? t("fr", "studio.none")}</p></details></li>)}</ol>
      {studio.faq.map((f, i) => <div key={i} className="mt-3"><strong>{f.question}</strong><p className="whitespace-pre-line break-words">{f.answer}</p></div>)}
    </>}
    <ul className="mt-3">{files?.map(f => <li key={f.id}><a className="inline-flex min-h-11 items-center break-all underline" href={`/api/admin/digital-preview?productId=${productId}&assetId=${f.id}`} target="_blank" rel="noopener noreferrer">{f.file_name}</a></li>)}</ul>
  </details>;
}
