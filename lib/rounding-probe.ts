import { ROUNDING_IN_FORCE, type RoundingRule } from "@/lib/commission";

/**
 * Le miroir a-t-il raison ?
 *
 * `ROUNDING_IN_FORCE` (`lib/commission.ts`) affirme quelle règle d'arrondi
 * tourne en base. C'est une constante réglée à la main : elle dit la vérité
 * tant que quelqu'un pense à la changer en même temps que la migration. Or
 * « quelqu'un pense à » est exactement la garantie qui a déjà lâché ici — le
 * miroir qui reflète la règle SOUHAITÉE plutôt que la règle DÉPLOYÉE.
 *
 * Cette sonde compare l'affirmation au journal d'application des migrations
 * (`zabelie_schema_migrations`, 0041) : si `0044` y figure, la base arrondit
 * au vendeur (`floor`) ; sinon elle arrondit au plus proche (`round`).
 *
 * ⚠️ Ce qu'elle prouve exactement, et pas plus : que la constante s'accorde
 * avec ce que le JOURNAL dit avoir été appliqué. Le journal est lui-même
 * tenu à la main. Elle transforme donc un miroir sans contrepartie en deux
 * affirmations indépendantes qui peuvent se contredire — ce qui est un cran
 * mieux, pas une preuve. La seule vérification qui ferme la boucle reste le
 * relevé de la première commande : comparer ce qui est AFFICHÉ au vendeur à
 * ce qui est CRÉDITÉ au grand livre (`docs/22`).
 */

export const MIGRATION_ARRONDI = "0044_commission_floor.sql";

export type RoundingProbe =
  | { statut: "accord"; regleBase: RoundingRule; constante: RoundingRule }
  | {
      statut: "desaccord";
      regleBase: RoundingRule;
      constante: RoundingRule;
      message: string;
    }
  | { statut: "indetermine"; raison: string };

/**
 * Décision pure, testable sans base. `lignes` = contenu de
 * `zabelie_schema_migrations` ; `erreur` = échec de lecture éventuel.
 *
 * Une lecture impossible ne rend JAMAIS « accord » : l'absence de signal est
 * un signal (`CLAUDE.md`). Elle rend « indéterminé », qui se voit dans la
 * réponse et dans les journaux.
 */
export function evaluerArrondi(input: {
  lignes: { filename: string }[] | null;
  erreur?: { message?: string } | null;
  constante?: RoundingRule;
}): RoundingProbe {
  const constante = input.constante ?? ROUNDING_IN_FORCE;

  if (input.erreur) {
    return {
      statut: "indetermine",
      raison: `journal des migrations illisible : ${input.erreur.message ?? "erreur inconnue"}`,
    };
  }
  if (input.lignes === null) {
    return { statut: "indetermine", raison: "journal des migrations absent" };
  }

  const regleBase: RoundingRule = input.lignes.some(
    (l) => l.filename === MIGRATION_ARRONDI,
  )
    ? "floor"
    : "round";

  if (regleBase === constante) return { statut: "accord", regleBase, constante };

  // Les deux désaccords ne se valent pas — l'un rend au vendeur plus que
  // promis, l'autre lui promet plus qu'il ne touche. Le second est le seul
  // qui abîme quelqu'un.
  const message =
    constante === "floor"
      ? `L'application annonce « l'arrondi va au vendeur » alors que ${MIGRATION_ARRONDI} ` +
        "n'est PAS au journal : l'estimation promet jusqu'à 1 HTG de plus par vente " +
        "que ce que la base crédite. Corriger en priorité — appliquer la migration, " +
        "ou repasser ROUNDING_IN_FORCE à « round »."
      : `${MIGRATION_ARRONDI} est au journal mais l'application annonce encore ` +
        "« arrondi au plus proche » : la base est plus généreuse que l'annonce. " +
        "Sens sûr, mais l'annonce est fausse — passer ROUNDING_IN_FORCE à « floor » " +
        "et redéployer.";

  return { statut: "desaccord", regleBase, constante, message };
}
