import Link from "next/link";
import { isTopupFirstPartyEnabled } from "@/lib/topup-flag";
import { t, type Lang } from "@/lib/i18n";
import { CATALOGUE_UNIVERSES, universeHref, type CatalogueUniverse } from "@/lib/catalogue-universes";

/**
 * Icône illustrée d'un univers (accueil vivant, V-22) : une forme pleine en
 * surface, un trait d'encre, un détail orange. Couleurs par TOKENS
 * (`.universe-art` dans app/home-vivant.css), donc elles suivent le thème.
 * Ordre : physique, digital, services, recharges.
 */
function UniverseArt({ index }: { index: number }) {
  const formes = [
    <><path className="ua-forme" d="M12 22h40l-3 32H15z" /><path className="ua-trait" d="M23 22v-5a9 9 0 0 1 18 0v5" /><path className="ua-detail" d="M22 34h20" /></>,
    <><path className="ua-forme" d="M38 8H16v48h32V18z" /><path className="ua-trait" d="M38 8v10h10" /><path className="ua-detail" d="M32 28v16M26 38l6 6 6-6" /></>,
    <><rect className="ua-forme" x="8" y="20" width="48" height="34" rx="5" /><path className="ua-trait" d="M24 20v-5h16v5M8 34h48" /><path className="ua-detail" d="M28 34v6h8v-6" /></>,
    <><rect className="ua-forme" x="19" y="6" width="26" height="52" rx="5" /><path className="ua-detail" d="m34 20-6 10h8l-6 10" /><path className="ua-trait" d="M28 51h8" /></>,
  ];
  return <span className="universe-art"><svg viewBox="0 0 64 64" width="64" height="64" fill="none" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{formes[index]}</svg></span>;
}

export function MarketplaceUniverses({ lang }: { lang: Lang }) {
  return <section className="marketplace-universes mx-auto max-w-6xl px-5 py-7" aria-labelledby="shop-universes">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 id="shop-universes" className="text-xl font-bold">{t(lang, "universe.heading")}</h2><Link href="/categories" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t(lang, "directory.title")}</Link></div>
    <div className="universe-grid">
      {(Object.keys(CATALOGUE_UNIVERSES) as CatalogueUniverse[]).map((key, index) => <Link key={key} href={universeHref(key)} className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <UniverseArt index={index} />
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, CATALOGUE_UNIVERSES[key].title)}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, CATALOGUE_UNIVERSES[key].description)}</span>
      </Link>)}
      <Link href="/recharges" className="group flex flex-col bg-ink p-4 sm:p-5 transition hover:bg-surface-neutral">
        <UniverseArt index={3} />
        <span className="flex items-center justify-between gap-3 text-sm font-bold sm:text-base">{t(lang, "universe.recharges")}<span aria-hidden="true" className="transition group-hover:translate-x-1">↗</span></span>
        <span className="mt-2 text-xs leading-relaxed sm:text-sm text-mist">{t(lang, "universe.recharges.body")}</span>
        {!isTopupFirstPartyEnabled() && <span className="mt-4 text-xs font-semibold text-mist">{t(lang, "availability.topup.paused")}</span>}
      </Link>
    </div>
  </section>;
}
