import Link from "next/link";
import { offerHref, type PublicOffer } from "@/lib/product-offers";
import type { OfferCopy } from "@/lib/product-offer-copy";
import { formatHTG } from "@/lib/sample-data";
import { isTrackedStockKind } from "@/lib/product-kind";
export function ProductOffers({ offers, copy, afterPurchase = false }: { offers: PublicOffer[]; copy: OfferCopy; afterPurchase?: boolean }) {
  const visible = afterPurchase ? offers.filter(o => o.offer_kind === "cross_sell") : offers;
  if (!visible.length) return null;
  const card = (offer: PublicOffer) => <article key={offer.id} className="rounded-xl border border-line bg-surface p-4">
    <p className="text-xs font-semibold text-accent">{copy[offer.offer_kind]}</p>
    <h3 className="mt-1 break-words text-base font-semibold text-cloud">{offer.title}</h3>
    <p className="numeric mt-2 font-bold">{isTrackedStockKind(offer.product_kind) ? copy.from + " " : ""}{formatHTG(offer.price_htg)}</p>
    <p className="mt-2 text-sm text-mist">{offer.offer_kind === "cross_sell" ? copy.separate : copy.replacement}</p>
    <Link prefetch={false} href={offerHref(offer)} className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-accent underline underline-offset-4">{copy.view}</Link>
  </article>;
  return <section aria-label={afterPurchase ? copy.after : copy.buyerTitle} className="mt-6 space-y-3 text-left">
    <h2 className="text-lg font-semibold">{afterPurchase ? copy.after : copy.buyerTitle}</h2>
    {visible.filter(o => o.offer_kind !== "downsell").map(card)}
    {visible.filter(o => o.offer_kind === "downsell").map(offer => <details key={offer.id} className="rounded-xl border border-line p-3">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-cloud">{copy.cheaper}</summary>
      {card(offer)}
    </details>)}
  </section>;
}
