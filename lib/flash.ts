import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/product-media";

export type OffreFlash = {
  id: string;
  prixFlashHtg: number;
  debut: string;
  fin: string;
  unitesMax: number | null;
};

/**
 * L'offre flash VIVANTE d'un produit — fenêtre relue à chaque appel, jamais
 * mise en cache : le checkout doit voir l'expiration à la seconde, pas à la
 * revalidation. Dormant-behind-schema : sans 0080, `null` — la fiche affiche
 * le prix normal et le checkout facture le prix normal, exactement comme
 * avant la migration.
 */
export async function offreFlashActive(
  admin: SupabaseClient,
  productId: string
): Promise<OffreFlash | null> {
  try {
    const { data, error } = await admin
      .from("zabelie_flash_sales")
      .select("id, prix_flash_htg, debut, fin, unites_max")
      .eq("product_id", productId)
      .is("annulee_a", null)
      .lte("debut", new Date().toISOString())
      .gt("fin", new Date().toISOString())
      .order("fin", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error && !isMissingTable(error)) {
        console.log(
          "[flash]",
          JSON.stringify({
            at: new Date().toISOString(),
            issue: "lecture_echouee",
            productId,
            message: error.message,
          })
        );
      }
      return null;
    }
    return {
      id: data.id,
      prixFlashHtg: Number(data.prix_flash_htg),
      debut: data.debut,
      fin: data.fin,
      unitesMax: data.unites_max === null ? null : Number(data.unites_max),
    };
  } catch {
    // Une panne de lecture ne casse jamais une vente : prix normal.
    return null;
  }
}

/**
 * Le plafond d'unités est-il atteint ? Compte les commandes NON ANNULÉES de
 * la fenêtre. Fail-open assumé : si le comptage échoue, on vend au prix flash
 * plutôt que de bloquer un acheteur — l'erreur coûte au vendeur quelques
 * unités remisées de plus, jamais une vente au mauvais prix.
 */
export async function flashEpuisee(
  admin: SupabaseClient,
  productId: string,
  offre: OffreFlash
): Promise<boolean> {
  if (offre.unitesMax === null) return false;
  const { count, error } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("product_id", productId)
    .neq("status", "cancelled")
    .gte("created_at", offre.debut);
  if (error) return false;
  return (count ?? 0) >= offre.unitesMax;
}

/**
 * Unités déjà prises dans la fenêtre — MÊME règle que `flashEpuisee` (le
 * checkout) : commandes non annulées du produit depuis le début de l'offre.
 * `null` si l'offre n'a pas de plafond ou si le comptage échoue : la barre
 * « déjà pris » ne s'affiche alors pas, plutôt que d'afficher un chiffre faux.
 */
export async function unitesVendues(
  admin: SupabaseClient,
  productId: string,
  offre: OffreFlash
): Promise<number | null> {
  if (offre.unitesMax === null) return null;
  try {
    const { count, error } = await admin
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .neq("status", "cancelled")
      .gte("created_at", offre.debut);
    return error ? null : count ?? 0;
  } catch {
    return null;
  }
}

/** Ce que montre la barre des ventes flash : unités restantes et part déjà prise (0 à 1). */
export function etatStockFlash(
  unitesMax: number | null,
  vendues: number | null
): { restantes: number; part: number } | null {
  if (unitesMax === null || vendues === null || unitesMax <= 0) return null;
  const prises = Math.max(0, Math.min(vendues, unitesMax));
  return { restantes: unitesMax - prises, part: prises / unitesMax };
}

export type FlashVitrine = OffreFlash & { productId: string; vendues: number | null };

/**
 * Les ventes flash VIVANTES parmi des produits déjà chargés — la vitrine de
 * l'accueil (« Ventes flash », sur le modèle de Jumia et des Lightning Deals).
 *
 * Une offre par produit (celle qui finit le plus tôt), au plus `limite`.
 * Une offre ÉPUISÉE n'est pas montrée : le checkout la facturerait au prix
 * normal (`flashEpuisee`), la vitrine mentirait. Toute erreur rend `[]` :
 * l'accueil s'affiche alors sans la section, jamais cassé.
 */
export async function offresFlashVitrine(
  lecteur: SupabaseClient,
  admin: SupabaseClient | null,
  productIds: string[],
  maintenant: Date = new Date(),
  limite = 12
): Promise<FlashVitrine[]> {
  if (productIds.length === 0) return [];
  try {
    const iso = maintenant.toISOString();
    const { data, error } = await lecteur
      .from("zabelie_flash_sales")
      .select("id, product_id, prix_flash_htg, debut, fin, unites_max")
      .in("product_id", productIds)
      .is("annulee_a", null)
      .lte("debut", iso)
      .gt("fin", iso)
      .order("fin", { ascending: true })
      .limit(limite * 2);
    if (error || !data) return [];
    const vus = new Set<string>();
    const offres: FlashVitrine[] = [];
    for (const r of data as { id: string; product_id: string; prix_flash_htg: number; debut: string; fin: string; unites_max: number | null }[]) {
      if (vus.has(r.product_id)) continue;
      vus.add(r.product_id);
      offres.push({
        id: r.id,
        productId: r.product_id,
        prixFlashHtg: Number(r.prix_flash_htg),
        debut: r.debut,
        fin: r.fin,
        unitesMax: r.unites_max === null ? null : Number(r.unites_max),
        vendues: null,
      });
    }
    if (admin) {
      await Promise.all(offres.map(async (o) => { o.vendues = await unitesVendues(admin, o.productId, o); }));
    }
    return offres
      .filter((o) => o.unitesMax === null || o.vendues === null || o.vendues < o.unitesMax)
      .slice(0, limite);
  } catch {
    return [];
  }
}
