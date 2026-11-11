import type { SupabaseClient } from "@supabase/supabase-js";
import { cheminFichePreparee, type FichePrepareeLue } from "@/lib/fiche-preparee";
import { isProductKind } from "@/lib/product-kind";

/**
 * Lit UNE fiche préparée pour le vendeur CONNECTÉ (lot 3b, 0171).
 *
 * Le client passé est celui de la SESSION : la RLS de `0171` ne laisse lire
 * que les fiches du vendeur, et le filtre `seller_id` est redit ici. Une fiche
 * d'autrui, une fiche expirée ou un identifiant inconnu rendent tous `null` :
 * la page affiche le même message dans les trois cas.
 *
 * `chemin` est l'adresse du formulaire qui correspond au TYPE de la fiche. La
 * page s'en sert pour renvoyer vers le bon formulaire un lien ouvert sur le mauvais.
 */
export async function lireFichePreparee(
  supabase: SupabaseClient,
  sellerId: string,
  id: string,
  maintenant = new Date(),
): Promise<{ fiche: FichePrepareeLue; chemin: string } | null> {
  const { data, error } = await supabase
    .from("zabelie_fiches_preparees")
    .select("id, kind, title, description, price_htg, expires_at, reprise_at, api_key_id")
    .eq("id", id)
    .eq("seller_id", sellerId)
    .maybeSingle();
  if (error) {
    // Une panne de lecture n'est pas « fiche introuvable » pour celui qui dépanne.
    console.error("[fiche-preparee] lecture refusée", error.code);
    return null;
  }
  if (!data || !isProductKind(data.kind)) return null;
  if (!(Date.parse(data.expires_at) > maintenant.getTime())) return null;
  const chemin = cheminFichePreparee(data.kind, data.id);
  if (!chemin) return null;

  let cle: string | null = null;
  if (data.api_key_id) {
    const { data: k } = await supabase.from("zabelie_api_keys").select("name").eq("id", data.api_key_id).eq("seller_id", sellerId).maybeSingle();
    cle = typeof k?.name === "string" ? k.name : null;
  }
  return {
    chemin,
    fiche: {
      id: data.id,
      titre: data.title,
      description: data.description ?? "",
      prixHtg: Number.isSafeInteger(data.price_htg) && data.price_htg >= 0 ? data.price_htg : null,
      cle,
      dejaReprise: data.reprise_at !== null,
    },
  };
}
