import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const metadata = { title: "Paiement réussi — Zabelie" };

export default async function SuccesPage({
  searchParams,
}: {
  searchParams: Promise<{ commande?: string }>;
}) {
  const [{ commande }, lang] = await Promise.all([searchParams, getLang()]);
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-2xl text-ink">
          ✓
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{t(lang, "pay.ok.title")}</h1>
        <p className="mt-3 text-mist">
          {t(lang, "pay.ok.body")}
        </p>
        {commande && (
          <p className="mt-2 text-xs text-mist">
            {t(lang, "pay.order")} #{commande.slice(0, 8)}
          </p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          <Link
            href="/mes-achats"
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
          >
            {t(lang, "pay.ok.cta")}
          </Link>
          <Link href="/catalogue" className="text-sm text-mist hover:text-cloud">
            {t(lang, "pay.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
