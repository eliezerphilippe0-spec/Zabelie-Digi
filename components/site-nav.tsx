import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { LangToggle } from "@/components/lang-toggle";
import { CategoryMenu } from "@/components/category-menu";
import { getMenuRayons } from "@/lib/taxonomy";
import { getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function SiteNav() {
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);
  // Le menu vient de la BASE (`zabelie_categories`), jamais d'une liste écrite
  // en dur : c'est exactement ce que le constat UX-01 de la revue reprochait à
  // l'ancienne barre `PRODUCT_CATEGORIES`, dont les libellés sont des valeurs
  // stockées et donc intraduisibles.
  const rayons = await getMenuRayons(lang);
  const menuLabels = {
    title: t(lang, "menu.rayons"),
    empty: t(lang, "menu.empty"),
    all: t(lang, "menu.all"),
  };

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl rounded-2xl glass px-5 py-3">
        <div className="flex items-center justify-between">
        <BrandLogo />

        <nav className="hidden items-center gap-7 text-sm text-mist md:flex">
          <CategoryMenu rayons={rayons} labels={menuLabels} />
          <Link href="/catalogue" className="transition hover:text-cloud">
            {t(lang, "nav.catalog")}
          </Link>
          <Link href="/#talents" className="transition hover:text-cloud">
            {t(lang, "nav.talents")}
          </Link>
          <Link href="/#comment" className="transition hover:text-cloud">
            {t(lang, "nav.how")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <LangToggle current={lang} />
          {user ? (
            <>
              {user.role === "admin" && (
                <Link
                  href="/admin"
                  className="hidden text-sm text-mist transition hover:text-cloud sm:block"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/tableau-de-bord"
                className="hidden text-sm text-mist transition hover:text-cloud sm:block"
              >
                {t(lang, "nav.dashboard")}
              </Link>
              <Link
                href="/pro"
                className="hidden text-sm text-mist transition hover:text-cloud sm:block"
              >
                {t(lang, "nav.pro")}
              </Link>
              <SignOutButton className="hidden text-sm text-mist transition hover:text-cloud sm:block" />
              <Link
                href="/vendre"
                className="rounded-xl bg-cloud px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                {t(lang, "nav.sell")}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/connexion"
                className="hidden text-sm text-mist transition hover:text-cloud sm:block"
              >
                {t(lang, "nav.login")}
              </Link>
              <Link
                href="/vendre"
                className="rounded-xl bg-cloud px-4 py-2 text-sm font-semibold text-ink transition hover:opacity-90"
              >
                {t(lang, "nav.sell")}
              </Link>
            </>
          )}
        </div>
        </div>

        {/* BL-104 (FRONT-16) : sous 768 px la nav md était MASQUÉE sans repli —
            Catalogue et Recharge devenaient inaccessibles depuis le header sur
            le terrain principal (Android). Repli en liens simples : 0 KB de JS,
            fonctionne sans hydratation sur bas de gamme (pattern Amazon mobile :
            les destinations vitales restent visibles). */}
        {/* Mobile : le menu des rayons ouvre en premier — c'est le geste de la
            maquette porteur, et le catalogue reste atteignable juste après. */}
        <div className="mt-3 flex justify-center border-t border-line pt-3 md:hidden">
          <CategoryMenu rayons={rayons} labels={menuLabels} />
        </div>
        <nav className="flex items-center justify-center gap-6 pb-1 text-sm text-mist md:hidden">
          <Link href="/catalogue" className="py-1 transition hover:text-cloud">
            {t(lang, "nav.catalog")}
          </Link>
          <Link href="/#talents" className="py-1 transition hover:text-cloud">
            {t(lang, "nav.talents")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
