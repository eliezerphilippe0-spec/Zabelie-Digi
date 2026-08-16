/**
 * PLAFONDS D'IMAGE — partagés par le compresseur client et le garde serveur.
 *
 * Une seule source : un plafond recopié des deux côtés finit par diverger, et
 * la divergence se voit uniquement le jour où un vendeur est refusé pour une
 * raison que l'écran ne lui a pas annoncée.
 *
 * Le CLIENT vise `CIBLE` (ce qu'on veut obtenir), le SERVEUR refuse au-delà
 * de `MAX` (ce qu'on tolère). L'écart entre les deux est délibéré : une photo
 * que le compresseur n'a pas réussi à faire descendre à 300 Ko doit quand
 * même pouvoir passer si elle tient sous 1,5 Mo — le vendeur n'est pas puni
 * pour une scène que l'encodeur digère mal.
 */

/** Grand côté après redimensionnement. 1600 px couvre la fiche produit en 2×. */
export const COVER_MAX_COTE = 1600;

/** Ce que le compresseur client VISE. */
export const COVER_CIBLE_OCTETS = 300 * 1024;

/** Ce que le serveur TOLÈRE — au-delà, refus. */
export const COVER_MAX_OCTETS = 1_500 * 1024;

/** Dimension au-delà de laquelle le serveur refuse, quel que soit le poids. */
export const COVER_MAX_DIMENSION = 4000;

/**
 * Dimensions d'une image depuis ses PREMIERS OCTETS — sans dépendance ni
 * décodage complet.
 *
 * ⚠️ Le poids seul ne suffit pas comme plafond serveur : une « bombe de
 * décompression » (PNG de 40 000 × 40 000 px, quelques kilo-octets une fois
 * compressé) passerait le contrôle de taille et ferait exploser la mémoire de
 * tout ce qui la redimensionnerait ensuite. C'est pour ça que le prompt
 * demandait poids ET dimensions.
 *
 * Rend `null` si le format n'est pas reconnu — l'appelant décide quoi en
 * faire ; ici, on refuse (fail-closed), parce qu'un format qu'on ne sait pas
 * lire est un format qu'on ne sait pas borner.
 */
export function dimensionsDepuisEntete(
  buf: Uint8Array
): { largeur: number; hauteur: number } | null {
  const be32 = (i: number) =>
    (buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3];
  const le16 = (i: number) => buf[i] | (buf[i + 1] << 8);
  const be16 = (i: number) => (buf[i] << 8) | buf[i + 1];

  // ── PNG : signature 8 octets, puis IHDR (largeur/hauteur en big-endian) ──
  if (
    buf.length > 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) {
    return { largeur: be32(16), hauteur: be32(20) };
  }

  // ── WebP : "RIFF" .... "WEBP" puis un chunk VP8 / VP8L / VP8X ────────────
  if (
    buf.length > 30 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    const type = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (type === "VP8X") {
      const l = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const h = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { largeur: l, hauteur: h };
    }
    if (type === "VP8 ") {
      return { largeur: le16(26) & 0x3fff, hauteur: le16(28) & 0x3fff };
    }
    if (type === "VP8L") {
      const b = buf[21] | (buf[22] << 8) | (buf[23] << 16) | (buf[24] << 24);
      return { largeur: (b & 0x3fff) + 1, hauteur: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }

  // ── JPEG : parcours des marqueurs jusqu'à un SOF (hors DHT/DAC/RST) ──────
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marqueur = buf[i + 1];
      // SOF0..SOF15, en excluant DHT (c4), DAC (cc) et les RST (d0-d7).
      if (
        marqueur >= 0xc0 && marqueur <= 0xcf &&
        marqueur !== 0xc4 && marqueur !== 0xcc &&
        !(marqueur >= 0xd0 && marqueur <= 0xd7)
      ) {
        return { hauteur: be16(i + 5), largeur: be16(i + 7) };
      }
      const longueur = be16(i + 2);
      if (longueur < 2) return null;
      i += 2 + longueur;
    }
    return null;
  }

  return null;
}
