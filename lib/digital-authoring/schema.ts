import { z } from "zod";

/**
 * Studio de création éditoriale — contrats du contenu (docs/70, PRD STU 02 à 05).
 *
 * Module PUR : ni réseau, ni base, ni navigateur. Une route, un composant
 * client et un test l'importent tels quels ; le serveur reste l'autorité, le
 * navigateur ne s'en sert que pour aider la saisie.
 *
 * Tout texte est NORMALISÉ avant d'être mesuré : fins de ligne en `\n`, forme
 * Unicode NFC, espaces de bord retirés. Sans NFC, « è » composé et « e » +
 * accent combinant seraient deux contenus différents, deux empreintes
 * différentes — et une sauvegarde identique passerait pour un changement.
 */

export const LANGUES_CONTENU = ["ht", "fr"] as const;
export type LangueContenu = (typeof LANGUES_CONTENU)[number];

export const PUBLICS = ["haiti", "diaspora", "both"] as const;
export type PublicVise = (typeof PUBLICS)[number];

/**
 * Limites du nouvel éditeur (PRD §11.1). La base les porte
 * (`zabelie_authoring_config`, tâche 2.1) et le serveur les y lit ; ces
 * valeurs ne sont que le repli. Elles ne touchent pas celles du Studio
 * numérique (`lib/digital-studio.ts`), qui restent les siennes.
 */
export type LimitesEditeur = {
  titre: number;
  brief: number;
  sections: number;
  section: number;
  total: number;
};
export const LIMITES_DEFAUT: Readonly<LimitesEditeur> = Object.freeze({
  titre: 160,
  brief: 6000,
  sections: 12,
  section: 12000,
  total: 120000,
});

/**
 * Refusés partout : contrôles C0 (sauf tabulation et saut de ligne), DEL, et
 * les contrôles bidirectionnels U+202A–U+202E et U+2066–U+2069, qui font
 * afficher un texte dans un autre ordre que celui qui est stocké (titre
 * trompeur dans une fiche). Écrits en points de code, jamais en caractères :
 * un contrôle bidirectionnel littéral dans une source est lui-même le défaut.
 */
function contientInterdit(valeur: string): boolean {
  for (const caractere of valeur) {
    const c = caractere.codePointAt(0) ?? 0;
    if (c < 0x20 && c !== 0x09 && c !== 0x0a) return true;
    if (c === 0x7f) return true;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

export function normaliserTexte(valeur: string): string {
  return valeur.replace(/\r\n?/g, "\n").normalize("NFC").trim();
}

/** Codes bornés, traduits par la route — jamais un message libre. */
export type CodeRefus =
  | "format_invalide"
  | "caractere_interdit"
  | "champ_requis"
  | "texte_trop_long"
  | "brief_trop_long"
  | "trop_de_sections"
  | "section_dupliquee"
  | "contenu_trop_long"
  | "marche_sans_diaspora";

/** Un champ texte normalisé et borné — partagé avec la validation des sorties d'IA. */
export function champTexte(max: number, requis = false) {
  return z
    .string()
    .transform(normaliserTexte)
    .refine((v) => !contientInterdit(v), { message: "caractere_interdit" })
    .refine((v) => !requis || v.length > 0, { message: "champ_requis" })
    .refine((v) => v.length <= max, { message: "texte_trop_long" });
}

/** Le projet lui-même : titre de travail, langue du CONTENU, public visé. */
export function schemaProjet(l: LimitesEditeur = LIMITES_DEFAUT) {
  return z
    .object({
      titre: champTexte(l.titre, true),
      // Langue du guide, indépendante de la langue de l'interface (STU 02).
      langue: z.enum(LANGUES_CONTENU),
      public: z.enum(PUBLICS),
      // Précision du marché diaspora : sert aux exemples et au vocabulaire,
      // jamais à la devise ni aux règles de paiement (PRD §5.2).
      marcheDiaspora: champTexte(l.titre),
    })
    .strict()
    .refine((p) => p.public !== "haiti" || p.marcheDiaspora === "", {
      message: "marche_sans_diaspora",
    });
}
export type Projet = z.infer<ReturnType<typeof schemaProjet>>;

const CHAMPS_BRIEF_REQUIS = ["sujet", "publicDetail", "probleme", "resultat", "methode"] as const;
const CHAMPS_BRIEF_FACULTATIFS = ["exemples", "prerequis", "ton", "limitesMethode", "notes", "references"] as const;

/**
 * Le brief (PRD §5.2). Rien n'y est inventé : un champ facultatif vide reste
 * vide, et aucune génération ne le remplira d'une expérience, d'un diplôme ou
 * d'un résultat que le créateur n'a pas fournis (STU 02).
 */
export function schemaBrief(l: LimitesEditeur = LIMITES_DEFAUT) {
  const forme: Record<string, ReturnType<typeof champTexte>> = {};
  for (const c of CHAMPS_BRIEF_REQUIS) forme[c] = champTexte(l.brief, true);
  for (const c of CHAMPS_BRIEF_FACULTATIFS) forme[c] = champTexte(l.brief);
  return z
    .object(forme)
    .strict()
    .refine((b) => Object.values(b).reduce((n, v) => n + v.length, 0) <= l.brief, {
      message: "brief_trop_long",
    });
}
export type Brief = Record<(typeof CHAMPS_BRIEF_REQUIS)[number] | (typeof CHAMPS_BRIEF_FACULTATIFS)[number], string>;

/**
 * Le plan et les sections, en UNE structure : une section du plan EST la
 * section qu'on rédige. Son identifiant est stable (UUID) : réordonner ne
 * change pas l'identité, et une suggestion d'IA vise un identifiant, jamais
 * une position (STU 03).
 */
export function schemaContenu(l: LimitesEditeur = LIMITES_DEFAUT) {
  const section = z
    .object({
      id: z.string().uuid(),
      titre: champTexte(l.titre, true),
      resultat: champTexte(l.brief),
      corps: champTexte(l.section),
    })
    .strict();
  return z
    .object({
      objectif: champTexte(l.brief),
      sections: z.array(section).max(l.sections, { message: "trop_de_sections" }),
    })
    .strict()
    .refine((c) => new Set(c.sections.map((s) => s.id)).size === c.sections.length, {
      message: "section_dupliquee",
    })
    .refine((c) => longueurContenu(c) <= l.total, { message: "contenu_trop_long" });
}
export type Contenu = z.infer<ReturnType<typeof schemaContenu>>;
export type Section = Contenu["sections"][number];

/** Ce que mesure la limite totale : tout le texte du guide, titres compris. */
export function longueurContenu(c: { objectif: string; sections: { titre: string; resultat: string; corps: string }[] }): number {
  return c.objectif.length + c.sections.reduce((n, s) => n + s.titre.length + s.resultat.length + s.corps.length, 0);
}

export type Lecture<T> = { ok: true; valeur: T } | { ok: false; code: CodeRefus };

const CODES: ReadonlySet<string> = new Set<CodeRefus>([
  "caractere_interdit", "champ_requis", "texte_trop_long", "brief_trop_long",
  "trop_de_sections", "section_dupliquee", "contenu_trop_long", "marche_sans_diaspora",
]);

/**
 * Valide et normalise. Le refus porte UN code borné : le premier problème
 * rencontré. Tout ce que le schéma ne nomme pas (type faux, clé inconnue,
 * UUID mal formé) devient `format_invalide`.
 */
export function lire<T>(schema: z.ZodType<T>, valeur: unknown): Lecture<T> {
  const r = schema.safeParse(valeur);
  if (r.success) return { ok: true, valeur: r.data };
  const message = r.error.issues[0]?.message ?? "";
  return { ok: false, code: CODES.has(message) ? (message as CodeRefus) : "format_invalide" };
}
