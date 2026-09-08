import { t, type Lang } from "@/lib/i18n";
import type { OrderRecipient } from "@/lib/order-recipient";
export function RecipientDetails({ recipient, lang }: { recipient: OrderRecipient; lang: Lang }) {
  return <section className="my-3 rounded-xl border border-line p-4 text-sm">
    <h3 className="font-semibold">{t(lang, "recipient.title")}</h3>
    <p className="mt-2 break-words">{recipient.full_name}</p>
    <a className="inline-flex min-h-11 items-center underline" href={`tel:+509${recipient.phone}`}>+509 {recipient.phone}</a>
    <p className="break-words">{recipient.locality}</p>
    {recipient.note && <p className="mt-2 whitespace-pre-line break-words text-mist">{recipient.note}</p>}
    <p className="mt-3 text-xs text-mist">{t(lang, "recipient.authority")}</p>
  </section>;
}
