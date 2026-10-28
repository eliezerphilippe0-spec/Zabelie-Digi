import { CODE_RE } from "@/lib/affiliation";

/**
 * « Produits qui rapportent » (audit UX-01, docs/REVUE-2026-10-28).
 *
 * En option B, une vente ne rapporte que si le produit acheté porte une ligne
 * dans `zabelie_affiliate_rates` (`attribuerCommande`). Un affilié qui partage
 * un lien d'accueil, ou la fiche d'un produit sans taux, ne touchera jamais
 * rien — et rien à l'écran ne le lui dit. Cette liste est ce qui comble l'écart.
 *
 * Pur, sans réseau : la lecture (sous la session de l'affilié, donc sous la RLS
 * publique de `products`) vit dans la page. Ce module décide seulement quelles
 * lignes lues méritent d'être montrées, et comment fabriquer le lien.
 */

/** Plafond de lignes lues. Au-delà il faudra paginer ; aujourd'hui 0 taux existent. */
export const PRODUITS_COMMISSIONNES_MAX = 30;

export type LigneCommissionnee = {
  id: string;
  slug: string;
  title: string;
  priceHtg: number;
  rateBps: number;
};

type ProduitLu = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  price_htg?: unknown;
  seller_id?: unknown;
  status?: unknown;
};

/**
 * Lignes brutes `{ rate_bps, product }` → lignes montrables, triées du taux le
 * plus haut au plus bas. `product` arrive en objet ou en tableau selon le
 * schéma que PostgREST déduit : les deux sont acceptés.
 *
 * Écartés, chacun pour sa raison :
 *  • produit absent (la RLS l'a masqué : fiche d'un compte d'essai, retirée…) ;
 *  • non publié — rien à acheter ;
 *  • prix nul — gratuit, la commission serait de 0 (`confirm_payment` ne crédite
 *    rien) ;
 *  • produit du lecteur — `attribuerCommande` refuse l'auto-attribution ;
 *  • taux non entier ou ≤ 0 — la base les borne, mais la page ne doit jamais
 *    afficher « 0 % » comme une promesse.
 */
export function lignesCommissionnees(lues: unknown, lecteurId: string): LigneCommissionnee[] {
  if (!Array.isArray(lues)) return [];
  const out: LigneCommissionnee[] = [];
  for (const ligne of lues) {
    if (!ligne || typeof ligne !== "object") continue;
    const brut = ligne as { rate_bps?: unknown; product?: unknown };
    const produit = (Array.isArray(brut.product) ? brut.product[0] : brut.product) as ProduitLu | null | undefined;
    if (!produit || typeof produit !== "object") continue;
    const { id, slug, title, price_htg: prix, seller_id: vendeur, status } = produit;
    if (typeof id !== "string" || typeof slug !== "string" || typeof title !== "string") continue;
    if (status !== "published") continue;
    if (typeof prix !== "number" || !Number.isInteger(prix) || prix <= 0) continue;
    if (vendeur === lecteurId) continue;
    if (typeof brut.rate_bps !== "number" || !Number.isInteger(brut.rate_bps) || brut.rate_bps <= 0) continue;
    out.push({ id, slug, title, priceHtg: prix, rateBps: brut.rate_bps });
  }
  return out.sort((a, b) => b.rateBps - a.rateBps || a.title.localeCompare(b.title));
}

/**
 * Le lien à partager pour UN produit : sa fiche, portant `?ref=<code>`. Le proxy
 * pose le cookie sur n'importe quelle page. Un code au format invalide ne
 * fabrique AUCUN lien — mieux vaut un bouton absent qu'un lien qui n'attribue
 * rien (même regex que la contrainte SQL et le proxy).
 */
export function lienProduit(baseUrl: string, slug: string, code: string): string | null {
  if (!CODE_RE.test(code)) return null;
  return `${baseUrl.replace(/\/+$/, "")}/produit/${encodeURIComponent(slug)}?ref=${code}`;
}
