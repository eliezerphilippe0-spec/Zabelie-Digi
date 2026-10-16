import { classerIssue, type CodeErreur, type EtatOperation, type TypeOperation } from "./operations";
import { contexteAutorise, validerSortie, type FournisseurEditorial, type ReponseFournisseur } from "./provider";
import { lire, remplirBrief, schemaBrief, schemaContenu, schemaProjet, type Brief, type LimitesEditeur } from "./schema";

/**
 * Studio de création éditoriale — l'exécuteur d'une opération (docs/70 §6,
 * PRD §10.2, tâche 3.2). UNE étape, courte, reprenable : prendre le bail,
 * revérifier, inscrire l'envoi, envoyer, conclure.
 *
 * L'ordre est la garantie :
 *   1. bail atomique (jeton neuf) — sinon un autre exécuteur travaille, on sort ;
 *   2. lecture de l'INSTANTANÉ figé (jamais le document courant, T29) ;
 *   3. revérifications côté serveur : brief complet, cible présente, IA
 *      allumée et configurée (T25) — un refus ici annule SANS envoyer ;
 *   4. `marquer_soumis` AVANT l'appel réseau, et la base y revérifie compte
 *      actif, projet et liste pilote (T30) — faux = on n'envoie rien ;
 *   5. UN envoi, borné par un délai ; pas de réponse = `uncertain`, jamais
 *      de second appel (T09) ;
 *   6. sortie validée, puis conclusion sous le jeton du bail (T10, T11).
 *
 * Le client privilégié (service role) ne sert qu'aux fonctions du contrat
 * système et à la lecture de l'instantané (décision C1-A).
 */

type ReponseBase = { data: unknown; error: { code?: string | null; message?: string | null } | null };
export type ClientSysteme = {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<ReponseBase>;
  from(table: string): {
    select(colonnes: string): { eq(colonne: string, valeur: unknown): { maybeSingle(): PromiseLike<ReponseBase> } };
  };
};

export type DepsExecuteur = {
  admin: ClientSysteme;
  /** Revérifié JUSTE avant l'envoi : l'IA peut avoir été coupée depuis la demande. */
  fournisseur: () => { ok: true; fournisseur: FournisseurEditorial } | { ok: false; code: "ia_coupee" | "configuration_absente" };
  limites: LimitesEditeur;
  delaiMs: number;
};

type Operation = { id: string; type: TypeOperation; section_id: string | null; revision_id: string };

async function conclure(
  admin: ClientSysteme,
  op: Operation,
  jeton: string,
  etat: EtatOperation,
  resultat: unknown,
  code: CodeErreur | null,
  usage: { entree: number; sortie: number } | null
): Promise<EtatOperation | null> {
  const { data, error } = await admin.rpc("zabelie_authoring_conclure", {
    p_operation: op.id, p_jeton: jeton, p_etat: etat, p_resultat: resultat ?? null, p_code: code,
    p_usage_entree: usage?.entree ?? null, p_usage_sortie: usage?.sortie ?? null,
  });
  if (error) throw new Error(`conclusion refusee : ${error.code ?? "sans code"}`);
  return data === true ? etat : null; // faux : le bail a été repris entre-temps, rien n'est écrit.
}

/**
 * Fait avancer une opération d'UNE étape. Rend l'état atteint, ou `null` si
 * l'exécuteur n'a pas eu la main (bail tenu ailleurs, opération terminée,
 * bail perdu pendant l'envoi). Ne relance jamais un appel.
 */
export async function executerEtape(deps: DepsExecuteur, operationId: string): Promise<EtatOperation | null> {
  const { admin } = deps;
  const jeton = crypto.randomUUID();

  const bail = await admin.rpc("zabelie_authoring_prendre_bail", { p_operation: operationId, p_jeton: jeton });
  if (bail.error) throw new Error(`bail refuse : ${bail.error.code ?? "sans code"}`);
  const op = (Array.isArray(bail.data) ? bail.data[0] : null) as Operation | null;
  if (!op) return null;

  // L'entrée est l'instantané figé à la demande, pas le document d'aujourd'hui.
  const lecture = await admin.from("zabelie_authoring_revisions")
    .select("titre, langue, public_vise, marche_diaspora, brief, contenu").eq("id", op.revision_id).maybeSingle();
  if (lecture.error) throw new Error("instantane illisible");
  const r = lecture.data as Record<string, unknown> | null;
  const projet = lire(schemaProjet(deps.limites), r && { titre: r.titre, langue: r.langue, public: r.public_vise, marcheDiaspora: r.marche_diaspora });
  const brief = lire(schemaBrief(deps.limites, "complet"), remplirBrief(r?.brief));
  const contenu = lire(schemaContenu(deps.limites, "brouillon"), r?.contenu);
  const contexte = projet.ok && brief.ok && contenu.ok
    ? contexteAutorise(op.type, projet.valeur, brief.valeur as Brief, contenu.valeur, op.section_id)
    : null;
  if (!contexte) return conclure(admin, op, jeton, "cancelled", null, "projet_inadmissible", null);

  const choix = deps.fournisseur();
  if (!choix.ok) return conclure(admin, op, jeton, "cancelled", null, choix.code, null);

  // L'envoi est INSCRIT avant de partir ; la base y fait sa dernière vérification.
  const marque = await admin.rpc("zabelie_authoring_marquer_soumis", {
    p_operation: op.id, p_jeton: jeton, p_fournisseur: choix.fournisseur.nom,
  });
  if (marque.error) throw new Error(`soumission refusee : ${marque.error.code ?? "sans code"}`);
  if (marque.data !== true) return null; // annulée en base (compte, projet, pilote) ou bail perdu

  // Minuterie explicite plutôt qu'`AbortSignal.timeout` : celle-ci ne retient
  // pas le processus, et une attente sans autre activité serait abandonnée
  // sans que le délai ne tombe jamais.
  const coupure = new AbortController();
  const minuterie = setTimeout(() => coupure.abort(), deps.delaiMs);
  let reponse: ReponseFournisseur;
  try {
    reponse = await choix.fournisseur.envoyer({ type: op.type, contexte }, coupure.signal);
  } catch {
    reponse = { type: "aucune_reponse" };
  } finally {
    clearTimeout(minuterie);
  }

  if (reponse.type === "aucune_reponse") {
    const issue = classerIssue(reponse);
    return conclure(admin, op, jeton, issue.etat, null, issue.code, null);
  }
  const sortie = validerSortie(op.type, reponse.corps, deps.limites);
  const issue = classerIssue({ type: "reponse", statut: reponse.statut, sortieValide: sortie.ok });
  return conclure(admin, op, jeton, issue.etat, issue.etat === "succeeded" && sortie.ok ? sortie.sortie : null, issue.code, reponse.usage);
}
