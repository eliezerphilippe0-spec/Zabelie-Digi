import { createClient } from "@/lib/supabase/server";
import { getZonesActives } from "@/lib/zones";
import {
  niveauProximite,
  perimetresProximite,
  type EnsemblesVendeurs,
  type NiveauProximite,
} from "@/lib/proximite";

/**
 * Les vendeurs d'un ensemble de zones, par la fonction `0084`
 * (`zabelie_vande_nan_zon`) — la SEULE porte vers `profiles.zone_id` : la
 * colonne est hors de la liste blanche de colonnes, et la fonction ne rend que
 * des MARCHANDS. La zone d'un acheteur n'est jamais lisible par ce chemin, et
 * ne doit pas le devenir.
 *
 * `null` si la lecture échoue : l'appelant classe alors sans proximité, ce qui
 * est une dégradation honnête (un classement, pas une sécurité).
 */
async function vendeursDans(
  supabase: Awaited<ReturnType<typeof createClient>>,
  zoneIds: string[]
): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc("zabelie_vande_nan_zon", { p_zone_ids: zoneIds });
  if (error || !data) return null;
  return new Set((data as ({ id: string } | string)[]).map((s) => (typeof s === "string" ? s : s.id)));
}

/**
 * Le niveau de proximité de chaque vendeur demandé, pour un acheteur situé dans
 * `zoneAcheteurId`. Quatre lectures, minuscules (une par périmètre + celle des
 * marchands qui ont une zone), faites en parallèle.
 *
 * ⚠️ La fonction SQL plafonne à 1000 marchands par appel (`limit 1000`). Au-delà,
 * un vendeur pourrait être classé « inconnu » à tort — jamais « proche » à tort :
 * la troncature dégrade vers le doute, pas vers l'affirmation.
 *
 * Rend `null` (aucun classement) si l'acheteur n'a pas de zone exploitable ou si
 * une lecture échoue ; la cause est journalisée sans donnée personnelle.
 */
export async function proximiteDesVendeurs(
  zoneAcheteurId: string,
  vendeurIds: string[]
): Promise<Map<string, NiveauProximite> | null> {
  const zones = await getZonesActives();
  const perimetres = perimetresProximite(zones, zoneAcheteurId);
  if (!perimetres) return null;

  const supabase = await createClient();
  const [katye, komin, depatman, avecZone] = await Promise.all([
    perimetres.katye ? vendeursDans(supabase, perimetres.katye) : Promise.resolve(null),
    perimetres.komin ? vendeursDans(supabase, perimetres.komin) : Promise.resolve(null),
    vendeursDans(supabase, perimetres.depatman),
    vendeursDans(supabase, zones.map((z) => z.id)),
  ]);
  // Un périmètre demandé et illisible = lecture échouée ; un périmètre non
  // demandé (null attendu) n'est pas une erreur.
  if ((perimetres.katye && !katye) || (perimetres.komin && !komin) || !depatman || !avecZone) {
    console.warn("[proximite] lecture des vendeurs par zone impossible, aucun classement");
    return null;
  }
  const ensembles: EnsemblesVendeurs = { katye, komin, depatman, avecZone };
  return new Map(vendeurIds.map((id) => [id, niveauProximite(id, ensembles)]));
}
