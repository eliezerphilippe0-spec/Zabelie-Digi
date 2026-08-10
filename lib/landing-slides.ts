import type { I18nKey } from "@/lib/i18n";
import { whatsappAffichage, whatsappHref } from "@/lib/whatsapp";

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
  /**
   * Chiffre-choc facultatif (clé i18n), ex. « 0 HTG ». Optionnel à dessein :
   * un slide sans chiffre vrai à annoncer n'en invente pas un.
   */
  badgeKey?: I18nKey;
  /** Le slide propose-t-il WhatsApp en second geste ? */
  whatsapp?: boolean;
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
    // `from-violet to-teal` rendait ORANGE→VERT : `--color-violet` a été
    // remappé sur l'orange #f5934f au changement de palette (2026-07-25) mais
    // `--color-teal` est resté le vert succès #8fbf6f. Un résidu du remapping,
    // vu par l'audit externe du 2026-08-10 (« le dégradé vert-orange affaiblit
    // l'identité ») — la rampe reste désormais dans la famille orange, comme
    // les deux autres slides.
    accent: "from-brand to-amber",
  },
  // Vendeur : la phrase historique du hero v1, descendue au rang de slide —
  // le parcours ne disparaît pas, il cesse de dominer.
  // Vendeur : c'est le slide que le porteur a choisi de mettre en avant
  // (2026-08-09). Il porte le chiffre — 0 HTG pour ouvrir — et le second
  // geste WhatsApp, parce que sur ce marché l'inscription commence souvent
  // par un message, pas par un formulaire.
  //
  // « 0 HTG » et non « 0 GDES » : c'est le code de la gourde utilisé dans
  // tout le dépôt, et un sigle inventé sur une bannière qui parle d'argent
  // se paie cher.
  {
    // `home.h1` plutôt que `rail.shop.t` : la phrase historique du hero v1
    // dit la même chose EN MIEUX (« depuis votre téléphone, sans avance »), et
    // la garder ici lui rend son site d'appel. C'est le contrôle des clés
    // mortes qui a signalé sa disparition, pas une relecture.
    titleKey: "home.h1",
    ctaKey: "home.cta.sell",
    href: "/vendre",
    accent: "from-gold to-amber",
    badgeKey: "rail.shop.free",
    whatsapp: true,
  },
];

/**
 * Le SECOND GESTE d'un slide — aujourd'hui WhatsApp, demain autre chose.
 *
 * Extrait de `app/page.tsx` pour être ÉPROUVABLE : la logique y était en
 * ligne dans un composant serveur, donc hors de portée d'un test. Une
 * mutation l'a montré — retirer la garde du numéro ne faisait rougir aucun
 * contrôle, alors que la conséquence est un bouton de contact vers personne,
 * exactement ce que `lib/whatsapp.ts` s'engage à ne jamais produire.
 *
 * Contrat : les DEUX champs, ou AUCUN. Un lien sans libellé afficherait un
 * bouton vide ; un libellé sans lien, un bouton mort.
 */
export function secondGeste(
  slide: LandingSlide,
  prefill: string
): { href: string; cta: string } | null {
  if (!slide.whatsapp) return null;
  const href = whatsappHref(prefill);
  const cta = whatsappAffichage();
  if (!href || !cta) return null;
  return { href, cta };
}
