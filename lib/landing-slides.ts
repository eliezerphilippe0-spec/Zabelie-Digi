import type { I18nKey } from "@/lib/i18n";

/**
 * Les slides du hero — configuration, pas composant : un slide s'ajoute ou se
 * retire ICI sans toucher au carrousel.
 *
 * Trois slides, trois publics, dans l'ordre du marché : l'acheteur local,
 * la diaspora qui achète pour sa famille, le vendeur. Chaque slide est une
 * phrase et UN geste — pas de promo chiffrée tant qu'aucune campagne réelle
 * n'existe (règle d'honnêteté commerciale de la PR landing-v2), et pas de
 * dates de validité pour la même raison : un mécanisme d'expiration sans
 * campagne à expirer serait du code sans appelant.
 *
 * Visuel : compositions typographiques sur les dégradés du thème (tokens
 * existants) — pas de photo de banque d'images. Le jour où le porteur fournit
 * des photos terrain, elles remplacent `accent` par une image `next/image`
 * aux dimensions fixes, slide par slide.
 */
export type LandingSlide = {
  titleKey: I18nKey;
  ctaKey: I18nKey;
  href: string;
  /** Dégradé tailwind du fond (tokens du thème). */
  accent: string;
};

export const LANDING_SLIDES: LandingSlide[] = [
  // Acheteur : la promesse vérifiable — le paiement, pas la livraison.
  {
    titleKey: "hero.s1.t",
    ctaKey: "hero.s1.cta",
    href: "/catalogue",
    accent: "from-amber to-magenta",
  },
  // Diaspora : acheter pour la famille au pays → la grille des rayons.
  {
    titleKey: "hero.s2.t",
    ctaKey: "hero.s2.cta",
    href: "/#kategori",
    accent: "from-violet to-teal",
  },
  // Vendeur : la phrase historique du hero v1, descendue au rang de slide —
  // le parcours ne disparaît pas, il cesse de dominer.
  { titleKey: "home.h1", ctaKey: "home.cta.sell", href: "/vendre", accent: "from-gold to-amber" },
];
