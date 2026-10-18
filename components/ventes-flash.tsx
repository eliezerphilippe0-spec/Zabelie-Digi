import Link from "next/link";
import { CardImage } from "@/components/card-image";
import { FlashCountdown } from "@/components/flash-countdown";
import { formatHTG } from "@/lib/sample-data";
import { coverUrlAt, COVER_WIDTHS } from "@/lib/product-image";
import { titreCarte } from "@/lib/home-sections";
import { pourcentageRabais } from "@/lib/product-discount";
import { etatStockFlash, type FlashVitrine } from "@/lib/flash";
import { t, tn, type Lang } from "@/lib/i18n";
import type { ProductView } from "@/lib/products";

/** L'éclair des ventes flash — un trait plein, la couleur suit le texte. */
export function EclairFlash({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" className={`flash-eclair ${className}`}>
      <path d="M13.5 2 4 13.5h6.5L9.5 22 20 9.5h-6.6z" fill="currentColor" />
    </svg>
  );
}

/**
 * La barre « déjà pris » des ventes flash (Jumia, Amazon Lightning Deals).
 * Elle n'existe que si l'offre a un plafond d'unités ET que le comptage a
 * répondu : jamais un chiffre inventé pour créer l'urgence.
 */
export function StockFlash({ lang, unitesMax, vendues }: { lang: Lang; unitesMax: number | null; vendues: number | null }) {
  const etat = etatStockFlash(unitesMax, vendues);
  if (!etat) return null;
  return (
    <div className="flash-stock">
      <span className="flash-barre" aria-hidden="true">
        <span style={{ ["--part" as string]: String(Math.max(etat.part, 0.04)) }} />
      </span>
      <span className="text-xs font-semibold">
        {tn(lang, etat.restantes, "flash.left.one", "flash.left", { n: String(etat.restantes) })}
      </span>
    </div>
  );
}

/**
 * VENTES FLASH — la rangée de l'accueil, sur le modèle de Jumia.
 *
 * Un bandeau à l'éclair, puis des cartes : remise en pourcentage, prix flash
 * et prix barré, barre « déjà pris » quand l'offre a un plafond, compte à
 * rebours par offre (chaque vendeur choisit sa fenêtre : un seul compteur pour
 * toute la rangée serait faux pour toutes les autres).
 *
 * Tout ce qui s'affiche vient de la base : le prix flash (`zabelie_flash_sales`),
 * le prix d'origine (`products`), les unités prises (les commandes, même règle
 * que le checkout). Sans offre vivante, la section n'existe pas.
 *
 * Animations (app/ventes-flash.css) : l'éclair qui s'allume, la remise qui
 * apparaît, la barre qui se remplit — chacune JOUÉE UNE FOIS, transform et
 * opacité seulement, et absentes en mouvement réduit.
 */
export function VentesFlash({
  lang,
  offres,
  produits,
  discovery,
}: {
  lang: Lang;
  offres: FlashVitrine[];
  produits: ProductView[];
  discovery: boolean;
}) {
  const parId = new Map(produits.map((p) => [p.id, p]));
  const cartes = offres.flatMap((o) => {
    const p = parId.get(o.productId);
    return p && o.prixFlashHtg < p.priceHTG ? [{ o, p }] : [];
  });
  if (cartes.length === 0) return null;

  return (
    <section aria-labelledby="ventes-flash" className="ventes-flash mx-auto max-w-6xl px-5 pt-6">
      <div className="flash-bandeau">
        <h2 id="ventes-flash" className="flex items-center gap-2 text-lg font-extrabold tracking-tight sm:text-xl">
          <EclairFlash />
          {t(lang, "flash.title")}
        </h2>
        <p className="text-xs sm:text-sm">{t(lang, "flash.sub")}</p>
      </div>
      <ul className="flash-rangee">
        {cartes.map(({ o, p }) => {
          const cover = coverUrlAt(p.coverUrl, COVER_WIDTHS.card);
          const titre = titreCarte(p.title, t(lang, "card.title.fallback"), undefined, p.slug);
          return (
            <li key={o.id} className="flash-carte">
              <Link
                href={discovery ? `/decouvrir/${p.slug}` : `/produit/${p.slug}`}
                prefetch={discovery ? false : undefined}
                className="flash-lien flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-line">
                  {cover && <CardImage src={cover} alt={titre} size={COVER_WIDTHS.card} />}
                  <span className="flash-remise">−{pourcentageRabais(p.priceHTG, o.prixFlashHtg)}%</span>
                </div>
                <div className="flex flex-1 flex-col gap-1 p-2.5">
                  <p className="line-clamp-2 break-words text-sm leading-snug text-cloud">{titre}</p>
                  <p className="flex flex-wrap items-baseline gap-x-2">
                    <span className="numeric text-sm font-bold text-accent">{formatHTG(o.prixFlashHtg)}</span>
                    <span className="numeric text-xs text-mist line-through">{formatHTG(p.priceHTG)}</span>
                  </p>
                  <StockFlash lang={lang} unitesMax={o.unitesMax} vendues={o.vendues} />
                  <span className="mt-auto pt-1">
                    <FlashCountdown fin={o.fin} prefix={t(lang, "product.flash.ends")} />
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
