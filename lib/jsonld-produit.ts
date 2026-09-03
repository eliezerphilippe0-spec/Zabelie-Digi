import type { ProductView } from "./products";
import { siteUrl } from "./site-url";
import { isDownloadable, isService } from "./product-kind";

/**
 * JSON-LD `Product` + `Offer` (+ `AggregateRating`) pour `/produit/[slug]`.
 *
 * Audit SEO 2026-08-28 (`docs/47` §2.1, #5) : le seul balisage du site était
 * `Organization` + `WebSite` sur l'accueil. Or tout ce qu'un `Product` demande
 * est DÉJÀ en base — prix, devise, note, nombre d'avis, vendeur. Il manquait
 * la phrase qui les dit au moteur.
 *
 * ─── CE QUE CE BALISAGE AFFIRME, ET CE QU'IL N'AFFIRME PAS ─────────────────
 *
 * • `price` est le prix SERVEUR (`priceHTG`, ou le prix flash s'il est
 *   actif) — jamais une valeur client. Même règle que le checkout.
 * • `priceCurrency: "HTG"` : la gourde, code ISO 4217. Le rail USD est un
 *   affichage indicatif (`docs/03`), il ne figure pas ici.
 * • `availability` vient du STOCK RÉEL pour un produit physique
 *   (`disponible`), et vaut « en stock » pour un fichier ou une prestation —
 *   un fichier ne s'épuise pas, une prestation se réserve.
 * • `AggregateRating` n'est émis QUE s'il existe au moins un avis. Un
 *   `ratingValue` sur zéro avis est une note inventée ; et `0008` garantit
 *   qu'un avis vient d'une commande PAYÉE, une seule par commande — c'est ce
 *   qui rend la note défendable devant un moteur.
 * • Pas de `Review` individuel, pas de `sku`, pas de `brand` : rien qu'on ne
 *   puisse tenir. Un balisage qui promet plus que la page se paie en
 *   pénalité, pas en position.
 */
export type OffreProduit = {
  /** Prix effectivement affiché (flash compris), en HTG entiers. */
  prixHtg: number;
  /** Stock connu pour un produit physique ; `null` = type sans stock. */
  disponible: boolean | null;
};

export function jsonLdProduit(p: ProductView, offre: OffreProduit): Record<string, unknown> {
  const base = siteUrl();
  const url = `${base}/produit/${p.slug}`;

  // Un fichier ne s'épuise pas ; une prestation se réserve. Seul le physique
  // porte un stock — et s'il est à zéro, le dire vaut mieux que le taire.
  const sansStock = isDownloadable(p.kind, p.id) || isService(p.kind, p.id);
  const enStock = sansStock ? true : offre.disponible !== false;

  const produit: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.blurb,
    url,
    ...(p.coverUrl ? { image: p.coverUrl } : {}),
    ...(p.category ? { category: p.category } : {}),
    offers: {
      "@type": "Offer",
      url,
      price: String(offre.prixHtg),
      priceCurrency: "HTG",
      availability: enStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: p.creator },
    },
  };

  if (p.ratingCount > 0 && p.ratingAvg !== null) {
    produit.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: String(p.ratingAvg),
      reviewCount: String(p.ratingCount),
      bestRating: "5",
      worstRating: "1",
    };
  }
  return produit;
}
