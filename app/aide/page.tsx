import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { FaqList } from "@/components/faq-list";
import { whatsappHref } from "@/lib/whatsapp";
import { MetricA } from "@/components/metric-a";
import { POLICY_PATH } from "@/lib/policy";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = {
  title: "Aide — Zabelie",
};

/**
 * /aide — le point d'entrée « un humain peut m'aider ».
 *
 * Trois blocs, dans l'ordre où on en a besoin : contacter quelqu'un
 * (WhatsApp, email), les questions fréquentes (la même FAQ que l'accueil,
 * composant partagé), les pages légales existantes.
 *
 * Les deux cartes de contact sont pilotées par l'environnement
 * (`NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_CONTACT_EMAIL`) et se
 * masquent si la valeur n'est pas posée : un canal de contact affiché qui
 * n'aboutit nulle part est pire que son absence. Aucune promesse de délai de
 * réponse — personne ne l'a mesurée.
 */
export default async function AidePage() {
  const lang = await getLang();
  const wa = whatsappHref(t(lang, "wa.prefill"));
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />

      <section className="mx-auto max-w-2xl px-5 pb-16 pt-12">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t(lang, "aide.title")}
        </h1>
        <p className="mt-2 text-sm text-mist">{t(lang, "aide.sub")}</p>

        {(wa || email) && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {wa && (
              <MetricA
                event="whatsapp_clicked"
                href={wa}
                className="rounded-2xl border border-line bg-surface/40 p-5 transition hover:border-brand/60"
              >
                <p className="font-semibold text-cloud">{t(lang, "wa.chat")}</p>
                <p className="mt-1 text-sm text-mist">{t(lang, "rail.wa.b")}</p>
              </MetricA>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="rounded-2xl border border-line bg-surface/40 p-5 transition hover:border-brand/60"
              >
                <p className="font-semibold text-cloud">{t(lang, "aide.email")}</p>
                <p className="mt-1 break-all text-sm text-mist">{email}</p>
              </a>
            )}
          </div>
        )}

        {/* COMMENT ACHETER — les trois pas que l'accueil portait jusqu'au
            2026-09-04 (accueil premium §4.6) : l'accueil n'en garde qu'un
            lien (`/aide#comment`), les étapes vivent ici, où l'on vient
            pour comprendre. Les pas vendeur sont sur /vendre#comment. */}
        <h2 id="comment" className="mt-12 scroll-mt-24 text-2xl font-bold tracking-tight">
          {t(lang, "home.how.buy")}
        </h2>
        <ol className="mt-4 grid gap-3">
          {(
            [
              ["home.b1.t", "home.b1.b"],
              ["home.b2.t", "home.b2.b"],
              ["home.b3.t", "home.b3.b"],
            ] as const
          ).map(([tt, bb]) => (
            <li key={tt} className="rounded-2xl border border-line bg-surface/40 p-5">
              <h3 className="text-base font-semibold">{t(lang, tt)}</h3>
              <p className="mt-1 text-sm text-mist">{t(lang, bb)}</p>
            </li>
          ))}
        </ol>

        <h2 id="faq" className="mt-12 scroll-mt-24 text-2xl font-bold tracking-tight">
          {t(lang, "sec.faq")}
        </h2>
        <div className="mt-6">
          <FaqList lang={lang} />
        </div>

        <h2 className="mt-12 text-2xl font-bold tracking-tight">
          {t(lang, "aide.legal")}
        </h2>
        <div className="mt-4 flex flex-col gap-2 text-sm">
          <Link
            href="/confidentialite"
            className="inline-flex min-h-11 items-center text-mist underline hover:text-cloud"
          >
            {t(lang, "footer.privacy")}
          </Link>
          <Link
            href={POLICY_PATH}
            className="inline-flex min-h-11 items-center text-mist underline hover:text-cloud"
          >
            {t(lang, "policy.link")}
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
