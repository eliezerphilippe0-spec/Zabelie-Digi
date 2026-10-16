import { z } from "zod";
import { LIMITES_DEFAUT, champTexte, type Brief, type Contenu, type LangueContenu, type LimitesEditeur, type Projet, type PublicVise } from "./schema";
import type { TypeOperation } from "./operations";
import { choisirMoteur, type EnvCreation } from "./flags";
import { fournisseurSimule } from "./provider-mock";
import { fournisseurReel } from "./provider-llm";

/**
 * Studio de création éditoriale — contrat du fournisseur de texte
 * (docs/70 §6, PRD §8.3 et §12.1).
 *
 * Le fournisseur reçoit un CONTEXTE AUTORISÉ, construit ici et nulle part
 * ailleurs : le projet, le brief sans les notes privées, les titres du plan,
 * et le corps de la SEULE section visée. Jamais l'historique, jamais les
 * autres sections rédigées, jamais une donnée d'acheteur, de KYC ou d'argent.
 * Il n'a aucun outil : il rend du texte, que le serveur valide.
 *
 * Tout ce qu'il rend est une ENTRÉE NON FIABLE : une phrase qui demande
 * d'ignorer une règle ou de publier une offre reste du contenu, et la sortie
 * n'est utilisable qu'après `validerSortie`.
 */

export type ContexteAutorise = {
  langue: LangueContenu;
  public: PublicVise;
  titre: string;
  brief: Omit<Brief, "notes">;
  plan: { id: string; titre: string; resultat: string }[];
  section: { id: string; titre: string; resultat: string; corps: string } | null;
};

export type DemandeEditoriale = { type: TypeOperation; contexte: ContexteAutorise };

/**
 * Ce que rend UN envoi. `aucune_reponse` : délai dépassé ou coupure — le
 * fournisseur a pu traiter la demande (voir `classerIssue`, operations.ts).
 */
export type ReponseFournisseur =
  | { type: "reponse"; statut: number; corps: unknown; usage: { entree: number; sortie: number } | null }
  | { type: "aucune_reponse" };

export interface FournisseurEditorial {
  readonly nom: "mock" | "openai" | "gemini";
  /** Vrai pour la simulation : l'écran et les statistiques le disent. */
  readonly simulation: boolean;
  /** UN envoi, jamais de relance interne : une relance serait un second appel payant. */
  envoyer(demande: DemandeEditoriale, signal?: AbortSignal): Promise<ReponseFournisseur>;
}

/**
 * Le contexte d'une demande. `sectionId` est exigé pour une demande de
 * section et refusé pour une demande de plan : la cible est un IDENTIFIANT,
 * jamais une position (STU 03).
 */
export function contexteAutorise(
  type: TypeOperation,
  projet: Projet,
  brief: Brief,
  contenu: Contenu,
  sectionId: string | null
): ContexteAutorise | null {
  const { notes: _notesPrivees, ...briefTransmis } = brief;
  void _notesPrivees;
  const plan = contenu.sections.map((s) => ({ id: s.id, titre: s.titre, resultat: s.resultat }));
  if (type === "plan") {
    if (sectionId !== null) return null;
    return { langue: projet.langue, public: projet.public, titre: projet.titre, brief: briefTransmis, plan, section: null };
  }
  const cible = contenu.sections.find((s) => s.id === sectionId);
  if (!cible) return null;
  return {
    langue: projet.langue,
    public: projet.public,
    titre: projet.titre,
    brief: briefTransmis,
    plan,
    section: { id: cible.id, titre: cible.titre, resultat: cible.resultat, corps: cible.corps },
  };
}

/** Forme attendue de la sortie, par type d'opération. */
export function schemaSortie(type: TypeOperation, l: LimitesEditeur = LIMITES_DEFAUT) {
  if (type === "plan") {
    return z
      .object({
        objectif: champTexte(l.brief),
        sections: z
          .array(z.object({ titre: champTexte(l.titre, true), resultat: champTexte(l.brief) }).strict())
          .min(1)
          .max(l.sections),
      })
      .strict();
  }
  return z.object({ texte: champTexte(l.section, true) }).strict();
}

export type SortiePlan = { objectif: string; sections: { titre: string; resultat: string }[] };
export type SortieTexte = { texte: string };

/** Une sortie invalide, excessive ou partielle n'est JAMAIS enregistrée (STU 03, T11). */
export function validerSortie(
  type: TypeOperation,
  corps: unknown,
  l: LimitesEditeur = LIMITES_DEFAUT
): { ok: true; sortie: SortiePlan | SortieTexte } | { ok: false } {
  const r = schemaSortie(type, l).safeParse(corps);
  return r.success ? { ok: true, sortie: r.data as SortiePlan | SortieTexte } : { ok: false };
}

/**
 * Le fournisseur à utiliser, ou la raison de n'en utiliser aucun. IA coupée
 * ou configuration absente : AUCUN fournisseur n'est construit, donc aucun
 * appel ne peut partir (STU 09, T25).
 */
export function fournisseurEditorial(
  env: EnvCreation,
  fetcher: typeof fetch = fetch
): { ok: true; fournisseur: FournisseurEditorial } | { ok: false; code: "ia_coupee" | "configuration_absente" } {
  const choix = choisirMoteur(env);
  if (!choix.ok) return choix;
  if (choix.moteur === "mock") return { ok: true, fournisseur: fournisseurSimule() };
  // `choisirMoteur` n'accepte un moteur réel qu'avec sa clé posée.
  const cle = (choix.moteur === "openai" ? env.OPENAI_API_KEY : env.GEMINI_API_KEY)!.trim();
  const modele = choix.moteur === "openai" ? env.OPENAI_MODEL : env.GEMINI_MODEL;
  return { ok: true, fournisseur: fournisseurReel({ nom: choix.moteur, cle, modele }, fetcher) };
}
