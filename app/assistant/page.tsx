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
import { isSupabaseConfigured } from "@/lib/products";
import { getZonesActives, libelleZone } from "@/lib/zones";
import { lireZoneAcheteur } from "@/lib/zone-acheteur-serveur";
import { paramsCatalogue, texteLieu } from "@/lib/zone-acheteur";
import { maZoneLabels } from "@/lib/ma-zone-labels";
import { MaZone } from "@/components/ma-zone";

export const dynamic = "force-dynamic";
/** Titre d'onglet propre : la page portait celui de l'accueil (audit du 2026-10-29). */
export async function generateMetadata() {
  const lang = await getLang();
  return { title: SHOPPING_COPY[lang].title, robots: { index: false, follow: true } };
}

export default async function AssistantPage({ searchParams }: { searchParams: Promise<{ vendeur?: string }> }) {
  const [params, lang] = await Promise.all([searchParams, getLang()]);
  const labels = SHOPPING_COPY[lang];
  const sellerId = params.vendeur;
  if (sellerId && !z.string().uuid().safeParse(sellerId).success) notFound();
  const seller = sellerId ? await getCreator(sellerId) : null;
  if (sellerId && !seller) notFound();
  /* La zone que l'acheteur a mémorisée (cookie `zabelie_zone`, docs/77 §11) : sa localité est alors préremplie — visible et modifiable. */
  const zones = isSupabaseConfigured() ? await getZonesActives() : [];
  const maZone = zones.length ? await lireZoneAcheteur(zones) : null;
  return <div className="bg-grain min-h-dvh">
    <SiteNav />
    <main id="main" className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-extrabold tracking-tight">{seller ? labels.sellerTitle : labels.title}</h1>
      {seller ? <p className="mt-3 font-semibold text-accent">{seller.displayName}</p> : null}
      <p className="mb-8 mt-4 max-w-prose text-mist">{labels.intro}</p>
      {zones.length ? <div className="mb-8"><MaZone labels={maZoneLabels(lang)}
        zones={zones.map(z => ({ id: z.id, parent_id: z.parent_id, level: z.level, label: libelleZone(z, lang) }))}
        courante={maZone ? { id: maZone.id, label: libelleZone(maZone, lang) } : null}
        hrefCatalogue={maZone ? `/catalogue?${paramsCatalogue(zones, maZone)}` : undefined} /></div> : null}
      <ShoppingAssistant key={maZone?.id ?? "aucune"} defaultLocation={maZone ? texteLieu(zones, maZone, lang) : ""} lang={lang} labels={labels} sellerId={sellerId} kindOptions={PRODUCT_KINDS.flatMap(value => { const key = cardKindLabelKey(value); return key ? [{ value, label: t(lang, key) }] : []; })} conversational={Boolean(aiProviderDisponible())} />
    </main>
    <SiteFooter />
  </div>;
}
