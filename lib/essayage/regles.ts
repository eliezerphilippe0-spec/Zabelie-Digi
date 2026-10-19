/**
 * Essayage virtuel (docs/74) — règles PURES : quels vêtements s'essaient,
 * dans quel groupe de mesure tombe un acheteur, quel jour il est en Haïti,
 * et pour quelles raisons un essai se refuse.
 *
 * Aucune lecture réseau ni base ici : la base tranche (`zabelie_essayage_
 * reserver`, migration 0150) ; ce module donne à l'interface et aux tests
 * les mêmes mots qu'elle.
 */

/**
 * Ce que couvre le vêtement. Les fournisseurs qui demandent une catégorie
 * (FASHN : `tops`, `bottoms`, `one-pieces`) la déduisent d'ici ;
 * « ensemble » (tailleur, costume, survêtement) leur laisse le choix.
 */
export type PieceVetement = "haut" | "bas" | "entier" | "ensemble";

/**
 * Les SOUS-RAYONS ouverts à l'essayage (docs/74 §2.1) : des catégories de
 * NIVEAU 3 de `zabelie_categories` (0035, 0077), sous « Vêtements femme »,
 * « Vêtements homme » et « Vêtements de sport ».
 *
 * La liste est FERMÉE : ce qui n'y est pas reste fermé. Lingerie, maillots de
 * bain et sous-vêtements (risque d'abus avec la photo d'une autre personne),
 * chaussures et accessoires (mal rendus), et tout ce qui concerne les enfants
 * (photos de mineurs) n'y entreront pas. Une fiche rangée au seul niveau 2
 * (« Vêtements femme » sans sous-rayon) reste fermée elle aussi : elle
 * pourrait être de la lingerie.
 *
 * La migration 0150 amorce `zabelie_essayage_rayons` avec CETTE liste.
 */
export const SOUS_RAYONS_ESSAYAGE = {
  // Vêtements femme (rad-fanm)
  wob: "entier",
  "blouz-chemizye": "haut",
  "pantalon-djin-fanm": "bas",
  jip: "bas",
  "ansanm-taye": "ensemble",
  "ves-manto-fanm": "haut",
  "rad-tradisyonel": "ensemble",
  // Vêtements homme (rad-gason)
  chemiz: "haut",
  "mayo-polo": "haut",
  "pantalon-djin-gason": "bas",
  chot: "bas",
  kostim: "ensemble",
  "ves-gason": "haut",
  // Vêtements de sport (rad-espo)
  "mayo-chot-espo": "ensemble",
  sivetman: "ensemble",
} as const satisfies Record<string, PieceVetement>;

export type SousRayonEssayage = keyof typeof SOUS_RAYONS_ESSAYAGE;

/** Le sous-rayon d'une fiche est-il ouvert à l'essayage ? Les propriétés héritées d'un objet ne comptent pas. */
export function sousRayonOuvert(slug: string | null | undefined): slug is SousRayonEssayage {
  return typeof slug === "string" && Object.prototype.hasOwnProperty.call(SOUS_RAYONS_ESSAYAGE, slug);
}

export function pieceDuSousRayon(slug: SousRayonEssayage): PieceVetement {
  return SOUS_RAYONS_ESSAYAGE[slug];
}

/**
 * Groupes de mesure (docs/74 §7) : la moitié des acheteurs voit le bouton,
 * l'autre moitié sert de témoin. Le groupe dépend seulement de l'identifiant
 * et du sel : un acheteur ne change jamais de groupe pendant une mesure.
 */
export type GroupeMesure = "essai" | "temoin";

/** Le sel de la mesure en cours. Le changer rebat les groupes pour une nouvelle mesure. */
export const SEL_MESURE = "essayage-pilote-2026-10";

export function groupeDe(acheteurId: string, sel: string = SEL_MESURE): GroupeMesure {
  return hacher(`${sel}:${acheteurId}`) % 2 === 0 ? "essai" : "temoin";
}

/** FNV-1a 32 bits, puis le mélange final de MurmurHash3 : tous les bits comptent, pas seulement les derniers. */
function hacher(texte: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Le quota se compte par jour civil haïtien, comme les engagements de livraison (lib/product-commitments.ts). */
export const FUSEAU_HAITI = "America/Port-au-Prince";

export function jourHaiti(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU_HAITI, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/**
 * Pourquoi un essai se refuse. Les mêmes codes sortent de la base et des
 * routes, et chacun a son message dans `lib/i18n.ts`.
 */
export const REFUS_ESSAYAGE = ["interrupteur", "anonyme", "non_eligible", "quota", "plafond", "pause", "photo"] as const;
export type RefusEssayage = (typeof REFUS_ESSAYAGE)[number];
