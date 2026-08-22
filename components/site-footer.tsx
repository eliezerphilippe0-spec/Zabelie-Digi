import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { POLICY_PATH } from "@/lib/policy";

export async function SiteFooter() {
  const lang = await getLang();

  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <BrandLogo />
          <p className="mt-3 text-sm text-mist">{t(lang, "footer.tagline")}</p>
        </div>

        {/* ⚠️ LA COLONNE DES RAYONS A ÉTÉ RETIRÉE — demande porteur du
            2026-08-22 (« enlève la section des catégories au bas du site »).
            Elle listait TOUS les rayons ouverts, sur TOUTES les pages, et
            c'était sa troisième occurrence : le menu de l'en-tête, la colonne
            de gauche de l'accueil et la grille `#kategori` la portent déjà.

            Ce qui part avec elle : l'appel `getMenuRayons(lang)` du pied de
            page. Il était mémoïsé par requête (React cache) et partagé avec
            l'en-tête — le retirer ne fait donc économiser aucune requête, et
            le prétendre serait faux. Le gain est de place à l'écran, pas de
            performance ; c'est sur mobile qu'il compte, où ces liens
            poussaient les mentions légales très bas.

            La grille est passée de quatre colonnes à trois : à quatre, les
            cinq blocs restants laissaient une case vide en bout de rangée. */}
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.explore")}</p>
            <Link href="/catalogue" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "nav.catalog")}
            </Link>
            <Link href="/#talents" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "nav.talents")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.sell")}</p>
            <Link href="/vendre" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "footer.become")}
            </Link>
            <Link href="/#comment" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
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
            <Link href="/aide" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "nav.help")}
            </Link>
            <Link href="/aide#faq" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "sec.faq")}
            </Link>
            <Link href="/mes-achats" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "pay.ok.cta")}
            </Link>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-cloud">{t(lang, "footer.legal")}</p>
            <Link
              href="/confidentialite"
              className="inline-flex min-h-11 items-center text-mist hover:text-cloud"
            >
              {t(lang, "footer.privacy")}
            </Link>
            <Link href="/conditions" className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
              {t(lang, "footer.terms")}
            </Link>
            <Link href={POLICY_PATH} className="inline-flex min-h-11 items-center text-mist hover:text-cloud">
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
