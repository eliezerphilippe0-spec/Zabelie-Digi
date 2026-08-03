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

/** Ce que rend `zabelie_objets_requis()` (0048). */
export type ObjetRequis = { objet: string; present: boolean; pourquoi: string };

export type VerdictObjets =
  | { source: "présence"; statut: "ok" | "manquant"; message: string }
  | { source: "registre"; statut: VerdictSchema["statut"]; message: string };

/**
 * Combine les deux sources, et **dit laquelle a répondu**.
 *
 * Le registre `0041` déclare, `zabelie_objets_requis()` (0048) constate. Tant
 * que `0048` n'est pas appliquée, on retombe sur la déclaration — mais on
 * l'étiquette, parce qu'un contrôle qui ne dit pas à quelle question il a
 * répondu rassure sans informer.
 *
 * Ordre voulu : la présence d'abord. Un registre qui affirme une fonction
 * absente est le seul cas VERT-mais-cassé, et c'est celui qu'on veut fermer.
 */
export function verdictObjets(input: {
  objets: ObjetRequis[] | null;
  erreurObjets?: { message?: string } | null;
  lignesRegistre: { filename: string }[] | null;
  erreurRegistre?: { message?: string } | null;
}): VerdictObjets {
  if (input.objets && input.objets.length > 0) {
    const absents = input.objets.filter((o) => !o.present);
    return absents.length === 0
      ? {
          source: "présence",
          statut: "ok",
          message: "tous les objets requis existent en base",
        }
      : {
          source: "présence",
          statut: "manquant",
          message: absents.map((o) => `${o.objet} — ${o.pourquoi}`).join(" ; "),
        };
  }

  // `0048` pas encore appliquée, ou lecture en échec : on retombe sur la
  // DÉCLARATION, en le disant.
  const registre = verifierSchemaRequis({
    lignes: input.lignesRegistre,
    erreur: input.erreurRegistre,
  });
  const prefixe =
    "présence non vérifiable (0048 non appliquée ?) — repli sur le registre : ";
  return {
    source: "registre",
    statut: registre.statut,
    message:
      prefixe +
      (registre.statut === "indetermine" ? registre.raison : registre.message),
  };
}
