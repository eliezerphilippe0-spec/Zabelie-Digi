import { notFound } from "next/navigation";
import { getCreatorBySlug } from "@/lib/creators";
import { getLang } from "@/lib/i18n-server";
import { BoutiqueVue } from "@/components/boutique-vue";
import { slugValide } from "@/lib/boutik-slug";

export const dynamic = "force-dynamic";

/**
 * L'ADRESSE QU'ON PARTAGE — `zabelie.com/boutik/mari-jakmel`.
 *
 * `/createur/<id>` continue de répondre : les liens déjà en circulation ne
 * cassent pas, et un profil sans slug (nom illisible, `0083` pas encore
 * appliquée) n'a que celui-là. C'est la raison d'être de `hrefBoutique` —
 * une seule fonction décide laquelle des deux on propose.
 *
 * Tant que `0083` n'est pas appliquée, cette route rend 404 : la colonne
 * n'existe pas, donc l'adresse n'existe pas. C'est la vérité, et c'est
 * préférable à une correspondance devinée.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const creator = slugValide(slug) ? await getCreatorBySlug(slug) : null;
  return {
    title: creator ? `${creator.displayName} — Zabelie` : "Boutik — Zabelie",
  };
}

export default async function BoutikPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  /* On ne consulte la base que pour une forme qu'on sait valide : une URL
     retapée n'a pas à devenir une requête. */
  if (!slugValide(slug)) notFound();

  const [creator, lang] = await Promise.all([getCreatorBySlug(slug), getLang()]);
  if (!creator) notFound();

  return (
    <BoutiqueVue creator={creator} lang={lang} partageHref={`/boutik/${slug}`} />
  );
}
