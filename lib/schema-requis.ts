/**
 * Migrations dont le code déployé dépend de façon BLOQUANTE.
 *
 * Le dépôt vit avec une dérive assumée : le code part au déploiement, les
 * migrations s'appliquent à la main. La plupart dégradent — une colonne
 * absente fait perdre un filtre, une fonction absente fait perdre un
 * rattrapage, personne ne s'en aperçoit et rien ne casse.
 *
 * `0046` est une dépendance bloquante : sans elle, `zabelie_record_policy_acceptance`
 * n'existe pas et **toute création de fiche échoue**. Ce n'est pas une
 * dégradation, c'est une porte fermée — et elle se referme au pire moment,
 * devant l'un des vingt premiers vendeurs recrutés à la main. Un 500 à la
 * publication ne coûte pas une fiche à ce stade : il coûte la personne, qui
 * ne revient pas et qui en parle.
 *
 * `0151` porte désormais le reçu obligatoire des litiges Stripe. Une ancienne
 * version de la sonde peut omettre ses objets : son succès ne prouve pas leur présence.
 * D'où ce contrôle, qui tourne AVANT qu'un vendeur soit dans la pièce.
 */
export const MIGRATIONS_REQUISES = [
  {
    fichier: "0046_policy_acceptance.sql",
    pourquoi:
      "sans elle, toute création de fiche répond 500 " +
      "(zabelie_record_policy_acceptance introuvable)",
  },
  {
    fichier: "0151_zabelie_stripe_disputes.sql",
    pourquoi:
      "sans elle, les événements de litige Stripe restent en erreur 503 " +
      "(zabelie_record_stripe_dispute introuvable)",
  },
  {
    fichier: "0152_zabelie_product_media_review.sql",
    pourquoi: "sans elle, les mutations de couverture, photo et vidéo sont refusées avant Storage (503)",
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

export type VerdictPresenceObjets = {
  statut: VerdictSchema["statut"];
  message: string;
};

/** Une sonde ancienne peut réussir sans encore connaître les objets demandés. */
export function verifierPresenceObjets(input: {
  objets: ObjetRequis[] | null;
  erreur?: { message?: string } | null;
  requis: readonly string[];
}): VerdictPresenceObjets {
  if (input.erreur || !Array.isArray(input.objets) || input.objets.length === 0) {
    return { statut: "indetermine", message: "présence des objets requis non vérifiable : sonde indisponible" };
  }
  const absents: string[] = [];
  const nonVerifies: string[] = [];
  for (const objet of input.requis) {
    const lignes = input.objets.filter((row) => row?.objet === objet);
    if (lignes.some((row) => row.present === false)) absents.push(objet);
    else if (lignes.length !== 1 || lignes[0].present !== true) nonVerifies.push(objet);
  }
  if (absents.length > 0) {
    return { statut: "manquant", message: `objets explicitement absents : ${absents.join(" ; ")}` };
  }
  if (nonVerifies.length > 0) {
    return { statut: "indetermine", message: `présence non vérifiée (sonde incomplète) : ${nonVerifies.join(" ; ")}` };
  }
  return { statut: "ok", message: "tous les objets requis existent en base" };
}

const OBJETS_STRIPE_0151 = [
  "zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)",
  "zabelie_stripe_dispute_event_immutable()",
  "zabelie_stripe_dispute_events",
  "zabelie_stripe_dispute_event_immutable",
  "zabelie_stripe_dispute_event_no_truncate",
  "escrow_entries.dispute_frozen_at",
  "zabelie_operations_config.stripe_dispute_freeze_enabled",
] as const;

export const OBJETS_MEDIAS_0152 = [
  "zabelie_product_cover_review_guard()",
  "zabelie_product_cover_review",
  "zabelie_product_media_guard()",
  "zabelie_product_media_guard_trg",
] as const;

export type VerdictObjets =
  | { source: "présence"; statut: VerdictSchema["statut"]; message: string }
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
  if (!input.erreurObjets && Array.isArray(input.objets) && input.objets.length > 0) {
    // Conserver les diagnostics historiques, même si la sonde ne connaît
    // pas encore 0151. Une omission n'est en revanche pas une absence prouvée.
    const absents = input.objets.filter((o) => o?.present === false);
    if (absents.length > 0) {
      return {
        source: "présence",
        statut: "manquant",
        message: absents.map((o) => `${o.objet} — ${o.pourquoi}`).join(" ; "),
      };
    }
    const presence = verifierPresenceObjets({ objets: input.objets, requis: [...OBJETS_STRIPE_0151, ...OBJETS_MEDIAS_0152] });
    return {
      source: "présence",
      ...presence,
      message: presence.statut === "indetermine" ? `0151/0152 — ${presence.message}` : presence.message,
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
    statut: registre.statut === "ok" ? "indetermine" : registre.statut,
    message:
      prefixe +
      (registre.statut === "indetermine" ? registre.raison : registre.message) +
      (registre.statut === "ok" ? " ; présence des objets 0151/0152 non vérifiée" : ""),
  };
}
