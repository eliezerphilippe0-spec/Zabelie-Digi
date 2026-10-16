/**
 * Compte éditeur AdSense de Zabelie (porteur, 2026-10-16). Identifiant PUBLIC :
 * il figure aussi dans `/ads.txt`, que n'importe qui peut lire.
 *
 * ⚠️ ÉTAPE 1 SEULEMENT : la validation du site par Google, par la balise meta
 * `google-adsense-account` (mise en page racine) et par `public/ads.txt`.
 * Aucune annonce, aucun script `adsbygoogle.js`, aucun cookie.
 *
 * Afficher des annonces demandera d'abord, dans cet ordre :
 *   1. le choix des pages (recommandation : pages de contenu seulement, jamais
 *      fiche, boutique, panier, paiement ni compte) ;
 *   2. le consentement, dont la fenêtre certifiée par Google pour les
 *      visiteurs d'Europe ;
 *   3. l'ouverture de la CSP sur ces seules pages (`frame-src` est `'none'`) ;
 *   4. une version v4 de la politique de confidentialité : son §6 dit
 *      aujourd'hui que Google ne reçoit de données que sur la page d'un
 *      vendeur qui a activé ses pixels.
 * `tests/adsense.test.ts` refuse tout chargement du script avant cela.
 */
export const ADSENSE_CLIENT = "ca-pub-5698281417193163";
