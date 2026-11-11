import { pickByKind, type ProductKind } from "@/lib/product-kind";
import { NOUVEAU_FICHIER, NOUVEAU_PRESTATION } from "@/lib/seller-products-filter";
import { IMPORT_DESCRIPTION_MAX, IMPORT_TITRE_MAX, texteSeul } from "@/lib/import-fiche";

/**
 * FICHE PRÉPARÉE PAR UN ASSISTANT (lot 3b, 0171) — ce module est pur.
 *
 * Un assistant qui tient la clé d'API d'un vendeur (portée `products:prepare`)
 * dépose un titre, un texte et un prix proposé. Ce n'est PAS un produit : rien
 * n'entre dans `products`, rien n'est publié, rien ne passe en revue. Le
 * vendeur ouvre l'adresse rendue, retrouve le texte dans le formulaire
 * habituel, le relit, accepte LUI-MÊME la politique des produits interdits et
 * envoie. La création, la revue humaine et la publication restent celles du
 * formulaire : ce module ne leur ajoute aucun chemin.
 *
 * Les bornes (20 en attente, 7 jours) sont imposées par la base (`0171`) ;
 * elles sont redites ici pour les textes, et `tests/fiche-preparee.test.ts`
 * croise les deux.
 */
export const FICHES_PREPAREES_MAX_EN_ATTENTE = 20;
/** Fiches NON EXPIRÉES par vendeur, reprises comprises (second plafond de `0171`). */
export const FICHES_PREPAREES_MAX_TOTAL = 100;
export const FICHE_PREPAREE_JOURS = 7;
/** Dépôts par heure et par vendeur, toutes clés confondues. */
export const FICHES_PREPAREES_PAR_HEURE = 30;

export const PARAM_PREPAREE = "preparee";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** L'identifiant porté par `?preparee=`, ou `null` s'il n'en a pas la forme : rien d'autre n'atteint la base. */
export function lireIdPreparee(valeur: unknown): string | null {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return typeof v === "string" && UUID.test(v.toLowerCase()) ? v.toLowerCase() : null;
}

/**
 * Le chemin du formulaire où le vendeur reprend la fiche. Le type choisit le
 * formulaire par `pickByKind` : un type ajouté à l'énumération sans branche
 * ici rend `null`, et le dépôt est refusé plutôt que d'ouvrir le mauvais formulaire.
 */
export function cheminFichePreparee(kind: ProductKind, id: string): string | null {
  const q = `${PARAM_PREPAREE}=${encodeURIComponent(id)}`;
  return pickByKind<string>(kind, {
    file: `/vendre?nouveau=${NOUVEAU_FICHIER}&${q}#formulaire`,
    service: `/vendre?nouveau=${NOUVEAU_PRESTATION}&${q}#formulaire`,
    physical: `/vendre/physique?${q}`,
  }) ?? null;
}

/* Un demi-caractère (substitut isolé) n'est pas du texte : Postgres le refuse,
 * et le dépôt finirait en panne au lieu d'un texte propre. Un client qui coupe
 * au milieu d'un émoji en produit un. Sous le drapeau `u`, cette classe ne
 * touche PAS une paire bien formée, qui compte pour un seul caractère. */
const SUBSTITUTS_ISOLES = /[\uD800-\uDFFF]/gu;
const sansSubstitutsIsoles = (brut: unknown) => (typeof brut === "string" ? brut.replace(SUBSTITUTS_ISOLES, "") : brut);

/** Titre d'une fiche préparée : du texte sur une ligne, borné comme le formulaire. `""` si rien de lisible. */
export function titrePrepare(brut: unknown): string {
  return texteSeul(sansSubstitutsIsoles(brut), IMPORT_TITRE_MAX).replace(SUBSTITUTS_ISOLES, "").replace(/\s+/g, " ").trim();
}

/** Description : du texte, sauts de ligne gardés, bornée comme le formulaire. `null` si vide. */
export function descriptionPreparee(brut: unknown): string | null {
  const t = texteSeul(sansSubstitutsIsoles(brut), IMPORT_DESCRIPTION_MAX).replace(SUBSTITUTS_ISOLES, "").trim();
  return t ? t : null;
}

/** Ce que la page remet au formulaire. */
export type FichePrepareeLue = {
  id: string;
  titre: string;
  description: string;
  prixHtg: number | null;
  /** Nom de la clé qui l'a déposée, pour que le vendeur sache d'où elle vient. `null` si la clé n'existe plus. */
  cle: string | null;
  dejaReprise: boolean;
};

/** Une ligne de la liste « Fiches préparées » du tableau de bord. */
export type FichePrepareeListee = {
  id: string;
  titre: string;
  prixHtg: number | null;
  /** Adresse du formulaire où la reprendre. */
  chemin: string;
  expireLe: string;
  dejaReprise: boolean;
};
