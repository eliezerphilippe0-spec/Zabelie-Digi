import { createHash } from "node:crypto";
import type { ProjetEditeur } from "./api";
import { parseDigitalDetails, type DigitalDetails } from "../digital-details";
import { parseDigitalStudio, type DigitalStudio } from "../digital-studio";

/**
 * Studio de création éditoriale — « Soumettre à la revue » (tâche 5.2 ;
 * docs/70 §7.4 et §8, options C4-A et D2-A). Ce que la route partage avec les
 * tests, sans dépendance serveur autre que `node:crypto`.
 *
 * La soumission crée la fiche produit (par la fonction partagée de
 * `app/api/products`, tâche 5.1), puis dépose et confirme le PDF approuvé
 * (par la logique de `app/api/products/asset`). Elle ne publie RIEN : la fiche
 * reste en brouillon et la modération existante décide.
 */

/** La colonne posée par 0148 : un projet, une fiche (index unique partiel). */
export const COLONNE_LIEN = "zabelie_authoring_project_id";

/** Dix soumissions par vendeur et par dix minutes : chacune lit et recopie un PDF. */
export const SOUMISSIONS_MAX = 10;
export const SOUMISSIONS_FENETRE = 600;

const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Un identifiant au format UUID tiré de l'empreinte des octets (version 8,
 * « sur mesure », RFC 9562). Le livrable déposé par le Studio a donc un
 * chemin DÉTERMINISTE : une reprise après panne retombe sur le même objet et
 * la même ligne, au lieu d'en créer un second. Le motif de chemin de la
 * confirmation partagée l'accepte tel quel.
 */
export function uuidDepuisEmpreinte(empreinte: string): string {
  if (!HEX64.test(empreinte)) throw new Error("empreinte invalide");
  const h = empreinte.slice(0, 32).split("");
  h[12] = "8";
  h[16] = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16);
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Le chemin du livrable sous la fiche, dans le bucket des fichiers vendus. */
export function cheminLivrable(vendeur: string, produit: string, empreinte: string): string {
  return `${vendeur}/${produit}/liv-${uuidDepuisEmpreinte(empreinte)}.pdf`;
}

/** SHA-256 hexadécimal des octets : on recopie le PDF approuvé, pas un autre. */
export function empreinteOctets(octets: Uint8Array): string {
  return createHash("sha256").update(octets).digest("hex");
}

/**
 * Le nom que l'acheteur verra à l'enregistrement, tiré du titre. Mêmes
 * caractères que la route d'envoi de fichiers ; les accents sont retirés
 * plutôt que remplacés par un souligné, pour qu'il reste lisible.
 */
export function nomDeFichier(titre: string): string {
  const base = titre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return `${base || "guide"}.pdf`;
}

/** La description de départ de la fiche : l'objectif et le sommaire du guide. Le vendeur la retouche ensuite. */
export function descriptionDepuisGuide(projet: Pick<ProjetEditeur, "contenu">): string {
  const objectif = projet.contenu.objectif.trim();
  const sommaire = projet.contenu.sections.map((s) => s.titre.trim()).filter(Boolean).map((t) => `• ${t}`);
  return [objectif, sommaire.join("\n")].filter(Boolean).join("\n\n");
}

export type EntreeSoumission = {
  exportId: string;
  /** Prix et rayon ne servent qu'à CRÉER la fiche : absents, ils sont exigés seulement s'il n'y en a pas. */
  prix: number | null;
  rayon: string | null;
  sousRayon: string | null;
  attestation: boolean;
};

const absent = (x: unknown) => x === undefined || x === null;

/**
 * Le corps de la requête, en forme sûre. Le prix, le rayon et l'attestation
 * sont revalidés par la création de brouillon partagée (mêmes règles que
 * `/vendre`) : on ne vérifie ici que les types. Une valeur présente mais mal
 * formée est refusée, jamais lue comme absente.
 */
export function lireEntreeSoumission(brut: unknown): EntreeSoumission | null {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return null;
  const b = brut as Record<string, unknown>;
  if (typeof b.export !== "string" || !UUID.test(b.export)) return null;
  if (!absent(b.prix) && (typeof b.prix !== "number" || !Number.isFinite(b.prix))) return null;
  if (!absent(b.rayon) && (typeof b.rayon !== "string" || !b.rayon.trim())) return null;
  if (!absent(b.sousRayon) && typeof b.sousRayon !== "string") return null;
  return {
    exportId: b.export,
    prix: typeof b.prix === "number" ? b.prix : null,
    rayon: typeof b.rayon === "string" ? b.rayon : null,
    sousRayon: typeof b.sousRayon === "string" && b.sousRayon ? b.sousRayon : null,
    attestation: b.attestation === true,
  };
}

/** Ce qu'on lit d'un export pour le soumettre : le chemin reste côté serveur. */
export const COLONNES_EXPORT_SOUMISSION = "id, project_id, revision, empreinte, chemin, pages, approuve_le, approuve_empreinte";

export type ExportSoumis = { id: string; revision: number; empreinte: string; chemin: string; pages: number | null };

/**
 * L'export qu'on peut soumettre : celui de CE projet, de la révision courante
 * et approuvée du guide (T18), et dont l'empreinte exacte a été approuvée
 * (T28). Toute autre ligne rend `null` avec la raison.
 */
export function exportSoumettable(
  ligne: unknown,
  projet: Pick<ProjetEditeur, "id" | "revision" | "revisionApprouvee">
): { ok: true; export: ExportSoumis } | { ok: false; raison: "introuvable" | "perime" | "non_approuve" } {
  if (!ligne || typeof ligne !== "object") return { ok: false, raison: "introuvable" };
  const l = ligne as Record<string, unknown>;
  if (typeof l.id !== "string" || l.project_id !== projet.id || typeof l.chemin !== "string" || !l.chemin) {
    return { ok: false, raison: "introuvable" };
  }
  if (typeof l.empreinte !== "string" || !HEX64.test(l.empreinte) || typeof l.revision !== "number") {
    return { ok: false, raison: "introuvable" };
  }
  if (l.revision !== projet.revision || projet.revisionApprouvee !== projet.revision) return { ok: false, raison: "perime" };
  if (typeof l.approuve_le !== "string" || l.approuve_empreinte !== l.empreinte) return { ok: false, raison: "non_approuve" };
  const pages = typeof l.pages === "number" && Number.isSafeInteger(l.pages) && l.pages > 0 ? l.pages : null;
  return { ok: true, export: { id: l.id, revision: l.revision, empreinte: l.empreinte, chemin: l.chemin, pages } };
}

/** Ce que l'éditeur reçoit de la fiche rattachée : jamais l'identifiant interne seul. */
export type FicheRattachee = { slug: string; statut: string };

export function fichePourClient(ligne: unknown): FicheRattachee | null {
  if (!ligne || typeof ligne !== "object") return null;
  const l = ligne as Record<string, unknown>;
  if (typeof l.slug !== "string" || typeof l.status !== "string") return null;
  return { slug: l.slug, statut: l.status };
}

// ── Tâche 5.3 : la fiche pré-remplie depuis le guide ─────────────────────────
// Par les contrats EXISTANTS de l'atelier numérique (`parseDigitalDetails`,
// `parseDigitalStudio`) : ce qui ne passe pas leur validation n'est pas
// écrit. Le vendeur retouche ensuite tout dans ses produits ; une soumission
// suivante n'écrase jamais ce qu'il a changé (insertion seulement si absent).

const LANGUES: Record<ProjetEditeur["langue"], string> = { ht: "Kreyòl ayisyen", fr: "Français" };
const PAGES: Record<ProjetEditeur["langue"], string> = { ht: "{n} paj", fr: "{n} pages" };

/** Coupe un texte à `max` caractères, à une fin de mot quand c'est possible. */
export function borner(texte: string, max: number): string {
  const t = texte.trim();
  if (t.length <= max) return t;
  const coupe = t.slice(0, max - 1);
  const fin = Math.max(coupe.lastIndexOf("\n"), coupe.lastIndexOf(" "));
  return `${(fin > max / 2 ? coupe.slice(0, fin) : coupe).trimEnd()}…`;
}

/** Format, langue et contenu (pages, sommaire) : les faits que l'acheteur lit avant d'acheter. */
export function detailsDepuisGuide(projet: Pick<ProjetEditeur, "langue" | "contenu">, pages: number | null): DigitalDetails | null {
  const sommaire = projet.contenu.sections.map((s) => s.titre.trim()).filter(Boolean).map((t) => `• ${t}`).join("\n");
  const volume = pages ? PAGES[projet.langue].replace("{n}", String(pages)) : "";
  return parseDigitalDetails({
    formats: "PDF",
    language: LANGUES[projet.langue],
    compatibility: "",
    license: "",
    contents: borner([volume, sommaire].filter(Boolean).join("\n"), 1600),
    updates: "",
  });
}

/**
 * L'aperçu, les résultats et les prérequis. L'aperçu reprend la première
 * section, celle que contient déjà l'extrait gratuit que le vendeur a vu et
 * approuvé avec son PDF (4.4) : rien de plus n'est rendu public.
 */
export function studioDepuisGuide(projet: Pick<ProjetEditeur, "brief" | "contenu">): DigitalStudio | null {
  const premiere = projet.contenu.sections[0];
  return parseDigitalStudio({
    mode: "file",
    preview: premiere ? borner([premiere.titre, premiere.corps].map((x) => x.trim()).filter(Boolean).join("\n\n"), 6000) : "",
    outcomes: borner(projet.brief.resultat, 1600),
    prerequisites: borner(projet.brief.prerequis, 1200),
    include_updates: false,
    lessons: [],
    faq: [],
  });
}
