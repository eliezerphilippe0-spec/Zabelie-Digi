/**
 * Migrations dont le code déployé dépend de façon BLOQUANTE.
 *
 * Le dépôt vit avec une dérive assumée : le code part au déploiement, les
 * migrations s'appliquent à la main. La plupart dégradent — une colonne
 * absente fait perdre un filtre, une fonction absente fait perdre un
 * rattrapage, personne ne s'en aperçoit et rien ne casse.
 *
 * `0046` est l'exception : sans elle, `zabelie_record_policy_acceptance`
 * n'existe pas et **toute création de fiche échoue**. Ce n'est pas une
 * dégradation, c'est une porte fermée — et elle se referme au pire moment,
 * devant l'un des vingt premiers vendeurs recrutés à la main. Un 500 à la
 * publication ne coûte pas une fiche à ce stade : il coûte la personne, qui
 * ne revient pas et qui en parle.
 *
 * D'où ce contrôle, qui tourne AVANT qu'un vendeur soit dans la pièce.
 */
export const MIGRATIONS_REQUISES = [
  {
    fichier: "0046_policy_acceptance.sql",
    pourquoi:
      "sans elle, toute création de fiche répond 500 " +
      "(zabelie_record_policy_acceptance introuvable)",
  },
] as const;

export type VerdictSchema =
  | { statut: "ok"; message: string }
  | { statut: "manquant"; manquantes: string[]; message: string }
  | { statut: "indetermine"; raison: string };

/**
 * Décision pure, testable sans base : le journal des migrations (`0041`)
 * contient-il tout ce dont le code déployé a besoin ?
 *
 * Une lecture impossible rend « indéterminé », JAMAIS « ok » — c'est le
 * troisième état qui manque à la plupart des contrôles, et celui qui évite
 * de prendre une panne de sonde pour une bonne nouvelle.
 */
export function verifierSchemaRequis(input: {
  lignes: { filename: string }[] | null;
  erreur?: { message?: string } | null;
}): VerdictSchema {
  if (input.erreur) {
    return {
      statut: "indetermine",
      raison: `journal des migrations illisible : ${input.erreur.message ?? "erreur inconnue"}`,
    };
  }
  if (input.lignes === null) {
    return { statut: "indetermine", raison: "journal des migrations absent" };
  }

  const appliquees = new Set(input.lignes.map((l) => l.filename));
  const manquantes = MIGRATIONS_REQUISES.filter((m) => !appliquees.has(m.fichier));

  if (manquantes.length === 0) {
    return {
      statut: "ok",
      message: "toutes les migrations dont le code dépend sont au journal",
    };
  }

  return {
    statut: "manquant",
    manquantes: manquantes.map((m) => m.fichier),
    message: manquantes
      .map((m) => `${m.fichier} — ${m.pourquoi}`)
      .join(" ; "),
  };
}
