import Link from "next/link";
import { formatHTG } from "@/lib/sample-data";
import type { ProductView } from "@/lib/products";
import { pickByKind } from "@/lib/product-kind";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { estSingulier, type Lang } from "@/lib/i18n";

export type ProductCardLabels = {
  kindFile: string;
  kindService: string;
  kindPhysical: string;
  by: string;
  /* LES DEUX FORMES DU MOT « VENTE », plus la langue qui décide laquelle.
   *
   * ⚠️ `lang` dans un sac nommé `labels` détonne, et c'est le moindre mal
   * assumé : le compte n'est connu qu'ICI, par carte, alors que le sac est
   * construit UNE fois pour toute la grille. L'alternative — descendre `lang`
   * en prop jusqu'à `ProductCard` — traverse `HomeRow`, qui ne la porte pas et
   * n'en a aucun autre usage. Un accord n'est pas un libellé, mais il n'a de
   * sens qu'avec les libellés qu'il accorde. */
  sales: string;
  salesOne: string;
  lang: Lang;
};

const FALLBACK_LABELS: ProductCardLabels = {
  kindFile: "Fichier",
  kindService: "Service",
  kindPhysical: "Physique",
  by: "par",
  sales: "ventes",
  salesOne: "vente",
  lang: "fr",
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
  const cover = coverUrlAt(product.coverUrl, COVER_WIDTHS.card);

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
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:-translate-y-1 hover:border-accent/50"
    >
      <div
        className={`relative h-40 bg-gradient-to-br ${product.accent} opacity-90`}
      >
        {/* La photo du vendeur d'abord — le dégradé n'est que le repli.
            Dimensionnée au CDN (lib/product-image) : `lazy` diffère, il ne
            réduit aucun octet. `width`/`height` explicites = pas de saut de
            mise en page pendant le chargement. `alt` porte le titre : c'est
            ce que lit quelqu'un dont l'image ne charge pas — fréquent ici. */}
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={product.title}
            width={COVER_WIDTHS.card}
            height={Math.round(COVER_WIDTHS.card * 0.625)}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {!cover && (
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
              : `${product.sales} ${
                  estSingulier(labels.lang, product.sales)
                    ? labels.salesOne
                    : labels.sales
                }`}
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
          {/* Prix en plein, pas en dégradé (audit UX #7) : sur un écran bon
              marché, un texte rendu par background-clip perd du contraste et
              du crénelage — sur le seul chiffre qui décide de l'achat. */}
          <span className="numeric text-sm font-bold text-cloud">
            {formatHTG(product.priceHTG)}
          </span>
        </div>
      </div>
    </Link>
  );
}
