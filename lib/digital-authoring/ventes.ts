import type { SupabaseClient } from "@supabase/supabase-js";
import { KIND_FILE } from "@/lib/product-kind";

/**
 * LES CHIFFRES DE L'ACCUEIL DU STUDIO (tasks/plan.md, phase T2 ; disposition
 * inspirée du tableau de Chariow, demande du porteur du 2026-10-17).
 *
 * Trois chiffres et un classement, tous tirés de ce que la base sait déjà :
 *  - les VENTES sont les commandes payées ou livrées des produits digitaux du
 *    vendeur (`KIND_FILE`, l'univers « Digital » du catalogue) ;
 *  - les REVENUS sont les crédits de SON grand livre sur ces commandes, la
 *    définition de « Revenus nets » du tableau vendeur (commission déduite) ;
 *  - « 7 derniers jours » se compte à la date du crédit, c'est-à-dire du
 *    paiement, pas de la création du panier ;
 *  - les CLIENTS sont les acheteurs distincts.
 *
 * Lecture sous le JWT du vendeur, jamais par la clé de service (décision C1-A
 * du Studio) : `orders_seller_read` et `wallet_txn_owner_read` (0002) disent
 * déjà ce qu'il a le droit de voir. Aucune migration.
 */

// La salutation sert aussi au tableau vendeur (docs/73) : elle vit à part.
export { momentDeLaJournee, type MomentJournee } from "@/lib/moment-journee";

/** Une commande telle que la lit `chargerVentesDigitales`. */
export type LigneVente = {
  id: string;
  buyer_id: string;
  product: { id: string; title: string; price_htg: number; cover_url: string | null; slug: string } | null;
  wallet_transactions: { amount_htg: number; type: string; created_at: string }[] | null;
};

export type ProduitVendu = {
  id: string;
  titre: string;
  slug: string;
  prix: number;
  cover: string | null;
  ventes: number;
  revenus: number;
};

export type ResumeVentes = {
  revenus: number;
  revenus7j: number;
  ventes: number;
  clients: number;
  meilleurs: ProduitVendu[];
  /** `false` : la lecture a atteint son plafond, les totaux sont des minimums. */
  complet: boolean;
};

const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;

/** Fonction pure : le rendu ne compte rien lui-même. */
export function resumerVentes(lignes: LigneVente[], maintenant: Date, complet: boolean, max = 5): ResumeVentes {
  const depuis = maintenant.getTime() - SEPT_JOURS_MS;
  const acheteurs = new Set<string>();
  const parProduit = new Map<string, ProduitVendu>();
  let revenus = 0;
  let revenus7j = 0;

  for (const l of lignes) {
    if (!l.product) continue;
    acheteurs.add(l.buyer_id);
    let net = 0;
    for (const tx of l.wallet_transactions ?? []) {
      if (tx.type !== "credit") continue;
      net += tx.amount_htg;
      if (new Date(tx.created_at).getTime() >= depuis) revenus7j += tx.amount_htg;
    }
    revenus += net;
    const p = parProduit.get(l.product.id) ?? {
      id: l.product.id,
      titre: l.product.title,
      slug: l.product.slug,
      prix: l.product.price_htg,
      cover: l.product.cover_url,
      ventes: 0,
      revenus: 0,
    };
    p.ventes += 1;
    p.revenus += net;
    parProduit.set(l.product.id, p);
  }

  const meilleurs = [...parProduit.values()]
    .sort((a, b) => b.ventes - a.ventes || b.revenus - a.revenus || a.titre.localeCompare(b.titre, "fr"))
    .slice(0, max);

  return {
    revenus,
    revenus7j,
    ventes: lignes.filter((l) => l.product).length,
    clients: acheteurs.size,
    meilleurs,
    complet,
  };
}

export const LOT_VENTES = 1000;
export const LOTS_VENTES_MAX = 20;

/**
 * Toutes les ventes digitales du vendeur, par lots. `null` si la lecture
 * échoue : l'écran le dit, il n'affiche pas des zéros qu'il n'a pas lus.
 *
 * Le filtre `product.seller_id` n'est pas décoratif : `orders_buyer_read`
 * laisse aussi le vendeur lire ses propres ACHATS, qui ne sont pas des ventes.
 * La clé est nommée (`orders_product_id_fkey`) : depuis `0111`, `orders` a
 * deux clés vers `products` et PostgREST refuse de choisir (PGRST201).
 */
export async function chargerVentesDigitales(
  supabase: SupabaseClient,
  vendeurId: string,
): Promise<{ lignes: LigneVente[]; complet: boolean } | null> {
  const lignes: LigneVente[] = [];
  for (let lot = 0; lot < LOTS_VENTES_MAX; lot++) {
    const de = lot * LOT_VENTES;
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, buyer_id, product:products!orders_product_id_fkey!inner(id, title, price_htg, cover_url, slug), wallet_transactions(amount_htg, type, created_at)",
      )
      .eq("product.seller_id", vendeurId)
      .eq("product.kind", KIND_FILE)
      .in("status", ["paid", "delivered"])
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + LOT_VENTES - 1);
    if (error) {
      console.error("[creation] ventes digitales illisibles", error.code);
      return null;
    }
    const page = (data ?? []) as unknown as LigneVente[];
    lignes.push(...page);
    if (page.length < LOT_VENTES) return { lignes, complet: true };
  }
  return { lignes, complet: false };
}
