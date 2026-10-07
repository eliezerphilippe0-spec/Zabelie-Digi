import { notFound } from "next/navigation";
import { z } from "zod";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ShoppingAssistant } from "@/components/shopping-assistant";
import { PRODUCT_KINDS, cardKindLabelKey } from "@/lib/product-kind";
import { t } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";
import { SHOPPING_COPY } from "@/lib/shopping-ai-copy";
import { aiProviderDisponible } from "@/lib/ai-description";
import { getCreator } from "@/lib/creators";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: true } };

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ vendeur?: string }> }) {
  const [params, lang] = await Promise.all([searchParams, getLang()]);
  const labels = SHOPPING_COPY[lang];
  const sellerId = params.vendeur;
  if (sellerId && !z.string().uuid().safeParse(sellerId).success) notFound();
  const seller = sellerId ? await getCreator(sellerId) : null;
  if (sellerId && !seller) notFound();
  return <div className="bg-grain min-h-dvh">
    <SiteNav />
    <main id="main" className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{seller ? labels.sellerTitle : labels.title}</h1>
      {seller ? <p className="mt-3 font-semibold text-accent">{seller.displayName}</p> : null}
      <p className="mb-8 mt-4 max-w-prose text-mist">{labels.intro}</p>
      <ShoppingAssistant lang={lang} labels={labels} sellerId={sellerId} kindOptions={PRODUCT_KINDS.flatMap(value => { const key = cardKindLabelKey(value); return key ? [{ value, label: t(lang, key) }] : []; })} conversational={Boolean(aiProviderDisponible())} />
    </main>
    <SiteFooter />
  </div>;
}
