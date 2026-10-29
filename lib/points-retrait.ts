import { zoneCouverte, type ZoneRemiseNoeud } from "./zone-remise";

/**
 * LES POINTS DE RETRAIT D'UNE ZONE (0082, docs/46 §3.2, docs/77 §12.6) — logique pure.
 *
 * La leçon de Jumia : dans un pays sans adresses normalisées, ce qui a tenu n'est pas la
 * livraison à domicile, ce sont les boutiques où l'on va chercher. `0082` en tient le
 * RÉPERTOIRE ; l'acheteur n'en a jamais vu une ligne. Ce module décide lesquels lui montrer.
 *
 * Aucun import de Supabase : le composant client du bouton d'achat le partage avec la page
 * du catalogue (même raison que `lib/zone-remise.ts`).
 *
 * ⚠️ CE QUE C'EST — un ANNUAIRE. Zabelie ne livre pas : un point de retrait n'est pas un
 * service de Zabelie, c'est une boutique qui accepte de remettre des colis, listée quand
 * l'accord avec elle est réel (`actif`). Aucune commission n'est affichée ni promise (le
 * montant est un arbitrage du porteur, non tranché), aucun frais n'est ajouté au paiement,
 * et choisir un point n'est pas un geste de la commande : l'acheteur et le vendeur
 * conviennent de la remise comme avant.
 */
export type PointRetrait = {
  id: string;
  nom: string;
  adresse: string;
  /** Téléphone professionnel de la boutique, ou `null`. */
  telefon: string | null;
  /** Toujours renseigné : un point sans zone ne peut pas être rapproché d'une destination. */
  zoneId: string;
  position: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lit les lignes brutes de `zabelie_pickup_points`. Une ligne mal formée ou sans zone est
 * IGNORÉE, jamais devinée : on ne montre pas à un acheteur une adresse dont on n'est pas sûr,
 * et une ligne en trop ne doit pas faire disparaître les autres.
 */
export function lirePointsRetrait(data: unknown): PointRetrait[] {
  if (!Array.isArray(data)) return [];
  const points: PointRetrait[] = [];
  for (const brut of data) {
    if (!brut || typeof brut !== "object") continue;
    const { id, nom, adresse, telefon, zone_id: zoneId, position } = brut as Record<string, unknown>;
    if (typeof id !== "string" || !UUID.test(id)) continue;
    if (typeof zoneId !== "string" || !UUID.test(zoneId)) continue;
    if (typeof nom !== "string" || nom.trim() === "") continue;
    if (typeof adresse !== "string" || adresse.trim() === "") continue;
    points.push({
      id,
      nom: nom.trim(),
      adresse: adresse.trim(),
      telefon: typeof telefon === "string" && telefon.trim() !== "" ? telefon.trim() : null,
      zoneId: zoneId.toLowerCase(),
      position: typeof position === "number" && Number.isInteger(position) ? position : 0,
    });
  }
  return points;
}

/**
 * Les points qui recouvrent une destination : dans la zone elle-même, dans un de ses
 * ancêtres (un point « à Delmas » sert un acheteur de « Delmas 33 ») ou dans un de ses
 * descendants (acheteur « Delmas » : un point au quartier Delmas 33 est dans sa commune).
 * Un quartier FRÈRE ne recouvre pas — même règle que la couverture d'un vendeur.
 *
 * Ordre : la zone exacte d'abord (le plus proche), puis la `position` donnée par l'admin,
 * puis le nom. Déterministe : deux affichages du même répertoire donnent la même liste.
 */
export function pointsPourZone(
  zones: readonly ZoneRemiseNoeud[],
  points: readonly PointRetrait[],
  destination: string | null,
  locale = "fr",
): PointRetrait[] {
  if (!destination) return [];
  return points
    .filter((p) => zoneCouverte(zones, [p.zoneId], destination))
    .sort((a, b) => {
      const exactA = a.zoneId === destination ? 0 : 1;
      const exactB = b.zoneId === destination ? 0 : 1;
      return exactA - exactB || a.position - b.position || a.nom.localeCompare(b.nom, locale);
    });
}

/**
 * Le lien `tel:` d'un numéro : chiffres et un « + » initial, rien d'autre. `null` quand il n'y
 * a aucun chiffre — le texte s'affiche alors sans lien plutôt qu'avec un `tel:` vide.
 */
export function lienTelephone(telefon: string): string | null {
  const chiffres = telefon.replace(/\D/g, "");
  if (chiffres === "") return null;
  return "tel:" + (telefon.trim().startsWith("+") ? "+" : "") + chiffres;
}
