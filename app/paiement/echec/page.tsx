import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = { title: "Paiement échoué — Zabelie" };

export default async function EchecPage({
  searchParams,
}: {
  searchParams: Promise<{ raison?: string; produit?: string }>;
}) {
  const [{ raison, produit }, lang] = await Promise.all([
    searchParams,
    getLang(),
  ]);
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger text-2xl text-ink">
          ✕
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{t(lang, "pay.fail.title")}</h1>
        <p className="mt-3 text-mist">
          {t(lang, "pay.fail.body")}
        </p>
        {raison && <p className="mt-2 text-xs text-mist">{t(lang, "pay.fail.code")} {raison}</p>}
        {/* BL-111 (Stripe Checkout — « Try again » préserve l'intention) : le
            CTA primaire ramène au produit ; MonCash échoue souvent pour solde
            insuffisant → on le dit. Le catalogue devient secondaire. */}
        {produit && (
          <p className="mt-2 text-xs text-mist">{t(lang, "pay.checkBalance")}</p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          {produit && (
            <Link
              href={`/produit/${encodeURIComponent(produit)}#acheter`}
              className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
            >
              {t(lang, "pay.retry")}
            </Link>
          )}
          <Link
            href="/catalogue"
            className={
              produit
                ? "rounded-xl border border-line px-6 py-3 text-sm font-semibold text-cloud"
                : "rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
            }
          >
            {t(lang, "pay.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
