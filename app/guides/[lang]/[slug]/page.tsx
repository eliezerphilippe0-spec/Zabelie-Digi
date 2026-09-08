import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { BUYING_GUIDES, guideHref } from "@/lib/buying-guides";
import { t, isLang, LANGS } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
async function resolve(params: Promise<{ lang: string; slug: string }>) {
  const { lang, slug } = await params;
  const guide = BUYING_GUIDES.find((entry) => entry.slug === slug);
  if (!isLang(lang) || !guide) notFound();
  return { lang, guide };
}
export async function generateMetadata({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, guide } = await resolve(params);
  const title = `${t(lang, guide.title)} — Zabelie`;
  const description = t(lang, guide.intro);
  const canonical = guideHref(lang, guide.slug);
  return { title, description, alternates: { canonical, languages: { ...Object.fromEntries(LANGS.map((l) => [l, `${siteUrl()}${guideHref(l, guide.slug)}`])), "x-default": `${siteUrl()}${guideHref("fr", guide.slug)}` } }, openGraph: { title, description, url: canonical, type: "article" as const }, twitter: { card: "summary_large_image" as const, title, description } };
}
export default async function BuyingGuidePage({ params }: { params: Promise<{ lang: string; slug: string }> }) {
  const { lang, guide } = await resolve(params);
  const url = `${siteUrl()}${guideHref(lang, guide.slug)}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "WebPage", name: t(lang, guide.title), description: t(lang, guide.intro), url, inLanguage: lang, isPartOf: { "@type": "WebSite", name: "Zabelie", url: siteUrl() } };
  return <div className="min-h-dvh bg-grain"><SiteNav /><main id="main" className="mx-auto max-w-6xl px-5 py-10">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    <nav aria-label={t(lang, "nav.breadcrumb")} className="flex flex-wrap gap-2 text-sm text-mist"><Link href="/" className="underline">{t(lang, "nav.home")}</Link><span aria-hidden="true">/</span><Link href={guideHref(lang)} className="underline">{t(lang, "guides.title")}</Link></nav>
    <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
      <article lang={lang} className="max-w-3xl">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t(lang, guide.title)}</h1>
        <p className="mt-5 text-lg leading-8 text-mist">{t(lang, guide.intro)}</p>
        {guide.sections.map((section) => <section key={section.title} className="mt-8 border-t border-line pt-6"><h2 className="text-xl font-bold">{t(lang, section.title)}</h2><p className="mt-3 text-base leading-7 text-mist">{t(lang, section.body)}</p></section>)}
      </article>
      <aside className="rounded-2xl border border-line bg-surface p-5 lg:sticky lg:top-28">
        <h2 className="font-bold">{t(lang, "guides.related")}</h2>
        <Link href={guide.catalogue} className="mt-4 flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand">{t(lang, "nav.catalog")}</Link>
        <Link href="/mes-achats" className="mt-3 flex min-h-11 items-center text-sm underline">{t(lang, "purchases.title")}</Link>
        <Link href="/aide" className="flex min-h-11 items-center text-sm underline">{t(lang, "nav.help")}</Link>
        <nav aria-label={t(lang, "guides.languages")} className="mt-4 flex flex-wrap gap-3 border-t border-line pt-4">{LANGS.map((l) => <Link key={l} href={guideHref(l, guide.slug)} hrefLang={l} lang={l} aria-current={l === lang ? "page" : undefined} className="inline-flex min-h-11 items-center text-sm underline">{l.toUpperCase()}</Link>)}</nav>
      </aside>
    </div>
  </main><SiteFooter /></div>;
}
