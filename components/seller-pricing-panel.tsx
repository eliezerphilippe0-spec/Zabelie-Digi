import Link from "next/link";
import type { Lang } from "@/lib/i18n";
import { fixedFeeHTG, launchState, sellerFeeHTG, type SellerLaunch, type SellerPricing } from "@/lib/seller-pricing";
import { pricingText, sellerPricingCopy } from "@/lib/seller-pricing-copy";

export function SellerPricingPanel({ pricing, lang }: { pricing: SellerPricing; lang: Lang }) {
  const c = sellerPricingCopy(lang);
  const fmt = (n: number) => new Intl.NumberFormat(lang === "ht" ? "fr-HT" : lang).format(n);
  return <section className="mt-5 rounded-2xl border border-line bg-surface/40 p-5" aria-label={c.title}>
    <h2 className="text-lg font-semibold">{c.title}</h2>
    <p className="mt-2 text-sm text-mist">{c.free}</p>
    <dl className="mt-4 grid gap-4 sm:grid-cols-2">
      {(["direct", "discovery"] as const).map(source => <div key={source}>
        <dt className="text-sm text-mist">{c[source]}</dt>
        <dd className="mt-1 text-2xl font-bold numeric">
          {fmt((source === "direct" ? pricing.direct_rate_bps : pricing.discovery_rate_bps) / 100)} %
          {source === "direct" && <> + {fmt(fixedFeeHTG(pricing))} HTG</>}
        </dd>
        <dd className="mt-2 text-sm">{pricingText(c.example, { gross: fmt(1000) + " HTG", net: fmt(1000 - sellerFeeHTG(1000, source, pricing)) + " HTG" })}</dd>
      </div>)}
    </dl>
    <p className="mt-4 text-xs text-mist">{pricingText(c.fixed, { usd: fmt(pricing.direct_fixed_usd_cents / 100), rate: fmt(pricing.usd_htg_micros / 1_000_000) })}</p>
    <p className="mt-2 text-xs text-mist">{pricingText(c.attribution, { days: pricing.attribution_days })}</p>
    <p className="mt-2 text-xs text-mist">{c.estimate}</p>
    <div className="mt-5 border-t border-line pt-4">
      <h3 className="font-semibold">{c.launch}</h3>
      <p className="mt-2 text-sm">{pricingText(c.offer, { submit: pricing.submission_days, days: pricing.launch_days, sales: pricing.launch_sales_limit, discount: fmt(pricing.launch_discount_bps / 100) + " %" })}</p>
      <p className="mt-2 text-sm text-mist">{c.clock}</p>
      <p className="mt-2 text-xs text-mist">{c.discountRule}</p>
    </div>
  </section>;
}

export function SellerLaunchPanel({ launch, lang, now }: { launch: SellerLaunch | null; lang: Lang; now: number }) {
  if (!launch) return null;
  const c = sellerPricingCopy(lang);
  const state = launchState(launch, now);
  const date = new Date(state === "submit" ? launch.submission_deadline : launch.ends_at ?? launch.submission_deadline)
    .toLocaleDateString(lang === "ht" ? "fr-HT" : lang, { timeZone: "America/Port-au-Prince", year: "numeric", month: "short", day: "numeric" });
  return <section className="my-5 rounded-2xl border border-line bg-surface p-5" aria-label={c.launch}>
    <h2 className="font-semibold">{c.launch}</h2>
    <p className="mt-2 text-sm">{pricingText(c[state], { date, remaining: Math.max(0, launch.sales_limit - launch.used_sales) })}</p>
    <p className="mt-2 text-xs text-mist">{c.share}</p>
    <Link href="/vendre#mes-produits" className="mt-2 inline-flex min-h-11 items-center text-sm underline">{c.manage}</Link>
  </section>;
}

