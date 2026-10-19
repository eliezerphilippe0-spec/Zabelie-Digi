import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, type DigitalKind, type ProductKind } from "./product-kind";

/**
 * La page « Produits » du vendeur (`/vendre`) : un filtre par type, et le
 * formulaire à ouvrir. Module PUR, partagé par la page et les tests.
 *
 * Né le 2026-10-18 : la page n'offrait qu'un formulaire « fichier ou
 * service » et une liste mêlant tous les types. Un vendeur de produits
 * physiques arrivait du tableau de bord sur un écran pensé pour le numérique.
 *
 * Les valeurs d'URL ont leurs propres mots (au pluriel pour les onglets,
 * `prestation` pour le formulaire de service) : les littéraux des types de
 * produit ne s'écrivent que dans `lib/product-kind.ts`.
 */

export const FILTRES_PRODUITS = ["tous", "physiques", "services", "numeriques"] as const;
export type FiltreProduits = (typeof FILTRES_PRODUITS)[number];

const TYPE_DU_FILTRE: Record<Exclude<FiltreProduits, "tous">, ProductKind> = {
  physiques: KIND_PHYSICAL,
  services: KIND_SERVICE,
  numeriques: KIND_FILE,
};

const premier = (valeur: unknown) => (Array.isArray(valeur) ? valeur[0] : valeur);

/** Le filtre demandé par l'URL ; toute autre valeur, ou aucune, vaut « tous ». */
export function lireFiltre(valeur: unknown): FiltreProduits {
  const v = premier(valeur);
  return typeof v === "string" && (FILTRES_PRODUITS as readonly string[]).includes(v) ? (v as FiltreProduits) : "tous";
}

/** La fiche entre-t-elle dans le filtre ? Un type inconnu n'apparaît que sous « tous ». */
export function dansLeFiltre(kind: string, filtre: FiltreProduits): boolean {
  return filtre === "tous" || TYPE_DU_FILTRE[filtre] === kind;
}

/** Le nombre de fiches par onglet, pour l'afficher à côté de son nom. */
export function compterParFiltre(kinds: string[]): Record<FiltreProduits, number> {
  const n = { tous: kinds.length, physiques: 0, services: 0, numeriques: 0 };
  for (const k of kinds) {
    if (k === KIND_PHYSICAL) n.physiques += 1;
    else if (k === KIND_SERVICE) n.services += 1;
    else if (k === KIND_FILE) n.numeriques += 1;
  }
  return n;
}

/** Les valeurs de `?nouveau=` : le formulaire à ouvrir sous « Nouveau produit ». */
export const NOUVEAU_FICHIER = "numerique";
export const NOUVEAU_PRESTATION = "prestation";

/**
 * Le formulaire à ouvrir. Le physique a sa propre page (`/vendre/physique`) ;
 * seuls le fichier et le service s'ouvrent ici, avec leur type déjà choisi.
 * `null` : on montre seulement le choix du type.
 */
export function lireNouveau(valeur: unknown): DigitalKind | null {
  const v = premier(valeur);
  if (v === NOUVEAU_FICHIER) return KIND_FILE;
  if (v === NOUVEAU_PRESTATION) return KIND_SERVICE;
  return null;
}

/** L'adresse d'un onglet : sans paramètre pour « tous », pour garder une URL propre. */
export function hrefFiltre(filtre: FiltreProduits): string {
  return filtre === "tous" ? "/vendre#mes-produits" : `/vendre?type=${filtre}#mes-produits`;
}

/** L'adresse qui ouvre le formulaire d'un type, avec ce type déjà choisi. */
export function hrefNouveau(valeur: typeof NOUVEAU_FICHIER | typeof NOUVEAU_PRESTATION): string {
  return `/vendre?nouveau=${valeur}#nouveau`;
}
