import type { I18nKey } from "@/lib/i18n";
import type { CodeRefus, LimitesEditeur } from "./schema";

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
};

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
