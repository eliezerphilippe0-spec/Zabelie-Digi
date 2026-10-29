import { createClient } from "@/lib/supabase/server";
import { getZonesActives } from "@/lib/zones";
import { filtreZoneNonSuspendue } from "@/lib/zones-service";
import { isMissingTable } from "@/lib/product-media";
import {
  niveauDesserte,
  niveauProximite,
  perimetresProximite,
  type EnsemblesVendeurs,
  type Perimetres,
} from "@/lib/proximite";
import { fusionnerNiveaux, type ProximiteVendeur } from "@/lib/proximite-niveaux";

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
 * Les zones où chaque vendeur demandé DÉCLARE livrer (0158), lues sous la session
 * (lecture publique). Une zone desservie est une déclaration commerciale du
 * vendeur, pas une donnée personnelle.
 *
 * `null` si la lecture échoue — dont la table absente (le code se déploie avant
 * la migration) : l'appelant classe alors sur la seule zone d'installation. La
 * dégradation est silencieuse pour la table absente, journalisée sinon.
 */
async function zonesDesservies(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendeurIds: string[]
): Promise<Map<string, string[]> | null> {
  // Une zone EN PAUSE (0164) ne compte pas comme desservie : la proximité ne promet pas une livraison que
  // le vendeur a suspendue. Colonne absente (base en retard de migration, 42703) : relecture sans le filtre.
  const base = () => supabase.from("zabelie_seller_service_zones").select("seller_id, zone_id").in("seller_id", vendeurIds);
  let { data, error } = await base().or(filtreZoneNonSuspendue(new Date()));
  if (error?.code === "42703") ({ data, error } = await base());
  if (error || !data) {
    if (error && !isMissingTable(error)) console.warn("[proximite] zones desservies illisibles, zone d'installation seule");
    return null;
  }
  const parVendeur = new Map<string, string[]>();
  for (const ligne of data as { seller_id: string; zone_id: string }[]) {
    parVendeur.set(ligne.seller_id, [...(parVendeur.get(ligne.seller_id) ?? []), ligne.zone_id]);
  }
  return parVendeur;
}

/**
 * Le niveau de proximité de chaque vendeur demandé, pour un acheteur situé dans
 * `zoneAcheteurId`. Cinq lectures, minuscules (une par périmètre, celle des
 * marchands qui ont une zone, et les zones desservies), faites en parallèle.
 *
 * Le niveau d'un vendeur est le plus proche de deux sources : l'endroit où il est
 * installé, et les zones où il déclare livrer (`fusionnerNiveaux`). Si la lecture
 * des zones desservies échoue, seule l'installation compte — un classement
 * dégradé, jamais un classement faux.
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
): Promise<Map<string, ProximiteVendeur> | null> {
  const zones = await getZonesActives();
  const perimetres = perimetresProximite(zones, zoneAcheteurId);
  if (!perimetres) return null;

  const supabase = await createClient();
  const [katye, komin, depatman, avecZone, desservies] = await Promise.all([
    perimetres.katye ? vendeursDans(supabase, perimetres.katye) : Promise.resolve(null),
    perimetres.komin ? vendeursDans(supabase, perimetres.komin) : Promise.resolve(null),
    vendeursDans(supabase, perimetres.depatman),
    vendeursDans(supabase, zones.map((z) => z.id)),
    zonesDesservies(supabase, vendeurIds),
  ]);
  // Un périmètre demandé et illisible = lecture échouée ; un périmètre non
  // demandé (null attendu) n'est pas une erreur.
  if ((perimetres.katye && !katye) || (perimetres.komin && !komin) || !depatman || !avecZone) {
    console.warn("[proximite] lecture des vendeurs par zone impossible, aucun classement");
    return null;
  }
  const ensembles: EnsemblesVendeurs = { katye, komin, depatman, avecZone };
  return new Map(vendeurIds.map((id) => [id, niveauDeVendeur(id, ensembles, perimetres, desservies)]));
}

/** Installation ⊕ desserte pour UN vendeur. `desservies` nul = lecture échouée : installation seule. */
function niveauDeVendeur(
  id: string,
  ensembles: EnsemblesVendeurs,
  perimetres: Perimetres,
  desservies: Map<string, string[]> | null
): ProximiteVendeur {
  const maison = niveauProximite(id, ensembles);
  if (!desservies) return { niveau: maison, dessert: false };
  return fusionnerNiveaux(maison, niveauDesserte(desservies.get(id) ?? [], perimetres));
}
