import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { formatHTG } from "@/lib/sample-data";
import { titreCarte } from "@/lib/home-sections";
import type { ProductView } from "@/lib/products";

/** Une offre publiée, sans recommandation personnalisée ni preuve inventée. */
export function HomeFeatured({ product, label, cta, missing, fallback }: {
  product: ProductView; label: string; cta: string; missing: string; fallback: string;
}) {
  const cover = coverUrlAt(product.coverUrl, COVER_WIDTHS.card);
  const title = titreCarte(product.title, fallback, undefined, product.slug);
  return (
    <Link href={`/produit/${product.slug}`} className="home-featured">
      <div className="home-featured-media">
        {cover ? <CardImage src={cover} alt={title} size={COVER_WIDTHS.card} /> : (
          <div className="home-photo-empty">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 16h24l3 25H9l3-25Z" /><path d="M18 17v-5a6 6 0 0 1 12 0v5" /></svg>
            <span>{missing}</span>
          </div>
        )}
      </div>
      <div className="home-featured-copy">
        <span className="home-eyebrow">{label}</span>
        <span className="home-featured-title">{title}</span>
        <span className="home-featured-seller">{product.creator}</span>
        <div className="home-featured-bottom"><span className="numeric">{formatHTG(product.priceHTG)}</span><span aria-label={cta} className="home-arrow">↗</span></div>
      </div>
    </Link>
  );
}
