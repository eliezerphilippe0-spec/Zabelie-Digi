import Link from "next/link";
import { t, type Lang } from "@/lib/i18n";
import { getMonCashAvailability, MONCASH_AVAILABILITY_LABELS } from "@/lib/payment-availability";

export function MarketplaceStatus({ lang }: { lang: Lang }) {
  const status = getMonCashAvailability();
  if (status === "production") return null;
  /* Une ligne, sous la confiance (audit du 2026-10-17) : la limite reste dite
   * sur l'accueil, mais elle ne précède plus la promesse. Même contenu
   * qu'avant, même lien vers le détail. */
  return <aside data-marketplace-status={status} className="mx-auto max-w-6xl px-5 pt-2">
    <p className="flex flex-wrap items-center gap-x-2 text-xs text-mist">
      <span><span className="font-semibold text-cloud">{t(lang, "availability.opening")}</span> · {t(lang, MONCASH_AVAILABILITY_LABELS[status])}</span>
      <Link href="/recharges#paiements" className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4">{t(lang, "availability.details")}</Link>
    </p>
  </aside>;
}
