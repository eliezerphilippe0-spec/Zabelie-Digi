import { z } from "zod";

/**
 * R-STUDIO-01 — identité visuelle haïtienne des pubs du Studio Créatif.
 *
 * ⚠️ SOURCE : l'EXTRAIT de R-STUDIO-01 donné au §2 du prompt
 * `PROMPT-ZABELIE-STUDIO-CREATIF.md` v1.0, recopié dans
 * `docs/63-RULE-R-STUDIO-01.md`. Le texte intégral n'est pas dans le dépôt
 * (`docs/62` §1.2). Tout ce qui suit vient de cet extrait, mot pour mot quand
 * c'est une valeur ; ce qui n'en vient pas est dans `PROPOSITION` plus bas,
 * isolé, pour être validé ou retiré sans toucher au reste.
 *
 * Module PUR : aucun accès réseau, base ou environnement.
 */
export const RULE_VERSION = "R-STUDIO-01" as const;

// ── Enums (extrait §2, valeurs exactes) ──────────────────────────────────────
export const AUDIENCES = ["haiti", "diaspora", "haiti_diaspora", "international"] as const;
export const PROFILS = [
  "auto", "femme", "homme", "couple", "famille", "entrepreneur", "professionnel", "jeune_adulte", "aucun",
] as const;
export const LANGUES = ["ht", "fr", "en", "es"] as const;
export const MARCHES_DIASPORA = ["usa", "canada", "france", "caraibes"] as const;
/** L'extrait ne donne que la valeur par défaut `auto` ; aucune autre valeur n'est inventée. */
export const DIRECTIONS = ["auto"] as const;

export type Audience = (typeof AUDIENCES)[number];
export type Profil = (typeof PROFILS)[number];
export type Langue = (typeof LANGUES)[number];
export type MarcheDiaspora = (typeof MARCHES_DIASPORA)[number];

// ── Défauts (extrait §2) ─────────────────────────────────────────────────────
export const DEFAUTS = Object.freeze({
  audience: "haiti_diaspora" as Audience,
  profil_personnages: "auto" as Profil,
  langue_pub: Object.freeze(["ht", "fr"]) as readonly Langue[],
  direction_artistique: "auto" as (typeof DIRECTIONS)[number],
});

// ── Ordre de priorité du Prompt Builder (extrait §2, dans cet ordre) ─────────
export const PRIORITE = [
  "fidelite_produit",
  "interdits",
  "audience_marche",
  "objectif",
  "personnages",
  "contexte",
  "direction_artistique",
  "format",
  "zone_texte",
] as const;
export type Segment = (typeof PRIORITE)[number];

// ── Prompt négatif systématique (extrait §2, les sept interdits) ─────────────
// Rédigé en anglais : c'est la langue des moteurs d'image. Une entrée par
// interdit de l'extrait, dans son ordre.
export const NEGATIF_SYSTEMATIQUE = Object.freeze([
  "caricature, exaggerated or mocking features",
  "poverty markers not requested by the brief",
  "colorism, skin lightening, altered skin tone",
  "any text, letters, words, numbers or watermark in the image",
  "product deformation, altered product shape, color, label or proportions",
  "real identifiable people, celebrities, public figures",
  "third-party logos, brand names or trademarks",
] as const);

// ── Paramètres vendeur : validés, défauts appliqués ──────────────────────────
export const parametresSchema = z.object({
  audience: z.enum(AUDIENCES).default(DEFAUTS.audience),
  marche_diaspora: z.enum(MARCHES_DIASPORA).optional(),
  profil_personnages: z.enum(PROFILS).default(DEFAUTS.profil_personnages),
  langue_pub: z.array(z.enum(LANGUES)).min(1).max(LANGUES.length)
    .refine((l) => new Set(l).size === l.length, "langue_en_double")
    .default([...DEFAUTS.langue_pub]),
  direction_artistique: z.enum(DIRECTIONS).default(DEFAUTS.direction_artistique),
}).strict()
  // Un marché diaspora n'a de sens que si l'audience comprend la diaspora.
  .refine((p) => !p.marche_diaspora || p.audience === "diaspora" || p.audience === "haiti_diaspora", {
    message: "marche_sans_diaspora",
  });
export type Parametres = z.infer<typeof parametresSchema>;

export function parametresParDefaut(): Parametres {
  return parametresSchema.parse({});
}

/**
 * ⚠️ PROPOSITION — hors de l'extrait de R-STUDIO-01, à valider par le porteur.
 * L'extrait fixe 8 à 10 briefs mais ne dit pas sur quoi ils varient. Ces axes
 * sont neutres (formats de plateformes, cadrage) et regroupés ici pour être
 * remplacés d'un seul geste quand le texte intégral arrivera.
 */
export const PROPOSITION = Object.freeze({
  /** Carré (fil), portrait (fil), vertical (stories/statuts WhatsApp). */
  formats: Object.freeze(["1:1", "4:5", "9:16"] as const),
  cadrages: Object.freeze(["gros_plan", "en_situation", "en_usage"] as const),
});
export type Format = (typeof PROPOSITION.formats)[number];
export type Cadrage = (typeof PROPOSITION.cadrages)[number];
export type ZoneTexte = "haut" | "bas";
