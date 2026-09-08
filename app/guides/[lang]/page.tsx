import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { BUYING_GUIDES, guideHref } from "@/lib/buying-guides";
import { t, isLang, LANGS } from "@/lib/i18n";
import { siteUrl } from "@/lib/site-url";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const title = t(lang, "guides.title"); const description = t(lang, "guides.intro");
  const canonical = guideHref(lang);
  return { title, description, alternates: { canonical, languages: { ...Object.fromEntries(LANGS.map((l) => [l, `${siteUrl()}${guideHref(l)}`])), "x-default": `${siteUrl()}${guideHref("fr")}` } }, openGraph: { title, description, url: canonical }, twitter: { card: "summary_large_image" as const, title, description } };
}
export default async function GuidesPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <div className="min-h-dvh bg-grain"><SiteNav /><main id="main" className="mx-auto max-w-6xl px-5 py-10">
    <nav aria-label={t(lang, "nav.breadcrumb")} className="text-sm text-mist"><Link href="/" className="underline">{t(lang, "nav.home")}</Link></nav>
    <h1 className="mt-5 max-w-3xl text-3xl font-extrabold tracking-tight sm:text-4xl">{t(lang, "guides.title")}</h1>
    <p className="mt-4 max-w-3xl text-base leading-7 text-mist">{t(lang, "guides.intro")}</p>
    <div className="mt-8 grid gap-5 md:grid-cols-3">{BUYING_GUIDES.map((guide) => <Link key={guide.slug} href={guideHref(lang, guide.slug)} className="rounded-2xl border border-line bg-surface p-6 hover:border-accent">
      <h2 className="text-xl font-bold">{t(lang, guide.title)}</h2><p className="mt-4 text-base leading-7 text-mist">{t(lang, guide.intro)}</p>
    </Link>)}</div>
  </main><SiteFooter /></div>;
}
