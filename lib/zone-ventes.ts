/**
 * LES VENTES DU VENDEUR, REGROUPÉES PAR ZONE DE REMISE (0161, docs/77 §12.5).
 *
 * Un vendeur qui remet en main propre fait des TOURNÉES : trois commandes à
 * Pétion-Ville, deux à Delmas. Une liste à plat l'oblige à relire chaque ligne pour
 * le voir. Ici on ne fait que RANGER ce que l'acheteur a lui-même déclaré — aucune
 * donnée nouvelle, aucune lecture de plus.
 *
 * Le libellé est le chemin « Département › Commune › Quartier » déjà produit par
 * `zonesDesCommandes` ; le tri alphabétique place côte à côte les quartiers d'une même
 * commune, qui partagent le même début de chemin.
 *
 * ⚠️ Les titres de groupe ne s'affichent que s'il y a AU MOINS DEUX groupes : un
 * vendeur dont toutes les commandes sont dans une même zone, ou sans zone, voit la
 * liste d'avant, inchangée. `afficherTitres` porte cette décision ; la page ne la
 * recompose pas.
 */
export type GroupeZone<T> = {
  /** Stable et unique : le libellé, ou `"__aucune__"` pour les commandes sans zone. */
  cle: string;
  /** `null` = commandes sans zone déclarée (physique d'avant 0161, ou zone fermée depuis). */
  libelle: string | null;
  items: T[];
};

export const CLE_SANS_ZONE = "__aucune__";

export function grouperParZone<T extends { order_id: string }>(
  items: readonly T[],
  zoneParCommande: ReadonlyMap<string, string>,
  locale = "fr",
): { groupes: GroupeZone<T>[]; afficherTitres: boolean } {
  const parCle = new Map<string, GroupeZone<T>>();
  for (const item of items) {
    const libelle = zoneParCommande.get(item.order_id) ?? null;
    const cle = libelle ?? CLE_SANS_ZONE;
    const groupe = parCle.get(cle) ?? { cle, libelle, items: [] };
    groupe.items.push(item); // l'ordre d'entrée est conservé : le plus ancien d'abord
    parCle.set(cle, groupe);
  }
  const groupes = [...parCle.values()].sort((a, b) => {
    // Les commandes sans zone en dernier : elles n'appartiennent à aucune tournée.
    if (a.libelle === null) return 1;
    if (b.libelle === null) return -1;
    return a.libelle.localeCompare(b.libelle, locale);
  });
  return { groupes, afficherTitres: groupes.length >= 2 };
}
