/**
 * Lien WhatsApp de la plateforme — le canal d'acquisition réel du marché.
 *
 * Le numéro vit dans `NEXT_PUBLIC_WHATSAPP_NUMBER` (variable Vercel, posée par
 * le porteur — registre `docs/11-SECRETS.md`), JAMAIS en dur : un numéro de
 * téléphone committé survit à tous les changements d'opérateur.
 *
 * Contrat : `null` tant que la variable est absente, et TOUTE surface qui
 * consomme ce lien se masque alors entièrement. Un bouton « Pale ak nou » qui
 * ouvre une conversation avec personne est pire que pas de bouton.
 *
 * ⚠️ Distinct du partage « je cherche ce produit » du capteur de demande
 * (`wa.me/?text=` SANS numéro — l'acheteur choisit son destinataire). Ici
 * c'est la plateforme qu'on contacte ; là-bas c'est le réseau de l'acheteur
 * qu'on active. Ne pas fusionner les deux.
 */
export function whatsappHref(prefill?: string): string | null {
  const brut = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!brut) return null;
  // wa.me exige le format international SANS `+` ni séparateurs.
  const numero = brut.replace(/\D/g, "");
  if (numero.length < 8) return null; // un numéro tronqué n'est pas un numéro
  const texte = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return `https://wa.me/${numero}${texte}`;
}

/**
 * Le numéro, LISIBLE — la maquette porteur l'affiche en clair dans le rail,
 * et elle a raison : sur ce marché beaucoup enregistrent le contact à la main
 * ou appellent depuis un autre téléphone. Un lien `wa.me` seul ne le permet
 * pas.
 *
 * Même contrat que `whatsappHref` : `null` si la variable est absente, et la
 * surface se masque entièrement. Format haïtien : `+509 XXXX XXXX`.
 * Tout autre indicatif est rendu tel quel, groupé par blocs de deux — mieux
 * vaut un espacement imparfait qu'un numéro déformé par une règle qui ne le
 * concerne pas.
 */
export function whatsappAffichage(): string | null {
  const brut = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;
  if (!brut) return null;
  const n = brut.replace(/\D/g, "");
  if (n.length < 8) return null;
  if (n.startsWith("509") && n.length === 11) {
    return `+509 ${n.slice(3, 7)} ${n.slice(7)}`;
  }
  return `+${n}`;
}
