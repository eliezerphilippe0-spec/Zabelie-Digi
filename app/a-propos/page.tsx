import { editorialAlternates } from "@/lib/editorial-routing";
import Image from "next/image";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function generateMetadata() {
  const lang = await getLang();
  return {
    title: t(lang, "about.title"),
    description: t(lang, "about.intro"),
    alternates: editorialAlternates("/a-propos", lang),
  };
}

export default async function AboutPage() {
  const lang = await getLang();
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t(lang, "about.title")}</h1>
        <p className="mt-4 max-w-2xl leading-relaxed text-mist">{t(lang, "about.intro")}</p>
        <section aria-labelledby="fondateur" className="mt-10 grid items-center gap-6 border-y border-line py-8 sm:grid-cols-[240px_1fr] sm:gap-10">
          <Image
            src="/brand/eliezer-portrait.jpg"
            alt={t(lang, "founder.name")}
            width={900}
            height={1200}
            sizes="240px"
            className="h-auto w-60 max-w-full rounded-2xl"
          />
          <div>
            <h2 id="fondateur" className="text-2xl font-bold tracking-tight">{t(lang, "founder.name")}</h2>
            <p className="mt-2 text-sm text-mist">{t(lang, "founder.role")}</p>
            <blockquote className="mt-6 text-xl leading-relaxed text-cloud">« {t(lang, "founder.quote")} »</blockquote>
          </div>
        </section>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/catalogue" className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-on-brand">
            {t(lang, "nav.catalog")}
          </Link>
          <Link href="/aide" className="inline-flex min-h-11 items-center text-sm text-mist underline underline-offset-4 hover:text-cloud">
            {t(lang, "nav.help")}
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
