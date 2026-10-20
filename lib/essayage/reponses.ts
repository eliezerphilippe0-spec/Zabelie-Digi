import type { I18nKey } from "../i18n";
import type { RefusEssayage } from "./regles";
import type { RaisonEchec } from "./fournisseurs/types";
import type { Demarrage, Suivi } from "./serveur";

/**
 * Essayage virtuel — ce que les routes rendent (tâche 4.2).
 *
 * Une table, et rien d'autre : chaque refus et chaque échec du cœur
 * (`serveur.ts`) a son statut HTTP et sa phrase dans `lib/i18n.ts`. Les routes
 * traduisent avec la langue de l'acheteur ; le navigateur affiche `error` tel
 * quel, comme partout ailleurs (`lib/api-erreur.ts`).
 *
 * `interrupteur` et `anonyme` n'y sont pas : les routes les rendent avant le
 * cœur, avec les messages communs (`api.feature.off`, `api.auth.required`).
 */

/** Ni cache partagé ni copie : la réponse porte l'image d'une personne. */
export const ENTETES_ESSAYAGE = { "Cache-Control": "private, no-store" } as const;

type RefusDuCoeur = Exclude<RefusEssayage, "interrupteur" | "anonyme">;

const REFUS: Record<RefusDuCoeur, { statut: number; cle: I18nKey }> = {
  non_eligible: { statut: 403, cle: "essayage.refus.non_eligible" },
  photo: { statut: 422, cle: "essayage.refus.photo" },
  quota: { statut: 429, cle: "essayage.refus.quota" },
  plafond: { statut: 503, cle: "essayage.refus.plafond" },
  pause: { statut: 503, cle: "essayage.refus.pause" },
};

/** Un échec ne compte jamais dans le quota ni dans le plafond : chaque phrase le dit. */
const ECHEC: Record<RaisonEchec, I18nKey> = {
  moderation: "essayage.echec.moderation",
  photo_refusee: "essayage.echec.photo_refusee",
  fournisseur: "essayage.echec.fournisseur",
  delai: "essayage.echec.delai",
};

export type ReponseEssayage = { statut: number; corps: Record<string, unknown>; cle?: I18nKey };

/** POST : l'essai lancé (201), ou le refus, ou l'échec immédiat chez le fournisseur. */
export function reponseDemarrage(d: Demarrage): ReponseEssayage {
  if (d.ok) return { statut: 201, corps: { essai: d.essai } };
  if ("refus" in d) {
    // Le cœur ne rend jamais ces deux-là ; s'il le faisait, ce serait une panne, pas un refus.
    if (d.refus === "interrupteur" || d.refus === "anonyme") return { statut: 503, corps: { code: "indisponible" }, cle: "api.unavailable" };
    const r = REFUS[d.refus];
    return { statut: r.statut, corps: { code: d.refus }, cle: r.cle };
  }
  return { statut: 422, corps: { code: "echec", raison: d.echec }, cle: ECHEC[d.echec] };
}

/**
 * GET : l'état de l'essai. Les quatre états sont des réponses 200 : le
 * navigateur lit `etat` et sait s'il continue d'attendre. Un essai absent, ou
 * celui d'un autre acheteur, est le même 404.
 */
export function reponseSuivi(s: Suivi): ReponseEssayage {
  if (!s) return { statut: 404, corps: { code: "introuvable" }, cle: "essayage.introuvable" };
  if (s.etat === "en_cours") return { statut: 200, corps: { etat: "en_cours" } };
  if (s.etat === "reussi") return { statut: 200, corps: { etat: "reussi", image: s.image } };
  if (s.etat === "expire") return { statut: 200, corps: { etat: "expire" }, cle: "essayage.expire" };
  return { statut: 200, corps: { etat: "echec", raison: s.raison }, cle: ECHEC[s.raison] };
}
