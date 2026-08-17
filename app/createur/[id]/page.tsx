import { notFound } from "next/navigation";
import { getCreator } from "@/lib/creators";
import { getLang } from "@/lib/i18n-server";
import { BoutiqueVue } from "@/components/boutique-vue";
import { hrefBoutique } from "@/lib/boutique-href";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const creator = await getCreator(id);
  return {
    title: creator ? `${creator.displayName} — Zabelie` : "Créateur — Zabelie",
    // L'adresse lisible est la CANONIQUE dès qu'elle existe : sans ça, les
    // deux URL se feraient concurrence dans l'index des moteurs.
    alternates: creator?.boutikSlug
      ? { canonical: `/boutik/${creator.boutikSlug}` }
      : undefined,
  };
}

export default async function CreatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [creator, lang] = await Promise.all([getCreator(id), getLang()]);
  if (!creator) notFound();
  return (
    <BoutiqueVue
      creator={creator}
      lang={lang}
      partageHref={hrefBoutique(creator)}
    />
  );
}
