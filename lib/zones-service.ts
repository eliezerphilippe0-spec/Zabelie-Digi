/**
 * Zones de service d'un vendeur (0158) — la logique PURE, sans base ni réseau.
 *
 * Le vendeur envoie la liste COMPLÈTE de ses zones ; la route n'écrit que la
 * différence. Écrire le delta plutôt que « tout effacer, tout réinsérer » évite
 * qu'un échec en cours de route ne laisse un vendeur sans aucune zone, et laisse
 * le garde de la base (plafond, zone fermée) juger seulement ce qui est NOUVEAU.
 */
export type PlanZones = {
  /** Zones demandées, sans doublon, dans l'ordre reçu. */
  finales: string[];
  ajouter: string[];
  retirer: string[];
};

export function planifierZones(actuelles: readonly string[], voulues: readonly string[]): PlanZones {
  const finales = [...new Set(voulues)];
  const avant = new Set(actuelles);
  const apres = new Set(finales);
  return {
    finales,
    ajouter: finales.filter((id) => !avant.has(id)),
    retirer: [...avant].filter((id) => !apres.has(id)),
  };
}

/** Plafond de zones qu'un client peut ENVOYER, indépendamment du plafond commercial (config en base). */
export const MAX_ZONES_PAR_REQUETE = 100;
