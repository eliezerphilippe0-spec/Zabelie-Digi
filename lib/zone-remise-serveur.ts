import type { ZoneOption } from "@/components/profile-form";
import type { Lang } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { isMissingTable } from "@/lib/product-media";
import { cheminZone, getZonesActives, libelleZone } from "@/lib/zones";

/**
 * Ce que la fiche d'un produit PHYSIQUE donne au sélecteur de zone de remise
 * (0161) : les zones ouvertes et les zones que LE VENDEUR déclare desservir (0158).
 *
 * ⚠️ Le cookie `zabelie_zone` n'est PAS lu ici. La politique (§8) le déclare
 * « pour classer en premier les offres proches de vous » : préremplir la remise
 * serait un second usage, donc une nouvelle version de la politique et une
 * ré-acceptation par chaque compte. `tests/zone-acheteur.test.ts` garde la liste
 * des fichiers qui le lisent.
 *
 * `null` = pas de sélecteur : aucune commune ouverte (rien à choisir), ou la
 * lecture des zones a échoué. Le paiement n'en dépend jamais — la zone est une
 * classification facultative, le sélecteur disparaît sans rien casser.
 *
 * La couverture se lit sous la session (lecture publique de 0158). Table absente
 * (le code se déploie avant la migration) ou lecture en échec → `[]`, c'est-à-dire
 * « rien déclaré » : aucune réserve affichée, jamais une réserve inventée.
 */
export async function chargerZoneRemise(
  lang: Lang,
  vendeurId: string | null,
): Promise<{ zones: ZoneOption[]; couverture: string[] } | null> {
  const toutes = await getZonesActives();
  if (!toutes.some((z) => z.level === "komin")) return null;

  const zones: ZoneOption[] = toutes.map((z) => ({
    id: z.id,
    parent_id: z.parent_id,
    level: z.level,
    label: libelleZone(z, lang),
  }));

  let couverture: string[] = [];
  if (vendeurId) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("zabelie_seller_service_zones")
      .select("zone_id")
      .eq("seller_id", vendeurId);
    if (error) {
      if (!isMissingTable(error)) console.warn("[fiche] zones desservies illisibles, aucune réserve", error.message);
    } else {
      couverture = (data ?? []).map((l: { zone_id: string }) => l.zone_id);
    }
  }
  return { zones, couverture };
}

/**
 * Le libellé « Département › Commune › Quartier » de la zone de remise de chaque
 * commande, lu sous la SESSION : la RLS de `zabelie_order_zones` (0161) n'ouvre la
 * ligne qu'à l'acheteur, et au vendeur une fois la commande payée. Aucun
 * service-role ici — ce serait contourner la fenêtre que la policy encode.
 *
 * Table absente (code déployé avant la migration) ou lecture en échec → carte
 * vide : la page n'affiche simplement pas la ligne. Une zone fermée depuis la
 * commande n'est plus lisible (la RLS de `zabelie_zones` la masque) et n'est donc
 * pas affichée non plus — jamais un chemin inventé.
 */
export async function zonesDesCommandes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderIds: readonly string[],
  lang: Lang,
): Promise<Map<string, string>> {
  const libelles = new Map<string, string>();
  if (orderIds.length === 0) return libelles;
  const { data, error } = await supabase
    .from("zabelie_order_zones")
    .select("order_id, zone_id")
    .in("order_id", [...orderIds]);
  if (error) {
    if (!isMissingTable(error)) console.warn("[commandes] zones de remise illisibles", error.message);
    return libelles;
  }
  if (!data || data.length === 0) return libelles;
  const zones = await getZonesActives();
  for (const l of data as { order_id: string; zone_id: string }[]) {
    const chemin = cheminZone(zones, l.zone_id);
    if (chemin.length > 0) libelles.set(l.order_id, chemin.map((z) => libelleZone(z, lang)).join(" › "));
  }
  return libelles;
}
