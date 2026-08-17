/**
 * COMPRESSION D'IMAGE CÔTÉ NAVIGATEUR — avant l'envoi, jamais après.
 *
 * ─── POURQUOI CLIENT, ET PAS SERVEUR ───────────────────────────────────────
 * Compresser au serveur réduit ce que l'ACHETEUR télécharge ; compresser au
 * navigateur réduit ce que le VENDEUR téléverse. Deux chemins, deux
 * populations, deux goulots — et l'upload est le moment le plus fragile de
 * tout le parcours : une photo de 6 Mo poussée depuis un Android d'entrée de
 * gamme sur un réseau Digicel dégradé, c'est plusieurs minutes pendant
 * lesquelles n'importe quelle coupure annule tout. Les trois brouillons
 * abandonnés du 2026-08-11 sont ce scénario.
 *
 * Le serveur reste un PLAFOND (poids ET dimensions, `lib/image-limits.ts`) :
 * un client peut être contourné, un plafond serveur non. Le mécanisme est
 * ici, la garantie est là-bas.
 *
 * ─── ZÉRO DÉPENDANCE ───────────────────────────────────────────────────────
 * `createImageBitmap` + `<canvas>` + `toBlob` sont dans tous les navigateurs
 * visés. Ajouter une bibliothèque de compression sur un chemin que le vendeur
 * charge en 3G coûterait plus d'octets qu'elle n'en économise.
 */

import { COVER_MAX_COTE, COVER_CIBLE_OCTETS, COVER_MAX_OCTETS } from "./image-limits";

export type Compression = {
  fichier: File;
  /** Poids d'origine, en octets — affiché au vendeur. */
  avant: number;
  /** Poids après compression. Égal à `avant` si on a renoncé (voir plus bas). */
  apres: number;
  largeur: number;
  hauteur: number;
};

/**
 * Réduit une image à `COVER_MAX_COTE` sur son grand côté et la ré-encode en
 * WebP, en baissant la qualité jusqu'à passer sous la cible.
 *
 * ⚠️ NE JETTE JAMAIS et ne rend jamais plus lourd. En cas d'échec — format
 * exotique, canvas indisponible, image déjà minuscule — on renvoie le fichier
 * D'ORIGINE. Un vendeur bloqué par un compresseur qui refuse sa photo serait
 * un défaut pire que la photo lourde : le plafond serveur, lui, tiendra.
 */
export async function compresserImage(source: File): Promise<Compression> {
  const echec = (): Compression => ({
    fichier: source,
    avant: source.size,
    apres: source.size,
    largeur: 0,
    hauteur: 0,
  });

  if (typeof createImageBitmap !== "function") return echec();

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source);
  } catch {
    return echec();
  }

  try {
    const facteur = Math.min(1, COVER_MAX_COTE / Math.max(bitmap.width, bitmap.height));
    const largeur = Math.round(bitmap.width * facteur);
    const hauteur = Math.round(bitmap.height * facteur);

    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    if (!ctx) return echec();
    ctx.drawImage(bitmap, 0, 0, largeur, hauteur);

    const versBlob = (q: number) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", q));

    /* Boucle de qualité, décroissante. Une qualité fixe sur une photo de
     * téléphone donne des résultats qui varient d'un facteur dix selon la
     * scène : c'est la TAILLE OBTENUE qui décide, pas un réglage choisi
     * d'avance. On s'arrête au premier passage sous la cible. */
    let blob: Blob | null = null;
    for (const q of [0.82, 0.72, 0.62, 0.5, 0.4]) {
      blob = await versBlob(q);
      if (blob && blob.size <= COVER_CIBLE_OCTETS) break;
    }
    if (!blob) return echec();

    // Ré-encoder peut GROSSIR une image déjà optimisée (petit JPEG, PNG plat).
    // Dans ce cas on garde l'original — comprimer ne veut pas dire alourdir.
    if (blob.size >= source.size) return echec();

    const nom = source.name.replace(/\.[^.]+$/, "") + ".webp";
    return {
      fichier: new File([blob], nom, { type: "image/webp" }),
      avant: source.size,
      apres: blob.size,
      largeur,
      hauteur,
    };
  } catch {
    return echec();
  } finally {
    bitmap.close?.();
  }
}

/** « 2,2 Mo », « 148 Ko » — lisible sur un écran de 360 px. */
export function poidsLisible(octets: number): string {
  if (octets >= 1024 * 1024) return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.round(octets / 1024)} Ko`;
}

/** Le plafond dur, ré-exporté pour les surfaces qui veulent l'annoncer. */
export { COVER_MAX_OCTETS };
