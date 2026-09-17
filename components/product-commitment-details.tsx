import { nextAvailabilityIsCurrent, availabilityNeedsReview, type ProductCommitment } from "@/lib/product-commitments";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

export function ProductCommitmentDetails({ value, labels, locale, href = "#contacter-vendeur" }: { value?: ProductCommitment; labels: MarketplaceCopy; locale: string; href?: string }) {
  return <section className="mt-4 rounded-xl border border-line p-4 text-sm">
    <h2 className="font-semibold">{labels.delivery}</h2>
    {!value && <p className="mt-2 text-mist">{labels.missing}</p>}
    {value && <dl className="mt-3 space-y-2">
      {value.zones && <div><dt className="text-mist">{labels.zones}</dt><dd className="break-words">{value.zones}</dd></div>}
      {value.pickup && <div><dt className="text-mist">{labels.pickup}</dt><dd className="break-words">{value.pickup}</dd></div>}
      {value.delivery_days !== null && <div><dt className="text-mist">{labels.days}</dt><dd>{value.delivery_days}</dd></div>}
      <div><dt className="text-mist">{labels.fees}</dt><dd>{value.fees === "included" ? labels.included : labels.quote}</dd></div>
      {value.next_available && nextAvailabilityIsCurrent(value.next_available) && <div><dt className="text-mist">{labels.next}</dt><dd>{new Date(value.next_available + "T12:00:00Z").toLocaleDateString(locale)}</dd></div>}
    </dl>}
    <p className="mt-3 text-xs text-mist">{value?.availability_confirmed_at ? `${labels.confirmed} ${new Date(value.availability_confirmed_at).toLocaleDateString(locale)}` : labels.unknown}</p>
    {value?.availability_confirmed_at && availabilityNeedsReview(value.availability_confirmed_at) && <p className="mt-2 text-xs text-warning-text">{labels.unknown}</p>}
    <a href={href} className="mt-2 inline-flex min-h-11 items-center underline">{labels.ask}</a>
  </section>;
}
