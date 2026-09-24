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
  photoMissing?: string;
  detail?: string;
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
  discovery = false,
  boutique = false,
  labels = FALLBACK_LABELS,
}: {
  product: ProductView;
  discovery?: boolean;
  boutique?: boolean;
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
      href={discovery ? `/decouvrir/${product.slug}` : `/produit/${product.slug}`}
      prefetch={discovery ? false : undefined}
      className={boutique
        ? "group grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-4 rounded-card border border-line bg-surface p-4 transition hover:border-accent active:scale-[0.99] sm:grid-cols-[8rem_minmax(0,1fr)]"
        : "group flex flex-col overflow-hidden rounded-card border border-line bg-surface transition active:scale-[0.97]"}
    >
      <div className={`relative aspect-square w-full overflow-hidden bg-line ${boutique ? "rounded-lg" : ""}`}>
        {cover && <CardImage src={cover} alt={titre} size={COVER_WIDTHS.card} />}
        {!cover && labels.photoMissing && (
          <div className={boutique ? "flex h-full flex-col items-center justify-center gap-2 px-1 text-center text-[10px] text-mist" : "home-photo-empty"}>
            <svg className={boutique ? "h-6 w-6 shrink-0" : undefined} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16h24l3 25H9l3-25Z" /><path d="M18 17v-5a6 6 0 0 1 12 0v5" /></svg>
            <span>{labels.photoMissing}</span>
          </div>
        )}
        {!boutique && kindLabel && (
          <span className="absolute left-2 top-2 rounded-full bg-chrome/80 px-2 py-0.5 text-[11px] font-medium text-on-chrome">
            {kindLabel}
          </span>
        )}
        {!boutique && (product.ratingAvg !== null || product.sales > 0) && (
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

      <div className={boutique ? "flex min-w-0 flex-col gap-2" : "flex flex-1 flex-col gap-1 p-2.5"}>
        {boutique && kindLabel && <span className="text-xs text-mist">{kindLabel}</span>}
        <h3 className={`line-clamp-2 break-words leading-snug text-cloud ${boutique ? "text-base font-semibold" : "text-sm font-normal"}`}>{titre}</h3>
        {boutique && product.blurb && <p className="line-clamp-2 break-words text-sm leading-relaxed text-mist">{product.blurb}</p>}
        {/* Prix en PLEIN, Manrope 700 (`.numeric`, globals.css), orange de
            texte AA (`--color-accent`), même taille que le nom : le seul
            chiffre qui décide de l'achat ne se lit jamais en petit gris. */}
        <span className={`numeric font-bold text-accent ${boutique ? "text-base" : "text-sm"}`}>{formatHTG(product.priceHTG)}</span>
        {boutique && (product.ratingAvg !== null || product.sales > 0) && <span className="text-sm text-mist">
          {product.ratingAvg !== null ? `★ ${product.ratingAvg} (${product.ratingCount})` : `${product.sales} ${estSingulier(labels.lang, product.sales) ? labels.salesOne : labels.sales}`}
        </span>}
        {!boutique && <span className="truncate text-sm text-mist">
          {labels.by} {product.creator}
        </span>}
        {labels.detail && <span className={boutique ? "inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cloud" : "home-card-cta"}>{labels.detail}<span aria-hidden="true">↗</span></span>}
      </div>
    </Link>
  );
}
