/**
 * SOMME D'UNE COLONNE DE MONTANTS — complète, ou dite incomplète.
 *
 * ─── LE DÉFAUT QU'ELLE REMPLACE ────────────────────────────────────────────
 * Deux totaux d'argent étaient calculés en rapatriant les lignes avec un
 * `.limit(1000)` puis en les sommant en mémoire :
 *   • le GMV de `/admin` (`orders.amount_htg`, statuts payés) ;
 *   • les revenus nets du vendeur (`wallet_transactions`, crédits).
 * Au-delà de 1 000 lignes, ces chiffres devenaient faux VERS LE BAS, sans
 * rien signaler. C'est la forme de défaut que ce dépôt documente jusqu'à
 * l'obsession : l'échec se présente comme un résultat plausible. Un vendeur
 * lisant « Revenus nets » amputés n'a aucun moyen de savoir que le nombre est
 * tronqué — il conclura que la plateforme lui doit moins qu'elle ne lui doit.
 *
 * Le grand livre lui-même n'était pas en cause : l'invariant `0033` est
 * contrôlé en SQL. C'est l'AFFICHAGE qui dérivait, et un affichage d'argent
 * faux se défend devant quelqu'un, pas devant un test.
 *
 * ─── POURQUOI PAR LOTS, ET PAS PAR UNE FONCTION SQL ────────────────────────
 * Une somme `sum()` en base serait plus courte. Elle exigerait une migration,
 * et dans ce dépôt une migration RÉDIGÉE n'est pas une migration APPLIQUÉE :
 * le code se déploie seul, les migrations sont appliquées à la main. Un
 * correctif d'affichage qui attend un geste du porteur est un correctif qui
 * n'est pas en ligne. Le parcours par lots marche le jour où il est fusionné.
 *
 * ─── CE QU'ELLE PROMET, ET CE QU'ELLE REFUSE DE PROMETTRE ──────────────────
 * Elle rend `complet: false` plutôt que de mentir. L'appelant DOIT le dire à
 * l'écran — le préfixe « ≥ » y suffit, et il n'a pas de langue. Rendre un
 * nombre nu quand on sait qu'il est partiel reproduirait exactement le défaut
 * qu'on répare, avec un plafond plus haut.
 */

/** Taille d'un lot. PostgREST plafonne les réponses ; 1 000 est confortable. */
export const LOT = 1000;

/**
 * Nombre maximal de lots. 50 000 lignes — largement au-delà de tout volume
 * réaliste pour une page rendue à chaque visite, et une borne DURE : sans
 * elle, une erreur de filtre transformerait un tableau de bord en boucle qui
 * parcourt la table entière à chaque affichage.
 */
export const PLAFOND_LOTS = 50;

export type SommeHTG = {
  /** Total en entiers — jamais de flottant sur de l'argent (règle dure n°3). */
  total: number;
  /** Nombre de lignes réellement additionnées. */
  lignes: number;
  /** `false` = le total est PARTIEL. L'appelant doit le dire à l'écran. */
  complet: boolean;
};

type Lot = { data: { amount_htg: number }[] | null; error: { message: string } | null };

/**
 * Additionne `amount_htg` sur toutes les lignes que `lot` sait rendre.
 *
 * `lot(de, a)` reçoit des bornes INCLUSIVES aux deux extrémités, comme
 * `.range()` de PostgREST — c'est volontairement la même convention, pour que
 * l'appelant n'ait aucune conversion à faire et donc aucune erreur de ±1 à
 * commettre.
 */
export async function sommeHTG(
  lot: (de: number, a: number) => PromiseLike<Lot>,
  etiquette: string
): Promise<SommeHTG> {
  let total = 0;
  let lignes = 0;

  for (let i = 0; i < PLAFOND_LOTS; i++) {
    const de = i * LOT;
    const { data, error } = await lot(de, de + LOT - 1);

    if (error) {
      /* Une somme partielle par erreur reste une somme partielle : on la rend
       * marquée plutôt que de rendre zéro. Zéro se lirait comme « ce vendeur
       * n'a rien gagné », ce qui est un mensonge plus grave que « au moins ». */
      journal(etiquette, "lot_en_erreur", { lot: i, lignes, message: error.message });
      return { total, lignes, complet: false };
    }

    const rangee = data ?? [];
    for (const r of rangee) total += r.amount_htg;
    lignes += rangee.length;

    // Un lot incomplet est le DERNIER : il n'y a plus rien après.
    if (rangee.length < LOT) {
      if (i > 0) journal(etiquette, "somme_multi_lots", { lots: i + 1, lignes });
      return { total, lignes, complet: true };
    }
  }

  journal(etiquette, "plafond_de_lots_atteint", { lots: PLAFOND_LOTS, lignes });
  return { total, lignes, complet: false };
}

/* Corollaire d'observabilité du dépôt : « n'a pas tourné » et « a tourné, tout
 * tenait dans un lot » doivent se distinguer. On ne journalise donc PAS le cas
 * ordinaire — une page rendue à chaque visite en ferait du bruit — mais tout
 * ce qui sort de l'ordinaire porte une trace nommée. */
function journal(etiquette: string, issue: string, extra: Record<string, unknown>) {
  console.log(
    "[somme]",
    JSON.stringify({
      at: new Date().toISOString(),
      code: "ZB085",
      source: etiquette,
      issue,
      ...extra,
    })
  );
}
