import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * LE CHEMIN D'ARGENT, LU DANS LES FAITS — pas dans la configuration.
 *
 * ─── POURQUOI CE FICHIER EXISTE ────────────────────────────────────────────
 *
 * Mesuré en production le 2026-09-01, et c'est le seul argument qui compte :
 *
 *   • **7 tentatives d'achat, 3 acheteurs distincts, 5 jours différents**,
 *     du 2026-08-11 au 2026-08-22 ;
 *   • **toutes** terminées en `moncash_unknown_48h` — MonCash répond 404, il
 *     ne connaît pas la transaction ;
 *   • `payments.raw->>'moncash_mode'` vaut `sandbox` sur celles qui le
 *     portent, `production` sur AUCUNE ;
 *   • zéro encaissement réel depuis l'origine du projet.
 *
 * Le diagnostic avait déjà été posé le 2026-08-21 — par le porteur, cliquant
 * « Peye ak MonCash » et lisant `sandbox.moncashbutton…` dans la barre
 * d'adresse — et l'instrumentation qui inscrit le mode et l'hôte en base a été
 * ajoutée dans la foulée (`lib/moncash.ts`, `CreatePaymentResult`).
 *
 * ⚠️ **ET UNE HUITIÈME TENTATIVE A ÉCHOUÉ LE 2026-08-22, APRÈS TOUT ÇA, SANS
 * QUE PERSONNE NE L'APPRENNE.** La donnée était écrite, correcte, horodatée —
 * et aucun code ne la lisait. C'est le motif que `CLAUDE.md` nomme « le code
 * sans appelant », arrivé cette fois sur une COLONNE plutôt que sur une
 * fonction : un fait consigné que rien n'interroge ne vaut pas mieux qu'un
 * fait jamais consigné.
 *
 * ─── CE QUE CETTE SONDE AJOUTE À `sondeMonCash()` ──────────────────────────
 *
 * `sondeMonCash()` (`lib/moncash.ts`) lit l'ENVIRONNEMENT : quel mode la
 * variable annonce, maintenant. Elle ne sait rien de ce qui s'est passé.
 *
 * Celle-ci lit la BASE : par où les paiements sont réellement partis. Les deux
 * sont nécessaires, et c'est leur DÉSACCORD qui porte l'information la plus
 * chère — une variable posée sur `production` pendant que les paiements
 * continuent de partir en bac à sable (déploiement non promu, cache de build,
 * variable posée sur le mauvais environnement) est exactement le genre de
 * panne qu'aucune des deux ne voit seule.
 *
 * ─── FAIL-OPEN, DÉLIBÉRÉMENT ───────────────────────────────────────────────
 *
 * Ne lève JAMAIS. Une sonde qui casse la route de cohérence ferait perdre les
 * contrôles comptables pour un contrôle d'observabilité — mauvais échange. En
 * cas d'échec elle rend `indetermine`, qui se distingue de `ok` : « la sonde
 * n'a pas tourné » et « la sonde n'a rien trouvé » ne doivent pas produire le
 * même vide.
 */

/** Fenêtre de lecture. Bornée pour ne pas scanner tout l'historique à chaque
 *  passage du cron ; 90 jours couvrent très largement le TTL de 48 h. */
export const FENETRE_JOURS = 90;
export const PLAFOND_LIGNES = 1000;

export type VerdictCheminArgent =
  /** Personne n'a jamais tenté de payer. Rien à conclure du rail. */
  | "aucune_tentative"
  /** Des paiements sont partis vers le BAC À SABLE : aucun argent réel ne
   *  pouvait bouger, quoi qu'en dise la configuration. */
  | "bac_a_sable"
  /** L'environnement annonce un mode, les paiements en ont traversé un autre. */
  | "divergence"
  /** Des tentatives, aucune en bac à sable constatée, et pourtant zéro
   *  encaissement réel. La cause est ailleurs — à chercher, pas à supposer. */
  | "aucun_encaissement"
  /** Au moins un encaissement réel a eu lieu. Le rail a fonctionné une fois. */
  | "ok"
  /** La sonde n'a pas pu lire. Ce n'est PAS un verdict favorable. */
  | "indetermine";

export type SondeCheminArgent = {
  verdict: VerdictCheminArgent;
  tentatives: number;
  confirmes: number;
  /** Confirmés ET portant un montant > 0. Un rail gratuit (`0087`) confirme
   *  sans qu'aucune gourde ne circule : le compter comme un encaissement
   *  ferait passer le chemin d'argent pour éprouvé alors qu'il ne l'est pas. */
  encaissementsReels: number;
  expires48h: number;
  acheteursEnEchec: number;
  modesObserves: { sandbox: number; production: number; nonConsigne: number };
  derniereTentative: string | null;
  dernierEncaissementReel: string | null;
  explication: string;
};

type LignePaiement = {
  status: string | null;
  created_at: string | null;
  confirmed_at: string | null;
  raw: { moncash_mode?: string | null; expired_reason?: string | null } | null;
  order: { amount_htg?: number | null; buyer_id?: string | null } | null;
};

function vide(explication: string): SondeCheminArgent {
  return {
    verdict: "indetermine",
    tentatives: 0,
    confirmes: 0,
    encaissementsReels: 0,
    expires48h: 0,
    acheteursEnEchec: 0,
    modesObserves: { sandbox: 0, production: 0, nonConsigne: 0 },
    derniereTentative: null,
    dernierEncaissementReel: null,
    explication,
  };
}

/**
 * @param modeConfigure  ce que `sondeMonCash().mode` annonce, pour croiser
 *   l'annonce avec le constat. `null` = on ne croise pas.
 */
export async function sondeCheminArgent(
  admin: SupabaseClient,
  modeConfigure: string | null
): Promise<SondeCheminArgent> {
  let lignes: LignePaiement[];
  try {
    const depuis = new Date(Date.now() - FENETRE_JOURS * 86400_000).toISOString();
    const { data, error } = await admin
      .from("payments")
      .select("status, created_at, confirmed_at, raw, order:orders(amount_htg, buyer_id)")
      .gte("created_at", depuis)
      .order("created_at", { ascending: false })
      .limit(PLAFOND_LIGNES);
    if (error) return vide(`lecture impossible — ${error.message}`);
    lignes = ((data ?? []) as unknown as LignePaiement[]).map((l) => ({
      ...l,
      // PostgREST rend une jointure to-one soit en objet, soit en tableau
      // d'un élément selon la forme de la relation. Les deux se présentent
      // ici, et un `l.order.amount_htg` sur un tableau vaut `undefined` en
      // silence — donc zéro encaissement réel, donc un verdict FAUX.
      order: Array.isArray(l.order) ? (l.order[0] ?? null) : l.order,
    }));
  } catch (e) {
    return vide(`lecture impossible — ${e instanceof Error ? e.message : "erreur"}`);
  }

  const modeDe = (l: LignePaiement) => l.raw?.moncash_mode ?? null;
  const montantDe = (l: LignePaiement) => l.order?.amount_htg ?? 0;

  const confirmes = lignes.filter((l) => l.status === "confirmed");
  const reels = confirmes.filter((l) => montantDe(l) > 0);
  const echecs = lignes.filter((l) => l.status === "failed");

  const modesObserves = {
    sandbox: lignes.filter((l) => modeDe(l) === "sandbox").length,
    production: lignes.filter((l) => modeDe(l) === "production").length,
    nonConsigne: lignes.filter((l) => modeDe(l) === null).length,
  };

  const s: Omit<SondeCheminArgent, "verdict" | "explication"> = {
    tentatives: lignes.length,
    confirmes: confirmes.length,
    encaissementsReels: reels.length,
    expires48h: lignes.filter((l) => l.raw?.expired_reason === "moncash_unknown_48h").length,
    acheteursEnEchec: new Set(
      echecs.map((l) => l.order?.buyer_id).filter((b): b is string => !!b)
    ).size,
    modesObserves,
    derniereTentative: lignes[0]?.created_at ?? null,
    dernierEncaissementReel: reels[0]?.confirmed_at ?? null,
  };

  /* ── L'ORDRE DES VERDICTS EST LA DÉCISION DE CE FICHIER ──────────────────
   *
   * Le bac à sable passe AVANT le succès. Un encaissement réel n'annule pas
   * le fait que des paiements partent en bac à sable : les deux peuvent
   * coexister (variable posée sur un seul environnement, déploiement partiel),
   * et c'est précisément le cas le plus dangereux — celui où un chiffre vert
   * couvre une fuite. */
  if (modesObserves.sandbox > 0) {
    return {
      ...s,
      verdict: "bac_a_sable",
      explication:
        `${modesObserves.sandbox} paiement(s) sont partis vers le BAC À SABLE MonCash : ` +
        `aucun argent réel ne pouvait bouger. Poser MONCASH_MODE=production et les ` +
        `identifiants du compte marchand, puis REDÉPLOYER — une variable posée ne ` +
        `s'applique qu'au déploiement suivant.`,
    };
  }
  if (
    modeConfigure &&
    modesObserves.production > 0 &&
    modeConfigure !== "production"
  ) {
    return {
      ...s,
      verdict: "divergence",
      explication:
        `L'environnement annonce « ${modeConfigure} » et des paiements sont pourtant ` +
        `partis en production. Annonce et constat divergent : ne se fier ni à l'un ni ` +
        `à l'autre avant d'avoir tranché.`,
    };
  }
  if (s.tentatives === 0) {
    return {
      ...s,
      verdict: "aucune_tentative",
      explication:
        `Aucune tentative de paiement sur ${FENETRE_JOURS} jours. Le rail n'est ni ` +
        `prouvé ni infirmé — un compteur à zéro n'atteste que de l'absence de regard.`,
    };
  }
  if (s.encaissementsReels === 0) {
    return {
      ...s,
      verdict: "aucun_encaissement",
      explication:
        `${s.tentatives} tentative(s), ${s.acheteursEnEchec} acheteur(s) distinct(s) en ` +
        `échec, et AUCUN encaissement réel. Le mode bac à sable n'est pas constaté : ` +
        `la cause est ailleurs et reste à établir.`,
    };
  }
  return {
    ...s,
    verdict: "ok",
    explication:
      `${s.encaissementsReels} encaissement(s) réel(s). Le chemin d'argent a fonctionné.`,
  };
}

/** Le verdict appelle-t-il une alerte ? `indetermine` en fait partie : une
 *  sonde qui n'a pas pu lire ne dit PAS que tout va bien. */
export function alerteRequise(v: VerdictCheminArgent): boolean {
  return v === "bac_a_sable" || v === "divergence" || v === "aucun_encaissement" || v === "indetermine";
}
