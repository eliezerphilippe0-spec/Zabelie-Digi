import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function SiteFooter() {
  const lang = await getLang();

  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <BrandLogo />
          <p className="mt-3 text-sm text-mist">{t(lang, "footer.tagline")}</p>
        </div>

        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-4">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.explore")}</p>
            <Link href="/catalogue" className="text-mist hover:text-cloud">
              {t(lang, "nav.catalog")}
            </Link>
            <Link href="/#talents" className="text-mist hover:text-cloud">
              {t(lang, "nav.talents")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.sell")}</p>
            <Link href="/vendre" className="text-mist hover:text-cloud">
              {t(lang, "footer.become")}
            </Link>
            <Link href="/#comment" className="text-mist hover:text-cloud">
              {t(lang, "nav.how")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.payment")}</p>
            <span className="text-mist">MonCash</span>
            <span className="text-mist">Zelle (USD)</span>
            <span className="text-mist/50">{t(lang, "footer.natcash")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.help")}</p>
            <Link href="/#faq" className="text-mist hover:text-cloud">
              {t(lang, "sec.faq")}
            </Link>
            <Link href="/rechaj" className="text-mist hover:text-cloud">
              {t(lang, "nav.topup")}
            </Link>
            <Link href="/mes-achats" className="text-mist hover:text-cloud">
              {t(lang, "pay.ok.cta")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">Légal</p>
            <Link
              href="/confidentialite"
              className="text-mist hover:text-cloud"
            >
              Confidentialité
            </Link>
          </div>
        </div>
      </div>
      <div className="border-t border-line py-5 text-center text-xs text-mist">
        © {new Date().getFullYear()} Zabelie. {t(lang, "footer.rights")}
      </div>
    </footer>
  );
}
