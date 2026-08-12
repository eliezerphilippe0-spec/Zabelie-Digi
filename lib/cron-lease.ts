import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * BAIL D'EXÉCUTION D'UN CRON — un seul porteur à la fois (migration `0060`).
 *
 * Pattern repris d'Izikit (`leader-lease`), réécrit pour Supabase : la base
 * qui porte déjà toute la vérité du projet sert aussi de point de
 * rendez-vous. Ni Redis, ni service tiers, ni seconde base.
 *
 * ⚠️ CE QUE CE MODULE NE CORRIGE PAS. Mesuré avant de l'écrire : les sept
 * crons du dépôt sont déjà sûrs en concurrence, chacun par son propre moyen
 * (`for update skip locked`, instruction atomique unique, idempotence). Ce
 * bail ne répare rien ; il rend la sûreté STRUCTURELLE au lieu de la laisser
 * dépendre du soin de chaque auteur. Le huitième cron en héritera sans y
 * penser — c'est tout l'objet.
 *
 * ⚠️ SCHÉMA EN RETARD. Si `0060` n'est pas appliquée, `avecBail` LAISSE
 * PASSER le travail et le journalise. Le choix est délibéré et il est
 * fail-open, contrairement à l'habitude du dépôt : un bail est une garantie
 * ADDITIONNELLE, pas une condition de correction. Refuser de balayer parce
 * qu'une table de verrous manque remplacerait un risque théorique de
 * chevauchement par une certitude de non-exécution — et les crons de ce
 * projet gèlent des escrows et paient des vendeurs.
 */

/** Durées maximales d'exécution, MAJORANTES et non observées. Un TTL trop
 *  court laisse entrer un second porteur pendant que le premier travaille —
 *  exactement ce qu'on voulait interdire, sans moyen de s'en apercevoir. */
export const TTL_PAR_DEFAUT_SECONDES = 600;

export type ResultatBail = {
  /** Le travail doit-il avoir lieu ? */
  autorise: boolean;
  /** Pourquoi — utile au journal, jamais à l'appelant métier. */
  motif: "pris" | "refuse" | "schema_absent" | "erreur";
};

/**
 * Enveloppe un travail de cron dans un bail.
 *
 * Le détenteur est un identifiant d'exécution passé par l'appelant : il ne
 * sert QU'À qualifier la libération. Sans lui, une exécution périmée
 * libérerait le bail de celle qui a pris sa place.
 */
export async function avecBail<T>(
  client: SupabaseClient,
  cle: string,
  detenteur: string,
  travail: () => Promise<T>,
  options: {
    ttlSecondes?: number;
    journal?: (champs: Record<string, unknown>) => void;
  } = {}
): Promise<{ bail: ResultatBail; resultat: T | null }> {
  const ttl = options.ttlSecondes ?? TTL_PAR_DEFAUT_SECONDES;
  const journal = options.journal ?? (() => undefined);

  const { data, error } = await client.rpc("zabelie_cron_lease_acquire", {
    p_cle: cle,
    p_detenteur: detenteur,
    p_ttl_secondes: ttl,
  });

  if (error) {
    // Fail-open assumé (voir l'en-tête). On JOURNALISE, sinon « la table
    // n'existe pas » et « le bail a été pris » produisent le même silence.
    journal({ bail: "indisponible", cle, message: error.message });
    const resultat = await travail();
    return { bail: { autorise: true, motif: "schema_absent" }, resultat };
  }

  if (data !== true) {
    // Une autre exécution tient le bail. Ce n'est pas une erreur : c'est le
    // cas que ce module existe pour produire.
    journal({ bail: "refuse", cle });
    return { bail: { autorise: false, motif: "refuse" }, resultat: null };
  }

  try {
    const resultat = await travail();
    return { bail: { autorise: true, motif: "pris" }, resultat };
  } finally {
    // La libération est dans un `finally` : un travail qui échoue doit rendre
    // le bail, sinon un incident d'une exécution bloque toutes les suivantes
    // jusqu'à l'expiration du TTL.
    const { error: eRelease } = await client.rpc("zabelie_cron_lease_release", {
      p_cle: cle,
      p_detenteur: detenteur,
    });
    if (eRelease) journal({ bail: "liberation_echouee", cle, message: eRelease.message });
  }
}
