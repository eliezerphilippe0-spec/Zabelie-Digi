import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { SignOutButton } from "@/components/sign-out-button";
import { LangToggle } from "@/components/lang-toggle";
import { getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export async function SiteNav() {
  const [user, lang] = await Promise.all([getCurrentUser(), getLang()]);

  return (
    <header className="sticky top-0 z-50">
      <div className="mx-auto mt-4 max-w-6xl rounded-2xl glass px-5 py-3">
        <div className="flex items-center justify-between">
        <BrandLogo />

        <nav className="hidden items-center gap-7 text-sm text-mist md:flex">
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
        <nav className="mt-3 flex items-center justify-center gap-6 border-t border-line pt-3 text-sm text-mist md:hidden">
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
