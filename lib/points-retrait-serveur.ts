import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/product-media";
import { lirePointsRetrait, type PointRetrait } from "@/lib/points-retrait";

/**
 * Les points de retrait OUVERTS, pour l'acheteur (0082, docs/77 §12.6).
 *
 * Lu sous la SESSION (ou l'anonyme) : la policy `zabelie_pickup_public_read` n'ouvre que
 * `actif`. Le filtre `actif` est RÉPÉTÉ ici exprès : si une policy de lecture était un jour
 * élargie « pour dépanner », un point FERMÉ — un accord qui n'existe pas encore — ne devrait
 * pas devenir visible pour autant.
 *
 * ⚠️ Fail-soft, avec une trace : table absente (code déployé avant la migration) → liste
 * vide, sans bruit ; toute autre erreur → liste vide ET un avertissement, sinon « aucun
 * point de retrait » et « la lecture a échoué » montreraient la même page.
 *
 * Borné à 200 lignes : le répertoire est tenu à la main par l'administration. Au-delà, le
 * filtrage par zone devra se faire en base — décision à prendre quand le volume l'impose.
 */
export const MAX_POINTS_CHARGES = 200;

export async function chargerPointsRetrait(): Promise<PointRetrait[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("zabelie_pickup_points")
      .select("id, nom, adresse, telefon, zone_id, position")
      .eq("actif", true)
      .not("zone_id", "is", null)
      .order("position")
      .order("created_at")
      .limit(MAX_POINTS_CHARGES);
    if (error) {
      if (!isMissingTable(error)) console.warn("[retrait] points de retrait illisibles", error.message);
      return [];
    }
    return lirePointsRetrait(data);
  } catch {
    console.warn("[retrait] points de retrait illisibles");
    return [];
  }
}
