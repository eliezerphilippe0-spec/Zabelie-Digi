import type { DemandeEditoriale, FournisseurEditorial, ReponseFournisseur } from "./provider";

/**
 * Fournisseur SIMULÉ du Studio de création éditoriale (PRD §8.3).
 *
 * Déterministe : la même demande rend toujours la même réponse, ce qui rend
 * les tests et les démonstrations rejouables. Aucun réseau, aucune dépense.
 *
 * Chaque texte porte le marqueur `[SIMULASYON]` (kreyòl) ou `[SIMULATION]`
 * (français) : une simulation ne se confond jamais avec une génération, et le
 * contrôle qualité (tâche 4.2) la signale avant toute approbation.
 *
 * Les scénarios d'échec servent aux tests de l'exécuteur (tâche 3.2) : ils se
 * choisissent à la construction, jamais par une variable d'environnement.
 */
export type ScenarioSimule = "ok" | "sortie_invalide" | "refus" | "erreur_serveur" | "aucune_reponse";

export const MARQUEUR_SIMULATION = { ht: "[SIMULASYON]", fr: "[SIMULATION]" } as const;

const MODELES = {
  ht: {
    plan: ["Poukisa {sujet} enpòtan", "Metòd la, etap pa etap", "Egzèsis ak plan aksyon"],
    draft: "Bouyon pou « {titre} ».",
    rewrite: "Lòt fason pou di « {titre} ».",
    exercise: "Egzèsis pou « {titre} » : ekri twa aksyon ou ka fè semèn sa a.",
  },
  fr: {
    plan: ["Pourquoi {sujet} compte", "La méthode, pas à pas", "Exercices et plan d'action"],
    draft: "Brouillon pour « {titre} ».",
    rewrite: "Reformulation de « {titre} ».",
    exercise: "Exercice pour « {titre} » : notez trois actions à mener cette semaine.",
  },
} as const;

function remplir(modele: string, valeurs: Record<string, string>): string {
  return modele.replace(/\{(\w+)\}/g, (_, cle: string) => valeurs[cle] ?? "");
}

function corpsSimule(demande: DemandeEditoriale): unknown {
  const { contexte } = demande;
  const m = MODELES[contexte.langue];
  const marque = MARQUEUR_SIMULATION[contexte.langue];
  if (demande.type === "plan") {
    return {
      objectif: `${marque} ${contexte.brief.resultat}`,
      sections: m.plan.map((t) => ({ titre: `${marque} ${remplir(t, { sujet: contexte.brief.sujet })}`, resultat: "" })),
    };
  }
  const titre = contexte.section?.titre ?? "";
  const phrase = remplir(m[demande.type], { titre });
  const suite = demande.type === "rewrite" ? contexte.section?.corps ?? "" : contexte.section?.resultat ?? "";
  return { texte: `${marque} ${phrase}${suite ? `\n\n${suite}` : ""}` };
}

/** Grossière et stable : de quoi exercer les compteurs d'usage sans fournisseur. */
function usageSimule(demande: DemandeEditoriale, corps: unknown): { entree: number; sortie: number } {
  return {
    entree: Math.ceil(JSON.stringify(demande.contexte).length / 4),
    sortie: Math.ceil(JSON.stringify(corps).length / 4),
  };
}

export function fournisseurSimule(scenario: ScenarioSimule = "ok"): FournisseurEditorial {
  return {
    nom: "mock",
    simulation: true,
    async envoyer(demande, signal): Promise<ReponseFournisseur> {
      if (signal?.aborted || scenario === "aucune_reponse") return { type: "aucune_reponse" };
      if (scenario === "refus") return { type: "reponse", statut: 400, corps: null, usage: null };
      if (scenario === "erreur_serveur") return { type: "reponse", statut: 503, corps: null, usage: null };
      if (scenario === "sortie_invalide") return { type: "reponse", statut: 200, corps: { texte: 42, html: "<script>" }, usage: null };
      const corps = corpsSimule(demande);
      return { type: "reponse", statut: 200, corps, usage: usageSimule(demande, corps) };
    },
  };
}
