import { renderSVG } from "uqr";
import type { CreatorProfile } from "@/lib/creators";
import { hrefBoutique } from "@/lib/boutique-href";
import { siteUrl } from "@/lib/site-url";

/**
 * LE QR DE LA VITRINE (docs/75 §5.A, PR-Z1 ; V-24 A3).
 *
 * L'URL n'est jamais reçue de l'appelant : elle se construit ici, par
 * `hrefBoutique`, comme le lien affiché juste au-dessus. Une affiche imprimée
 * ne se corrige pas — un QR qui mènerait ailleurs que la boutique serait
 * collé au mur pendant des mois.
 *
 * Noir sur blanc, quel que soit le thème : c'est un contenu à scanner, pas un
 * élément d'interface. Une marge de 4 modules (la zone de silence de la norme)
 * et la correction M, qui tolère une affiche un peu abîmée.
 */
export const QR_ENCRE = "#000000";
export const QR_FOND = "#ffffff";
export const QR_OPTIONS = { ecc: "M", border: 4, pixelSize: 1, blackColor: QR_ENCRE, whiteColor: QR_FOND } as const;

export type QrBoutique = { url: string; svg: string; dataUrl: string; fichier: string };

export function qrBoutique(creator: Pick<CreatorProfile, "id" | "boutikSlug">): QrBoutique {
  const chemin = hrefBoutique(creator);
  const url = `${siteUrl()}${chemin}`;
  const svg = renderSVG(url, QR_OPTIONS);
  return {
    url,
    svg,
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    fichier: `zabelie-${chemin.split("/").pop()}-qr.svg`,
  };
}
