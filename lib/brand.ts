/**
 * Les chaînes et couleurs de marque — UNE SEULE FOIS.
 *
 * Ce module existe à cause d'une divergence mesurée le 2026-08-11 : le
 * monogramme vivait en deux exemplaires, `components/brand-logo.tsx` et
 * `app/icon.svg`, et le second peignait encore le Z dans une encre que le
 * thème avait abandonnée. L'onglet du navigateur montrait un autre logo que
 * l'en-tête, et personne ne pouvait le voir — une différence de teinte à 16 px
 * ne se regarde pas.
 *
 * Le manifeste PWA allait recréer exactement la même situation avec le titre
 * et la description du site, déjà écrits dans `app/layout.tsx`. Une source
 * unique vaut mieux qu'un contrôle croisé sur deux copies : le croisement
 * rattrape la divergence, la source unique l'empêche.
 *
 * ⚠️ `app/icon.svg` reste une copie inévitable — un favicon est chargé hors du
 * DOM, les variables CSS n'y résolvent pas, et un fichier `.svg` statique ne
 * peut pas importer ce module. C'est `tests/logo-deux-copies.test.ts` qui la
 * tient.
 */

export const SITE_TITLE = "Zabelie — La marketplace haïtienne";

export const SITE_DESCRIPTION =
  "Achetez et vendez en Haïti : produits, talents, recharge téléphonique. Paiement mobile money, pensé pour la 3G.";

/** Nom court — contrainte de plateforme : Android tronque au-delà de ~12
 *  caractères sous l'icône de l'écran d'accueil. */
export const SITE_SHORT_NAME = "Zabelie";

/** = `--color-ink` de `app/zabelie-theme.css`. Croisé par `tests/pwa-manifeste`. */
export const BRAND_INK = "#0a0a0a";
