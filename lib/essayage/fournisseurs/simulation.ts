import type { EtatTravail, FournisseurEssayage, ImageResultat, RaisonEchec, Travail } from "./types";

/**
 * Le fournisseur SIMULÉ (docs/74 §3) : tests, e2e et démonstration. Il ne
 * coûte rien, ne sort pas de la machine, et rend une silhouette fixe.
 * `lireFournisseur` le refuse sur un déploiement de production.
 *
 * Sans état : le travail porte sa date de création et son issue
 * (`sim:<ms>:<issue>`). Une autre instance de fonction le lit donc comme la
 * première, sans mémoire partagée.
 */

export type OptionsSimulation = {
  /** Durée de l'attente simulée. */
  delaiMs?: number;
  /** Pour essayer les messages d'échec : la raison rendue à la fin de l'attente. */
  echec?: RaisonEchec;
  /** Horloge injectable (tests). */
  maintenant?: () => number;
};

const PREFIXE = "sim";
const REUSSI = "ok";
const RAISONS: readonly RaisonEchec[] = ["moderation", "photo_refusee", "fournisseur", "delai"];
const DELAI_PAR_DEFAUT_MS = 2_000;

// Silhouette neutre, sans texte : rien à traduire, rien qui passe pour un vrai essai.
const SILHOUETTE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 648" width="432" height="648">' +
  '<rect width="432" height="648" fill="#f4efe6"/>' +
  '<circle cx="216" cy="118" r="54" fill="#8a5a3b"/>' +
  '<path d="M140 196h152l38 268H102z" fill="#ff6b00"/>' +
  '<rect x="150" y="464" width="48" height="156" rx="12" fill="#2b2b3a"/>' +
  '<rect x="234" y="464" width="48" height="156" rx="12" fill="#2b2b3a"/>' +
  "</svg>";
const IMAGE: ImageResultat = { type: "image/svg+xml", base64: btoa(SILHOUETTE) };

const ECHEC_FOURNISSEUR: EtatTravail = { etat: "echec", raison: "fournisseur" };

export function simulation(options: OptionsSimulation = {}): FournisseurEssayage {
  const delai = options.delaiMs ?? DELAI_PAR_DEFAUT_MS;
  const maintenant = options.maintenant ?? Date.now;
  return {
    nom: "simulation",
    async creer(): Promise<Travail> {
      return { fournisseur: "simulation", id: `${PREFIXE}:${maintenant()}:${options.echec ?? REUSSI}` };
    },
    async statut(travail: Travail): Promise<EtatTravail> {
      const [prefixe, debut, issue, ...reste] = travail.id.split(":");
      if (travail.fournisseur !== "simulation" || prefixe !== PREFIXE || reste.length > 0 || !/^\d+$/.test(debut ?? "")) return ECHEC_FOURNISSEUR;
      if (issue !== REUSSI && !RAISONS.includes(issue as RaisonEchec)) return ECHEC_FOURNISSEUR;
      if (maintenant() - Number(debut) < delai) return { etat: "en_cours" };
      return issue === REUSSI ? { etat: "reussi", image: IMAGE } : { etat: "echec", raison: issue as RaisonEchec };
    },
    async effacer(): Promise<void> {
      // Rien n'a quitté la machine : rien à effacer.
    },
  };
}
