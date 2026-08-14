/**
 * Lien WhatsApp de la plateforme — le canal d'acquisition réel du marché.
 *
 * DEUX MODES, par ordre de priorité :
 *
 * 1. `NEXT_PUBLIC_WHATSAPP_LINK` — le **lien court WhatsApp Business**
 *    (`https://wa.me/message/XXXX`, créé dans l'app Business → Outils
 *    professionnels → Lien court). C'est le mode voulu par le porteur
 *    (décision du 2026-08-14) : le numéro n'apparaît NULLE PART, ni à
 *    l'écran ni dans l'URL. ⚠️ Le lien court porte son propre message
 *    d'accueil configuré dans l'app — le `prefill` par page est ignoré.
 * 2. `NEXT_PUBLIC_WHATSAPP_NUMBER` — le repli historique : lien
 *    `wa.me/<numéro>` avec message pré-rempli. Le numéro reste alors
 *    visible dans l'URL (c'est la définition de `wa.me`), mais plus
 *    jamais affiché en clair sur les pages.
 *
 * Contrat inchangé : `null` tant qu'aucune des deux variables n'est posée,
 * et TOUTE surface qui consomme ce lien se masque alors entièrement. Un
 * bouton « Pale ak nou » qui ouvre une conversation avec personne est pire
 * que pas de bouton.
 *
 * ─── L'AFFICHAGE DU NUMÉRO EN CLAIR A ÉTÉ RETIRÉ (2026-08-14) ───────────────
 * L'ancienne `whatsappAffichage()` rendait le numéro lisible sur le rail
 * (maquette initiale : beaucoup enregistrent le contact à la main). Le
 * porteur a tranché l'inverse — numéro caché — et la fonction est SUPPRIMÉE,
 * pas contournée : la retirer casse la compilation de toute surface qui
 * l'afficherait encore, c'est le garde.
 *
 * ⚠️ Distinct du partage « je cherche ce produit » du capteur de demande
 * (`wa.me/?text=` SANS numéro — l'acheteur choisit son destinataire). Ici
 * c'est la plateforme qu'on contacte ; là-bas c'est le réseau de l'acheteur
 * qu'on active. Ne pas fusionner les deux.
 */
export function whatsappHref(prefill?: string): string | null {
  // Mode 1 : le lien court Business, prioritaire. On ne l'accepte que chez
  // WhatsApp — un lien arbitraire posé par erreur ne doit pas devenir le
  // bouton de contact du site.
  const lien = process.env.NEXT_PUBLIC_WHATSAPP_LINK?.trim();
  if (lien) {
    if (/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(lien)) {
      return lien;
    }
    // Lien invalide : on l'IGNORE et on le dit, puis repli sur le numéro —
    // une variable mal collée ne doit pas éteindre le canal en silence.
    console.warn("[whatsapp] NEXT_PUBLIC_WHATSAPP_LINK invalide, repli numéro");
  }

  // Mode 2 : le numéro.
  const brut = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!brut) return null;
  // wa.me exige le format international SANS `+` ni séparateurs.
  const numero = brut.replace(/\D/g, "");
  if (numero.length < 8) return null; // un numéro tronqué n'est pas un numéro
  const texte = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return `https://wa.me/${numero}${texte}`;
}
