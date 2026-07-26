import Link from "next/link";
import { formatHTG } from "@/lib/sample-data";
import type { ProductView } from "@/lib/products";
import { pickByKind } from "@/lib/product-kind";

export type ProductCardLabels = {
  kindFile: string;
  kindService: string;
  kindPhysical: string;
  by: string;
  sales: string;
};

const FALLBACK_LABELS: ProductCardLabels = {
  kindFile: "Fichier",
  kindService: "Service",
  kindPhysical: "Physique",
  by: "par",
  sales: "ventes",
};

export function ProductCard({
  product,
  labels = FALLBACK_LABELS,
}: {
  product: ProductView;
  labels?: ProductCardLabels;
}) {
  // Type inconnu : aucun badge, plutôt qu'un badge « Fichier » sur une pièce
  // détachée (l'ancien `else` promettait un téléchargement).
  const kindLabel = pickByKind(
    product.kind,
    {
      file: labels.kindFile,
      service: labels.kindService,
      physical: labels.kindPhysical,
    },
    product.id
  );

  return (
    <Link
      href={`/produit/${product.slug}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-1 hover:border-violet/50"
    >
      <div
        className={`relative h-40 bg-gradient-to-br ${product.accent} opacity-90`}
      >
        {/* La photo du vendeur d'abord — le dégradé n'est que le repli.
            <img> simple, pas next/image : le proxy d'optimisation restreint
            l'hôte (remotePatterns) et consomme le quota Vercel ; l'upload est
            déjà borné à 5 Mo côté route. lazy = hors écran, rien ne charge. */}
        {product.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.coverUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!product.coverUrl && (
        <svg
          className="absolute inset-0 h-full w-full opacity-20"
          aria-hidden="true"
        >
          <pattern
            id={`chev-${product.slug}`}
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path
              d="M0 9 L9 0 L18 9"
              stroke="var(--color-ink)"
              strokeWidth="1.2"
              fill="none"
            />
          </pattern>
          <rect width="100%" height="100%" fill={`url(#chev-${product.slug})`} />
        </svg>
        )}
        {kindLabel && (
          <span className="absolute left-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-cloud backdrop-blur">
            {kindLabel}
          </span>
        )}
        {(product.ratingAvg !== null || product.sales > 0) && (
          <span className="absolute right-3 top-3 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-medium text-cloud backdrop-blur">
            {product.ratingAvg !== null
              ? `★ ${product.ratingAvg} (${product.ratingCount})`
              : `${product.sales} ${labels.sales}`}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs text-mist">{product.category}</p>
        <h3 className="text-sm font-semibold leading-snug text-cloud">
          {product.title}
        </h3>
        <p className="line-clamp-2 text-xs text-mist">{product.blurb}</p>

        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="text-xs text-mist">{labels.by} {product.creator}</span>
          <span className="numeric text-sm font-bold text-gradient">
            {formatHTG(product.priceHTG)}
          </span>
        </div>
      </div>
    </Link>
  );
}
