import type { I18nKey } from "@/lib/i18n";
import { remplirBrief, type Brief, type CodeRefus, type Contenu, type LimitesEditeur } from "./schema";

/**
 * Studio de création éditoriale — ce que les routes partagent, sans aucune
 * dépendance serveur (docs/70, tâche 2.2). Module PUR : le harnais de route
 * le charge tel quel, et ses traductions s'éprouvent sans réseau.
 */

/** Tout ce qui sort d'une route du Studio est privé : jamais en cache partagé. */
export const ENTETES_PRIVEES = { "Cache-Control": "private, no-store" } as const;

export const TABLE_PROJETS = "zabelie_authoring_projects";
export const TABLE_CONFIG = "zabelie_authoring_config";

/** La liste ne charge que des résumés, jamais le texte des guides (PRD §7). */
export const COLONNES_RESUME = "id, titre, langue, public_vise, revision, plan_approuve_revision, archived_at, updated_at";

const CLES_REFUS: Record<CodeRefus, I18nKey> = {
  format_invalide: "authoring.refus.format",
  caractere_interdit: "authoring.refus.caractere",
  champ_requis: "authoring.refus.requis",
  texte_trop_long: "authoring.refus.tropLong",
  brief_trop_long: "authoring.refus.briefTropLong",
  trop_de_sections: "authoring.refus.sections",
  section_dupliquee: "authoring.refus.format",
  contenu_trop_long: "authoring.refus.contenuTropLong",
  marche_sans_diaspora: "authoring.refus.marche",
};

export function cleRefus(code: CodeRefus): I18nKey {
  return CLES_REFUS[code];
}

/**
 * Les refus de la base (0141), messages bornés, vers un statut et une phrase.
 * Le message brut de Postgres ne sort JAMAIS vers le navigateur : il peut
 * nommer une table ou une contrainte.
 */
const REFUS_BASE: Record<string, { statut: number; cle: I18nKey }> = {
  authoring_connexion_requise: { statut: 401, cle: "api.auth.required" },
  authoring_compte_inactif: { statut: 403, cle: "api.suspended" },
  authoring_projet_introuvable: { statut: 404, cle: "authoring.introuvable" },
  authoring_projet_archive: { statut: 409, cle: "authoring.archive" },
  authoring_revision_perimee: { statut: 409, cle: "authoring.conflit" },
  authoring_projets_max: { statut: 409, cle: "authoring.projetsMax" },
  authoring_plan_vide: { statut: 422, cle: "authoring.planVide" },
  authoring_titre_trop_long: { statut: 422, cle: "authoring.refus.tropLong" },
  authoring_brief_trop_long: { statut: 422, cle: "authoring.refus.briefTropLong" },
  authoring_trop_de_sections: { statut: 422, cle: "authoring.refus.sections" },
  authoring_contenu_trop_long: { statut: 422, cle: "authoring.refus.contenuTropLong" },
  authoring_config_absente: { statut: 503, cle: "api.unavailable" },
  // Opérations d'IA (0142).
  authoring_demande_invalide: { statut: 400, cle: "api.params.invalid" },
  authoring_cle_conflit: { statut: 409, cle: "authoring.ia.cleConflit" },
  authoring_plan_non_approuve: { statut: 409, cle: "authoring.ia.planNonApprouve" },
  authoring_section_introuvable: { statut: 422, cle: "authoring.ia.sectionIntrouvable" },
  authoring_quota_vendeur: { statut: 429, cle: "authoring.ia.quotaVendeur" },
  authoring_quota_global: { statut: 429, cle: "authoring.ia.quotaGlobal" },
  authoring_operations_en_cours: { statut: 429, cle: "authoring.ia.enCours" },
  authoring_operation_non_annulable: { statut: 409, cle: "authoring.ia.nonAnnulable" },
};

export const TABLE_OPERATIONS = "zabelie_authoring_operations";

/**
 * Ce que le navigateur lit d'une opération — JAMAIS le jeton de bail (la
 * base ne le lui accorde pas, 0142), et le numéro de l'instantané d'origine
 * pour dire si le texte a bougé depuis la demande (`etatProposition`).
 */
export const COLONNES_OPERATION =
  "id, type, section_id, etat, code_erreur, resultat, created_at, revision:zabelie_authoring_revisions(numero)";

export type OperationClient = {
  id: string;
  type: string;
  sectionId: string | null;
  etat: string;
  code: string | null;
  resultat: unknown;
  revisionSource: number | null;
};

export function operationPourClient(ligne: unknown): OperationClient | null {
  if (!ligne || typeof ligne !== "object") return null;
  const l = ligne as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.etat !== "string" || typeof l.type !== "string") return null;
  const rev = l.revision as { numero?: unknown } | null | undefined;
  return {
    id: l.id,
    type: l.type,
    sectionId: typeof l.section_id === "string" ? l.section_id : null,
    etat: l.etat,
    code: typeof l.code_erreur === "string" ? l.code_erreur : null,
    // Un résultat n'est montré que s'il a abouti : rien de partiel ne sort.
    resultat: l.etat === "succeeded" ? l.resultat ?? null : null,
    revisionSource: typeof rev?.numero === "number" ? rev.numero : null,
  };
}

export function traduireErreurBase(erreur: { code?: string | null; message?: string | null } | null): {
  statut: number;
  cle: I18nKey;
  code: string;
} {
  const message = erreur?.message ?? "";
  const connu = REFUS_BASE[message];
  if (connu) return { ...connu, code: message };
  if (erreur?.code === "42501") return { statut: 403, cle: "api.access.denied", code: "refus" };
  return { statut: 500, cle: "api.write.failed", code: "inattendu" };
}

/** Ce que l'éditeur reçoit : une forme sûre, quelle que soit la ligne en base. */
export type ProjetEditeur = {
  id: string;
  titre: string;
  langue: "ht" | "fr";
  public: "haiti" | "diaspora" | "both";
  marcheDiaspora: string;
  brief: Brief;
  contenu: Contenu;
  revision: number;
  /** Jeton de la dernière sauvegarde : dit « c'était nous » après une réponse perdue. */
  jeton: string | null;
  planApprouveRevision: number | null;
  archive: boolean;
};

const texteOuVide = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Une ligne de `zabelie_authoring_projects` mise en forme pour l'éditeur.
 * Le propriétaire peut écrire sa ligne par SQL direct : on n'y fait donc
 * confiance pour RIEN. Un champ de mauvais type devient vide, une section
 * mal formée est écartée — l'écran s'affiche, et la prochaine sauvegarde
 * repasse par la validation complète du serveur.
 */
export function projetPourEditeur(ligne: unknown): ProjetEditeur | null {
  if (!ligne || typeof ligne !== "object") return null;
  const l = ligne as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.revision !== "number") return null;
  const brutBrief = remplirBrief(l.brief);
  const brief = Object.fromEntries(Object.entries(brutBrief).map(([k, v]) => [k, texteOuVide(v)])) as Brief;
  const contenuBrut = l.contenu && typeof l.contenu === "object" ? (l.contenu as Record<string, unknown>) : {};
  const sections = (Array.isArray(contenuBrut.sections) ? contenuBrut.sections : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object" && typeof (s as Record<string, unknown>).id === "string")
    .map((s) => ({ id: s.id as string, titre: texteOuVide(s.titre), resultat: texteOuVide(s.resultat), corps: texteOuVide(s.corps) }));
  return {
    id: l.id,
    titre: texteOuVide(l.titre),
    langue: l.langue === "fr" ? "fr" : "ht",
    public: l.public_vise === "diaspora" || l.public_vise === "both" ? l.public_vise : "haiti",
    marcheDiaspora: texteOuVide(l.marche_diaspora),
    brief,
    contenu: { objectif: texteOuVide(contenuBrut.objectif), sections },
    revision: l.revision,
    jeton: typeof l.derniere_sauvegarde === "string" ? l.derniere_sauvegarde : null,
    planApprouveRevision: typeof l.plan_approuve_revision === "number" ? l.plan_approuve_revision : null,
    archive: Boolean(l.archived_at),
  };
}

/** La ligne de config, ou `null` si elle manque ou ne ressemble pas à une config. */
export function limitesDepuisConfig(ligne: unknown): LimitesEditeur | null {
  if (!ligne || typeof ligne !== "object") return null;
  const c = ligne as Record<string, unknown>;
  const valeurs = {
    titre: c.titre_max,
    brief: c.brief_max,
    sections: c.sections_max,
    section: c.section_max,
    total: c.total_max,
  };
  for (const v of Object.values(valeurs)) {
    if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 1) return null;
  }
  return valeurs as LimitesEditeur;
}
