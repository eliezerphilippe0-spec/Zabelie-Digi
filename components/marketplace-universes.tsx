import Link from "next/link";
import { isTopupFirstPartyEnabled } from "@/lib/topup-flag";
import { t, type Lang } from "@/lib/i18n";
import { CATALOGUE_UNIVERSES, universeHref, type CatalogueUniverse } from "@/lib/catalogue-universes";

function UniverseIcon({ index }: { index: number }) {
  const paths = ["M8 17h32v27H8z M15 17v-4a9 9 0 0 1 18 0v4 M16 26h16", "M8 9h32v25H8z M18 43h12 M24 34v9 M17 20l-4 4 4 4 M31 20l4 4-4 4", "M13 8h22v34H13z M19 17h10 M19 24h10 M19 31h5", "M16 5h20v38H16z M23 36h6"];
  return <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[index]} /></svg>;
}

export function MarketplaceUniverses({ lang }: { lang: Lang }) {
  return <section className="marketplace-universes mx-auto max-w-6xl px-3 py-7" aria-labelledby="shop-universes">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="shop-universes" className="text-xl font-bold">{t(lang, "universe.heading")}</h2><Link href="/categories" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t(lang, "directory.title")}</Link></div>
    <div className="universe-grid">
      {(Object.keys(CATALOGUE_UNIVERSES) as CatalogueUniverse[]).map((key, index) => <Link key={key} href={universeHref(key)} className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <span className="universe-symbol"><UniverseIcon index={index} /></span>
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, CATALOGUE_UNIVERSES[key].title)}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, CATALOGUE_UNIVERSES[key].description)}</span>
      </Link>)}
      <Link href="/recharges" className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <span className="universe-symbol"><UniverseIcon index={3} /></span>
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, "universe.recharges")}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, "universe.recharges.body")}</span>
        {!isTopupFirstPartyEnabled() && <span className="mt-4 text-xs font-semibold text-mist">{t(lang, "availability.topup.paused")}</span>}
      </Link>
    </div>
  </section>;
}
