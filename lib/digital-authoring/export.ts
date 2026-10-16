import type { GuidePourPdf } from "./pdf/guide-pdf";
import { normaliserPourPdf, octetWinAnsi } from "./pdf/winansi";
import type { ProjetEditeur } from "./api";

/**
 * Studio de création éditoriale — l'export PDF (tâche 4.3 ; docs/70 §7.4).
 * Module PUR, sans dépendance serveur : les routes, l'éditeur et les tests le
 * partagent.
 *
 * Le chemin de dépôt est calculé ICI et, à l'identique, par la base (0145) :
 * la route dépose à ce chemin, la fonction d'enregistrement le recalcule, et
 * la route refuse de répondre s'ils diffèrent. Le chemin est adressé par le
 * contenu (empreinte des octets) : un même chemin porte toujours les mêmes octets.
 */

/** Version du moteur PDF : à changer dès que les octets d'un même guide changeraient. */
export const MOTEUR_PDF = "zabelie-pdf-1";

export const TABLE_EXPORTS = "zabelie_authoring_exports";

/** Durée d'un lien d'aperçu ou de téléchargement : assez pour ouvrir le fichier, pas pour le partager. */
export const LIEN_SECONDES = 5 * 60;

const HEX64 = /^[0-9a-f]{64}$/;

export function cheminExport(vendeur: string, projet: string, empreinte: string): string {
  return `${vendeur}/${projet}/${empreinte}.pdf`;
}

export function cheminExtrait(vendeur: string, projet: string, empreinte: string): string {
  return `${vendeur}/${projet}/${empreinte}-extrait.pdf`;
}

/** Ce que l'éditeur reçoit d'un export : jamais le chemin de stockage. */
export type ExportClient = {
  id: string;
  revision: number;
  empreinte: string;
  taille: number;
  pages: number;
  extraitTaille: number;
  extraitPages: number;
  creeLe: string;
  approuveLe: string | null;
};

const entier = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v > 0 ? v : null);

/** Une ligne de `zabelie_authoring_exports` mise en forme sûre, ou `null` si elle ne ressemble pas à un export. */
export function exportPourClient(ligne: unknown): ExportClient | null {
  if (!ligne || typeof ligne !== "object") return null;
  const l = ligne as Record<string, unknown>;
  const revision = entier(l.revision);
  const taille = entier(l.taille);
  const pages = entier(l.pages);
  const extraitTaille = entier(l.extrait_taille);
  const extraitPages = entier(l.extrait_pages);
  if (typeof l.id !== "string" || typeof l.empreinte !== "string" || !HEX64.test(l.empreinte)) return null;
  if (!revision || !taille || !pages || !extraitTaille || !extraitPages || typeof l.created_at !== "string") return null;
  return {
    id: l.id,
    revision,
    empreinte: l.empreinte,
    taille,
    pages,
    extraitTaille,
    extraitPages,
    creeLe: l.created_at,
    approuveLe: typeof l.approuve_le === "string" ? l.approuve_le : null,
  };
}

/** Une réponse de la route relue côté navigateur : même contrôle, forme `ExportClient`. */
export function lireExportClient(v: unknown): ExportClient | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  return exportPourClient({
    id: x.id, revision: x.revision, empreinte: x.empreinte, taille: x.taille, pages: x.pages,
    extrait_taille: x.extraitTaille, extrait_pages: x.extraitPages, created_at: x.creeLe, approuve_le: x.approuveLe,
  });
}

/** Les colonnes qu'on lit pour l'éditeur : le chemin reste côté serveur. */
export const COLONNES_EXPORT = "id, revision, empreinte, taille, pages, extrait_taille, extrait_pages, created_at, approuve_le";

/**
 * Le nom affiché du vendeur, réduit à ce que le PDF sait dessiner. Le guide,
 * lui, est refusé s'il contient un caractère sans dessin (fiche-test) ; le nom
 * ne se corrige pas dans l'éditeur, on ne bloque donc pas l'export pour lui.
 */
export function auteurPourPdf(nom: string): string {
  return [...normaliserPourPdf(nom)].filter((ch) => octetWinAnsi(ch.codePointAt(0) ?? 0) !== null).join("").replace(/ +/g, " ").trim();
}

/** Le guide tel que le moteur PDF le prend, depuis le projet relu en base. */
export function guidePourPdf(projet: ProjetEditeur, auteur: string): GuidePourPdf {
  return {
    langue: projet.langue,
    titre: projet.titre,
    objectif: projet.contenu.objectif,
    auteur: auteurPourPdf(auteur),
    sections: projet.contenu.sections.map((s) => ({ titre: s.titre, resultat: s.resultat, corps: s.corps })),
  };
}

/** Un export ne vaut que pour la révision courante ET approuvée du guide (T18). */
export function exportAJour(e: Pick<ExportClient, "revision">, projet: { revision: number; revisionApprouvee: number | null }): boolean {
  return e.revision === projet.revision && projet.revisionApprouvee === projet.revision;
}

/** Une taille lisible : « 84 Ko », « 1,2 Mo ». */
export function tailleLisible(octets: number, lang: string): string {
  const francophone = lang === "fr" || lang === "ht";
  const fmt = (n: number, d: number) => n.toLocaleString(francophone ? "fr" : lang, { maximumFractionDigits: d });
  if (octets < 1024 * 1024) return `${fmt(Math.max(1, Math.round(octets / 1024)), 0)} ${francophone ? "Ko" : "KB"}`;
  return `${fmt(octets / (1024 * 1024), 1)} ${francophone ? "Mo" : "MB"}`;
}
