import { createAdminClient } from "@/lib/supabase/admin";
import { t, type Lang } from "@/lib/i18n";
import { conversionPercent } from "@/lib/digital-studio";
import { formatHTG } from "@/lib/sample-data";
/** Seller id must come from the authenticated server session. */
export async function DigitalSellerMetrics({ sellerId, lang }: { sellerId: string; lang: Lang }) {
  const { data, error } = await createAdminClient().rpc("zabelie_digital_metrics", { p_seller: sellerId });
  const rate = data ? conversionPercent(Number(data.confirmed), Number(data.started)) : null;
  const values = data ? { started: data.started, confirmed: data.confirmed, pending: data.pending, conversion: rate === null ? "—" : `${rate}%`, accessed: data.accessed, gross: formatHTG(Number(data.gross_htg)) } : null;
  return <section className="mt-8 rounded-2xl border border-line p-5"><h2 className="text-xl font-bold">{t(lang, "studio.stats")}</h2>{error || !values ? <p role="alert" className="mt-3 text-sm text-mist">{t(lang, "studio.statsUnavailable")}</p> : <dl className="mt-5 grid gap-5 sm:grid-cols-3">{(Object.keys(values) as (keyof typeof values)[]).map(key => <div key={key}><dt className="text-sm text-mist">{t(lang, `studio.${key}`)}</dt><dd className="numeric mt-1 text-2xl font-bold">{values[key]}</dd></div>)}</dl>}<p className="mt-5 text-sm text-mist">{t(lang, "studio.statsHint")}</p></section>;
}
