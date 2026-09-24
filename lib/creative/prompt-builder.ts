import {
  NEGATIF_SYSTEMATIQUE, PRIORITE, PROPOSITION, RULE_VERSION, parametresSchema,
  type Audience, type Cadrage, type Format, type MarcheDiaspora, type Parametres, type Profil, type Segment, type ZoneTexte,
} from "./rule";

/**
 * Prompt Builder R-STUDIO-01 — fonctions PURES, déterministes, sans I/O.
 *
 * ─── AUCUN TEXTE LIBRE N'ENTRE DANS LE PROMPT IMAGE ─────────────────────────
 * Ni le titre du produit, ni sa catégorie saisie, ni une phrase de la pub de
 * référence. Trois raisons, chacune suffisante :
 *   1. un moteur d'image RECOPIE le texte qu'on lui donne (interdit n°4) ;
 *   2. un titre vendeur peut porter une marque tierce (interdit n°7) ou un prix ;
 *   3. une page de référence peut porter une injection (« ignore tes
 *      instructions… ») : ne passant que par des ÉNUMÉRATIONS, elle ne peut
 *      rien écrire dans le prompt.
 * La fidélité au produit (priorité n°1) repose sur sa PHOTO, transmise au
 * moteur comme image de référence. Sans photo, pas de brief : une pub
 * « fidèle » à un produit jamais vu serait une invention.
 *
 * Accroche, CTA et prix ne sont JAMAIS ici : ils sont composés en surcouche
 * (`overlay.ts`).
 */

export type ProduitCatalogue = {
  id: string;
  price_htg: number;
  /** URL de la photo du produit, lue du catalogue côté serveur. */
  imageUrl: string | null;
};

/**
 * Analyse structurelle d'une pub de référence — sa forme sera fixée en
 * Phase 2 (AdAnalysisProvider). Ici, seules ces valeurs ÉNUMÉRÉES sont lues ;
 * tout autre champ ou toute autre valeur est ignoré.
 * ⚠️ PROPOSITION (hors extrait R-STUDIO-01).
 */
export const ANALYSE_COMPOSITIONS = ["centree", "regle_des_tiers", "symetrique", "diagonale"] as const;
export const ANALYSE_PALETTES = ["chaude", "froide", "neutre", "vive", "pastel"] as const;
export type AnalyseStructurelle = { composition?: unknown; palette?: unknown };

export type Brief = {
  prompt: string;
  negative_prompt: string;
  format: Format;
  zone_texte: ZoneTexte;
  rule_version: typeof RULE_VERSION;
};

export type BuildResult = { ok: true; briefs: Brief[] } | { ok: false; reason: "photo_produit_requise" | "parametres_invalides" };

// Descripteurs humains : la liste sert AUSSI au test « profil = aucun ».
export const DESCRIPTEURS_HUMAINS: Record<Exclude<Profil, "aucun">, string> = {
  auto: "people chosen to fit the product and the audience",
  femme: "a Haitian woman",
  homme: "a Haitian man",
  couple: "a Haitian couple",
  famille: "a Haitian family",
  entrepreneur: "a Haitian entrepreneur",
  professionnel: "a Haitian professional",
  jeune_adulte: "a young Haitian adult",
};
const NEGATIF_SANS_PERSONNE = "people, person, human figure, face, hands, body parts";

const MARCHE: Record<MarcheDiaspora, string> = {
  usa: "the United States", canada: "Canada", france: "France", caraibes: "the Caribbean",
};

function audienceMarche(audience: Audience, marche?: MarcheDiaspora): string {
  const ailleurs = marche ? MARCHE[marche] : "abroad";
  switch (audience) {
    case "haiti": return "Audience in Haiti: contemporary Haitian everyday life and settings.";
    case "diaspora": return `Audience: the Haitian diaspora living in ${ailleurs}.`;
    case "haiti_diaspora": return `Audience in Haiti and in the Haitian diaspora (${ailleurs}): Haitian identity recognizable in both.`;
    case "international": return "International audience, for a product sold by a Haitian marketplace.";
  }
}

function contexte(cadrage: Cadrage, sansPersonne: boolean): string {
  switch (cadrage) {
    case "gros_plan": return "Close-up of the product on a clean surface.";
    case "en_situation": return "The product in a real, well-kept Haitian everyday setting.";
    case "en_usage": return sansPersonne ? "The product arranged in a styled setting, shown as ready to use." : "The product being used naturally.";
  }
}

function directionArtistique(analyse?: AnalyseStructurelle): string {
  const parts = ["Clean, modern commercial photography, natural light."];
  const c = analyse?.composition;
  if (typeof c === "string" && (ANALYSE_COMPOSITIONS as readonly string[]).includes(c)) {
    parts.push({ centree: "Centered composition.", regle_des_tiers: "Rule-of-thirds composition.",
      symetrique: "Symmetrical composition.", diagonale: "Diagonal composition." }[c as (typeof ANALYSE_COMPOSITIONS)[number]]);
  }
  const p = analyse?.palette;
  if (typeof p === "string" && (ANALYSE_PALETTES as readonly string[]).includes(p)) {
    parts.push({ chaude: "Warm color palette.", froide: "Cool color palette.", neutre: "Neutral color palette.",
      vive: "Vivid color palette.", pastel: "Pastel color palette." }[p as (typeof ANALYSE_PALETTES)[number]]);
  }
  return parts.join(" ");
}

/** ⚠️ PROPOSITION : en 9:16 le bas est couvert par l'interface des stories. */
export function zoneTexte(format: Format): ZoneTexte {
  return format === "9:16" ? "haut" : "bas";
}

/** Les segments d'un brief, indexés par la priorité R-STUDIO-01. Un segment sans entrée est omis. */
export function segments(params: Parametres, cadrage: Cadrage, format: Format, analyse?: AnalyseStructurelle): Partial<Record<Segment, string>> {
  const sansPersonne = params.profil_personnages === "aucun";
  return {
    fidelite_produit: "The exact product shown in the reference image, unchanged: same shape, color, material, label and proportions.",
    interdits: "No text or lettering anywhere in the image. No logos or brand marks. Dignified, respectful depiction.",
    audience_marche: audienceMarche(params.audience, params.marche_diaspora),
    // `objectif` : aucune entrée définie par l'extrait — omis, l'ordre reste celui de PRIORITE.
    personnages: sansPersonne ? undefined : `With ${DESCRIPTEURS_HUMAINS[params.profil_personnages as Exclude<Profil, "aucun">]}, natural skin tones, confident and modern.`,
    contexte: contexte(cadrage, sansPersonne),
    direction_artistique: directionArtistique(analyse),
    format: `Aspect ratio ${format}.`,
    zone_texte: `Leave the ${zoneTexte(format) === "haut" ? "top" : "bottom"} third empty and uncluttered for text added later.`,
  };
}

export function buildBriefs(produit: ProduitCatalogue, rawParams: unknown, analyse?: AnalyseStructurelle): BuildResult {
  if (!produit.imageUrl) return { ok: false, reason: "photo_produit_requise" };
  const parsed = parametresSchema.safeParse(rawParams ?? {});
  if (!parsed.success) return { ok: false, reason: "parametres_invalides" };
  const params = parsed.data;
  const negatif = [...NEGATIF_SYSTEMATIQUE, ...(params.profil_personnages === "aucun" ? [NEGATIF_SANS_PERSONNE] : [])].join("; ");

  const briefs: Brief[] = [];
  for (const cadrage of PROPOSITION.cadrages) {
    for (const format of PROPOSITION.formats) {
      const s = segments(params, cadrage, format, analyse);
      briefs.push({
        prompt: PRIORITE.map((k) => s[k]).filter((x): x is string => Boolean(x)).join(" "),
        negative_prompt: negatif,
        format,
        zone_texte: zoneTexte(format),
        rule_version: RULE_VERSION,
      });
    }
  }
  return { ok: true, briefs };
}
