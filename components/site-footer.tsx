import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { POLICY_PATH } from "@/lib/policy";
import { getMenuRayons } from "@/lib/taxonomy";

export async function SiteFooter() {
  const lang = await getLang();
  // Mémoïsé par requête (React cache) : c'est la même lecture que l'en-tête.
  const rayons = await getMenuRayons(lang);

  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <BrandLogo />
          <p className="mt-3 text-sm text-mist">{t(lang, "footer.tagline")}</p>
        </div>

        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-4">
          {rayons.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="font-semibold text-cloud">{t(lang, "search.sugg")}</p>
              {rayons.map((r) =>
                r.vide ? (
                  // Même règle que le menu (décision porteur 2026-08-02) : un
                  // rayon désert n'est pas un lien, il est marqué.
                  <span key={r.slug} className="text-mist">
                    {r.label} <span className="text-xs">{t(lang, "menu.empty")}</span>
                  </span>
                ) : (
                  <Link key={r.slug} href={r.href} className="text-mist hover:text-cloud">
                    {r.label}
                  </Link>
                )
              )}
            </div>
          )}
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
            <span className="text-mist">{t(lang, "footer.natcash")}</span>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.help")}</p>
            <Link href="/aide" className="text-mist hover:text-cloud">
              {t(lang, "nav.help")}
            </Link>
            <Link href="/aide#faq" className="text-mist hover:text-cloud">
              {t(lang, "sec.faq")}
            </Link>
            <Link href="/mes-achats" className="text-mist hover:text-cloud">
              {t(lang, "pay.ok.cta")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.legal")}</p>
            <Link
              href="/confidentialite"
              className="text-mist hover:text-cloud"
            >
              {t(lang, "footer.privacy")}
            </Link>
            <Link href="/conditions" className="text-mist hover:text-cloud">
              {t(lang, "footer.terms")}
            </Link>
            <Link href={POLICY_PATH} className="text-mist hover:text-cloud">
              {t(lang, "policy.link")}
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
