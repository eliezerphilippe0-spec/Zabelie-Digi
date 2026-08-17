import type { CreatorProfile } from "@/lib/creators";
import { slugValide } from "@/lib/boutik-slug";

/**
 * L'ADRESSE D'UNE BOUTIQUE — une seule fonction, tous les appelants.
 *
 * Trois endroits proposent ce lien : la vitrine (bouton partager), le
 * tableau de bord vendeur (« votre boutique est ouverte »), et demain le
 * catalogue. Trois `creator.boutikSlug ? … : …` recopiés divergeraient — et
 * la divergence ne se verrait que le jour où un vendeur partagerait une
 * adresse qui ne mène nulle part.
 *
 * ⚠️ Le slug est REVALIDÉ ici, alors qu'une contrainte le garde déjà en base.
 * Ce n'est pas de la méfiance envers `0083` : c'est que le code se déploie
 * seul et que la contrainte, elle, attend un geste du porteur. Entre les
 * deux, la colonne peut exister sans que la forme soit garantie. Une
 * validation qui coûte une expression régulière vaut mieux qu'une URL cassée
 * dans un message WhatsApp déjà envoyé.
 */
export function hrefBoutique(
  creator: Pick<CreatorProfile, "id" | "boutikSlug">
): string {
  const s = creator.boutikSlug;
  return s && slugValide(s) ? `/boutik/${s}` : `/createur/${creator.id}`;
}
