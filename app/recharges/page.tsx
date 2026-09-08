import { editorialAlternates } from "@/lib/editorial-routing";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { isTopupFirstPartyEnabled } from "@/lib/topup-flag";

export async function generateMetadata() {
  const lang = await getLang();
  return { title: t(lang, "recharges.title"), description: t(lang, "recharges.intro"), alternates: editorialAlternates("/recharges", lang) };
}

export default async function RechargesPage() {
  const lang = await getLang();
  const enabled = isTopupFirstPartyEnabled();
  return <div className="bg-grain min-h-dvh">
    <SiteNav activeHref="/recharges" />
    <main id="main" className="mx-auto max-w-6xl px-5 py-8">
      <nav aria-label={t(lang, "nav.breadcrumb")} className="mb-5 flex items-center gap-2 text-sm text-mist">
        <Link href="/" className="underline underline-offset-4">{t(lang, "nav.home")}</Link><span aria-hidden="true">/</span><span aria-current="page">{t(lang, "universe.recharges")}</span>
      </nav>
      <h1 className="text-3xl font-extrabold sm:text-4xl">{t(lang, "recharges.title")}</h1>
      <p className="mt-3 max-w-2xl text-mist">{t(lang, "recharges.intro")}</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-ink p-6 sm:p-8">
          <h2 className="text-2xl">{t(lang, "recharges.phone")}</h2>
          <p className="mt-3 text-mist">{t(lang, "recharges.phone.body")}</p>
          <p className="mt-6 font-semibold">{t(lang, enabled ? "recharges.enabled" : "recharges.paused")}</p>
          {enabled ? <Link href="/rechaj" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand">{t(lang, "recharges.open")}</Link> : <>
            <p className="mt-2 text-sm leading-relaxed text-mist">{t(lang, "recharges.paused.body")}</p>
            <Link href="/catalogue" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-3 font-semibold text-on-brand">{t(lang, "nav.catalog")}</Link>
          </>}
        </section>
        <div className="divide-y divide-line">
          <section className="pb-7">
            <h2 className="text-xl">{t(lang, "recharges.wallet")}</h2>
            <p className="mt-3 leading-relaxed text-mist">{t(lang, "recharges.wallet.body")}</p>
          </section>
          <section className="pt-7">
            <h2 className="text-xl">{t(lang, "recharges.pay")}</h2>
            <p className="mt-3 leading-relaxed text-mist">{t(lang, "recharges.pay.body")}</p>
            <Link href="/aide#comment" className="mt-3 inline-flex min-h-11 items-center underline underline-offset-4">{t(lang, "recharges.help")}</Link>
          </section>
        </div>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
