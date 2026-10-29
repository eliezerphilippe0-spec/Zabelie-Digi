import { paramsCatalogue } from "@/lib/zone-acheteur";
import type { Zone } from "@/lib/zones";

/**
 * PARTAGER LE CATALOGUE D'UNE ZONE (docs/77 §12.7, lot G) — la logique PURE.
 *
 * La leçon de TikTok Shop : un lien qui porte son contexte. Ici, le contexte est la zone :
 * « les produits et vendeurs de Delmas » s'envoie en un geste, et celui qui l'ouvre arrive
 * sur le catalogue DÉJÀ filtré — le filtre « Zone » (`zd`, `zk`, `zq`) existait, ce qui
 * manquait est l'envoi.
 *
 * ⚠️ AUCUNE DONNÉE n'est stockée, ni lue ailleurs que dans l'URL de la page courante : le
 * lien est fabriqué à partir de la zone du FILTRE actif (jamais du cookie `zabelie_zone` :
 * la politique ne le déclare que pour classer les offres), il ne porte que les trois
 * identifiants de zone — pas de paramètre de suivi, pas d'identifiant de personne — et le
 * navigateur n'écrit rien. L'envoi lui-même est un lien WhatsApp ouvert par l'acheteur,
 * comme « Inviter un vendeur » (lot B) : c'est lui qui choisit le destinataire.
 */

/**
 * L'adresse absolue du catalogue filtré sur cette zone, ou `null` si la zone n'est pas dans
 * la liste (`paramsCatalogue` rend `""` : pas de lien plutôt qu'un lien qui filtrerait à
 * contresens).
 */
export function lienCatalogueZone(base: string, zones: readonly Zone[], zone: Zone): string | null {
  const params = paramsCatalogue(zones, zone);
  return params ? `${base.replace(/\/+$/, "")}/catalogue?${params}` : null;
}

/** Le lien d'envoi WhatsApp d'un message : le texte est encodé en entier, rien d'autre n'est ajouté. */
export function lienPartageWhatsApp(texte: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texte)}`;
}
