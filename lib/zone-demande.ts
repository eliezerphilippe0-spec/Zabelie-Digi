import { zoneCouverte, type ZoneRemiseNoeud } from "@/lib/zone-remise";

/**
 * La demande par zone, prête à lire pour le recrutement (0162, docs/77 §12) —
 * logique PURE : ni base, ni réseau.
 *
 * Entrées : les clics « je cherche un vendeur ici » (un compteur par zone et par
 * jour, anonyme) et les zones que les vendeurs DÉCLARENT desservir (0158).
 * Sortie : pour chaque zone qui a reçu au moins un clic, le total et le nombre de
 * vendeurs qui déclarent y livrer (la zone elle-même, un ancêtre ou un descendant,
 * comme `zoneCouverte`).
 *
 * ⚠️ « Vendeurs » ne compte que ceux qui ont DÉCLARÉ une zone de service. Un
 * vendeur installé là sans rien déclarer n'y figure pas : le nombre est un plancher,
 * jamais « il n'y a personne ». L'écran le dit.
 *
 * Tri : le plus de demande d'abord ; à demande égale, la zone la moins desservie
 * d'abord — c'est là qu'un vendeur de plus change quelque chose.
 */
export type LigneDemande = { zone_id: string; hits: number };
export type LigneService = { seller_id: string; zone_id: string };
export type DemandeZone = { zoneId: string; hits: number; vendeurs: number };

export function demandeParZone(
  zones: readonly ZoneRemiseNoeud[],
  demandes: readonly LigneDemande[],
  services: readonly LigneService[],
): DemandeZone[] {
  const hitsParZone = new Map<string, number>();
  for (const d of demandes) {
    if (!Number.isFinite(d.hits) || d.hits <= 0) continue;
    hitsParZone.set(d.zone_id, (hitsParZone.get(d.zone_id) ?? 0) + d.hits);
  }
  const zonesParVendeur = new Map<string, string[]>();
  for (const s of services) {
    const liste = zonesParVendeur.get(s.seller_id);
    if (liste) liste.push(s.zone_id);
    else zonesParVendeur.set(s.seller_id, [s.zone_id]);
  }
  const lignes: DemandeZone[] = [];
  for (const [zoneId, hits] of hitsParZone) {
    let vendeurs = 0;
    for (const declarees of zonesParVendeur.values()) {
      if (zoneCouverte(zones, declarees, zoneId)) vendeurs++;
    }
    lignes.push({ zoneId, hits, vendeurs });
  }
  return lignes.sort((a, b) => b.hits - a.hits || a.vendeurs - b.vendeurs || a.zoneId.localeCompare(b.zoneId));
}
