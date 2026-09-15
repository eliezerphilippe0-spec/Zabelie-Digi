import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { getMonCashAvailability, MONCASH_AVAILABILITY_LABELS } from "@/lib/payment-availability";

export function MarketplaceStatus({ lang }: { lang: Lang }) {
  const status = getMonCashAvailability();
  if (status === "production") return null;
  return <aside data-marketplace-status={status} className="mx-auto max-w-6xl px-3 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm">
      <div><p className="font-semibold">{t(lang, "availability.opening")}</p>
        <p className="mt-1 text-mist">{t(lang, MONCASH_AVAILABILITY_LABELS[status])}</p></div>
      <Link href="/recharges#paiements" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{t(lang, "availability.details")}</Link>
    </div>
  </aside>;
}
