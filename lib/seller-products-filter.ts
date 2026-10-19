import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, type DigitalKind, type ProductKind } from "./product-kind";
import type { ProductStatus } from "./database.types";

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

export const FILTRES_PRODUITS = ["tous", "physiques", "services", "numeriques", "archivees"] as const;
export type FiltreProduits = (typeof FILTRES_PRODUITS)[number];

const TYPE_DU_FILTRE: Record<Exclude<FiltreProduits, "tous" | "archivees">, ProductKind> = {
  physiques: KIND_PHYSICAL,
  services: KIND_SERVICE,
  numeriques: KIND_FILE,
};

/**
 * Une fiche archivée a été retirée de la vente par la modération
 * (`/api/admin/product-status`). Audit du 2026-10-19 (UX-01) : elle
 * s'affichait « En attente de revue » et gonflait les compteurs des onglets.
 * Elle n'apparaît plus que sous « Archivés ».
 */
const ARCHIVEE: ProductStatus = "archived";
export const estArchivee = (status: string) => status === ARCHIVEE;

type Fiche = { kind: string; status: string };

const premier = (valeur: unknown) => (Array.isArray(valeur) ? valeur[0] : valeur);

/** Le filtre demandé par l'URL ; toute autre valeur, ou aucune, vaut « tous ». */
export function lireFiltre(valeur: unknown): FiltreProduits {
  const v = premier(valeur);
  return typeof v === "string" && (FILTRES_PRODUITS as readonly string[]).includes(v) ? (v as FiltreProduits) : "tous";
}

/**
 * La fiche entre-t-elle dans le filtre ? Une fiche archivée n'apparaît que
 * sous « archivees » ; un type inconnu n'apparaît que sous « tous ».
 */
export function dansLeFiltre(fiche: Fiche, filtre: FiltreProduits): boolean {
  if (estArchivee(fiche.status)) return filtre === "archivees";
  if (filtre === "tous") return true;
  return filtre !== "archivees" && TYPE_DU_FILTRE[filtre] === fiche.kind;
}

/** Le nombre de fiches par onglet, pour l'afficher à côté de son nom. */
export function compterParFiltre(fiches: Fiche[]): Record<FiltreProduits, number> {
  const n = { tous: 0, physiques: 0, services: 0, numeriques: 0, archivees: 0 };
  for (const f of fiches) {
    if (estArchivee(f.status)) {
      n.archivees += 1;
      continue;
    }
    n.tous += 1;
    if (f.kind === KIND_PHYSICAL) n.physiques += 1;
    else if (f.kind === KIND_SERVICE) n.services += 1;
    else if (f.kind === KIND_FILE) n.numeriques += 1;
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

/**
 * L'adresse qui ouvre le formulaire d'un type, avec ce type déjà choisi.
 * Elle arrive SUR le formulaire (UX-03) : au téléphone, revenir au choix du
 * type laissait le formulaire sous l'écran.
 */
export function hrefNouveau(valeur: typeof NOUVEAU_FICHIER | typeof NOUVEAU_PRESTATION): string {
  return `/vendre?nouveau=${valeur}#formulaire`;
}

/** Où créer une fiche depuis un onglet vide (UX-07) ; rien sous « archivees ». */
export function hrefCreer(filtre: FiltreProduits): string | null {
  if (filtre === "physiques") return "/vendre/physique";
  if (filtre === "services") return hrefNouveau(NOUVEAU_PRESTATION);
  if (filtre === "numeriques") return hrefNouveau(NOUVEAU_FICHIER);
  if (filtre === "tous") return "/vendre#nouveau";
  return null;
}
