import Link from "next/link";
import { formatHTG } from "@/lib/sample-data";
import type { ProductView } from "@/lib/products";
import { pickByKind } from "@/lib/product-kind";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { estSingulier, type Lang } from "@/lib/i18n";
import { titreCarte } from "@/lib/home-sections";
import { CardImage } from "@/components/card-image";

export type ProductCardLabels = {
  kindFile: string;
  kindService: string;
  kindPhysical: string;
  by: string;
  sales: string;
  salesOne: string;
  lang: Lang;
  /** Repli quand le titre est vide ou n'est pas un titre (brief §4.3). */
  titleFallback?: string;
};

const FALLBACK_LABELS: ProductCardLabels = {
  kindFile: "Fichier",
  kindService: "Service",
  kindPhysical: "Physique",
  by: "par",
  sales: "ventes",
  salesOne: "vente",
  lang: "fr",
  titleFallback: "Produit",
};

/**
 * CARTE PRODUIT — accueil premium, Phase 4 (brief §4.4).
 *
 * Ordre imposé : image carrée → nom (2 lignes, ellipse) → prix (Manrope 700,
 * orange de texte) → vendeur (14 px, secondaire). Fond surface, bordure
 * `line` 1 px, rayon `card` (12 px, `--radius-card`), ombre au tap seulement
 * (`active:scale-[0.97]`, pas d'ombre grise permanente). Toute la carte est
 * la cible : ≥ 44 px par construction.
 *
 * Le titre passe par `titreCarte` : jamais une URL brute ni une chaîne vide à
 * l'écran — un repli neutre et une ligne de journal.
 *
 * Ce qui reste de l'ancienne carte, et pourquoi : le badge du TYPE (fichier,
 * service, physique) — c'est une information d'achat, pas une décoration ;
 * et le badge note/ventes, dont la forme s'accorde au compte
 * (`tests/pluriel` P4). Le dégradé de repli des produits sans photo est
 * remplacé par un aplat neutre : la marchandise, c'est l'image ; sans image,
 * un décor mentirait.
 */
export function ProductCard({
  product,
  labels = FALLBACK_LABELS,
}: {
  product: ProductView;
  labels?: ProductCardLabels;
}) {
  const cover = coverUrlAt(product.coverUrl, COVER_WIDTHS.card);
  const titre = titreCarte(product.title, labels.titleFallback ?? "Produit", undefined, product.slug);

  // Type inconnu : aucun badge, plutôt qu'un badge « Fichier » sur une pièce
  // détachée (l'ancien `else` promettait un téléchargement).
  const kindLabel = pickByKind(
    product.kind,
    { file: labels.kindFile, service: labels.kindService, physical: labels.kindPhysical },
    product.id
  );

  return (
    <Link
      href={`/produit/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition active:scale-[0.97]"
    >
      <div className="relative aspect-square w-full bg-line">
        {cover && <CardImage src={cover} alt={titre} size={COVER_WIDTHS.card} />}
        {kindLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-chrome/80 px-2 py-0.5 text-[11px] font-medium text-on-chrome">
            {kindLabel}
          </span>
        )}
        {(product.ratingAvg !== null || product.sales > 0) && (
          <span className="absolute right-2 top-2 rounded-full bg-chrome/80 px-2 py-0.5 text-[11px] font-medium text-on-chrome">
            {product.ratingAvg !== null
              ? `★ ${product.ratingAvg} (${product.ratingCount})`
              : `${product.sales} ${
                  estSingulier(labels.lang, product.sales)
                    ? labels.salesOne
                    : labels.sales
                }`}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <h3 className="line-clamp-2 text-sm font-normal leading-snug text-cloud">{titre}</h3>
        {/* Prix en PLEIN, Manrope 700 (`.numeric`, globals.css), orange de
            texte AA (`--color-accent`), même taille que le nom : le seul
            chiffre qui décide de l'achat ne se lit jamais en petit gris. */}
        <span className="numeric text-sm font-bold text-accent">{formatHTG(product.priceHTG)}</span>
        <span className="truncate text-sm text-mist">
          {labels.by} {product.creator}
        </span>
      </div>
    </Link>
  );
}
