import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { CATALOGUE_UNIVERSES, universeHref, type CatalogueUniverse } from "@/lib/catalogue-universes";

export function MarketplaceUniverses({ lang }: { lang: Lang }) {
  return <section className="mx-auto max-w-6xl px-3 py-7" aria-labelledby="shop-universes">
    <h2 id="shop-universes" className="mb-4 text-xl font-bold">{t(lang, "universe.heading")}</h2>
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
      {(Object.keys(CATALOGUE_UNIVERSES) as CatalogueUniverse[]).map((key, index) => <Link key={key} href={universeHref(key)} className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <span aria-hidden="true" className="mb-3 text-xs font-semibold text-mist">0{index + 1}</span>
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, CATALOGUE_UNIVERSES[key].title)}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, CATALOGUE_UNIVERSES[key].description)}</span>
      </Link>)}
      <Link href="/recharges" className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <span aria-hidden="true" className="mb-3 text-xs font-semibold text-mist">04</span>
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, "universe.recharges")}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, "universe.recharges.body")}</span>
      </Link>
    </div>
  </section>;
}
