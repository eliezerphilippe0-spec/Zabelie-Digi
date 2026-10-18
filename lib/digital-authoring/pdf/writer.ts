import { createHash } from "node:crypto";
import { FORMAT, type MiseEnPage } from "./layout";
import type { PoliceStandard } from "./metrics";
import { NL, versOctets } from "./winansi";

/**
 * Écriture du fichier PDF 1.4 (Studio de création, tâche 4.1 ; décision D1-A).
 *
 * Polices standard non embarquées (aucune question de licence), encodage
 * WinAnsi, flux non compressés : un guide de 30 pages reste à quelques
 * centaines de Kio et chaque octet est explicable. Aucune date, aucun aléa :
 * l'identifiant du document est l'empreinte de son contenu. Le fichier est
 * entièrement ASCII hormis les quatre octets binaires de l'en-tête, si bien
 * que la position d'un caractère est sa position en octets (table `xref`).
 */

const BS = String.fromCharCode(92); // antislash, par point de code
const POLICES: Record<PoliceStandard, string> = { Helvetica: "F1", "Helvetica-Bold": "F2", "Helvetica-Oblique": "F3" };

const nombre = (n: number) => String(Math.round(n * 100) / 100);

/** Chaîne PDF littérale : parenthèses et antislash échappés, octets non ASCII en octal. */
function chaine(octets: number[]): string {
  let s = "(";
  for (const o of octets) {
    if (o === 0x28 || o === 0x29 || o === 0x5c) s += BS + String.fromCharCode(o);
    else if (o < 0x20 || o > 0x7e) s += BS + o.toString(8).padStart(3, "0");
    else s += String.fromCharCode(o);
  }
  return s + ")";
}

/** Chaîne de texte du dictionnaire d'informations : UTF-16BE en hexadécimal, avec sa marque d'ordre. */
function texteInfo(texte: string): string {
  let h = "<FEFF";
  for (let i = 0; i < texte.length; i++) h += texte.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0");
  return h + ">";
}

function flux(mep: MiseEnPage, index: number): string {
  const parts: string[] = [];
  let gris: boolean | null = null;
  for (const l of mep.pages[index].lignes) {
    if (gris !== l.gris) {
      parts.push(l.gris ? "0.35 g" : "0 g");
      gris = l.gris;
    }
    parts.push(`BT /${POLICES[l.police]} ${nombre(l.taille)} Tf ${nombre(l.x)} ${nombre(l.y)} Td ${chaine(versOctets(l.texte))} Tj ET`);
  }
  return parts.join(NL);
}

export function ecrirePdf(mep: MiseEnPage, titre: string): Uint8Array {
  const flux_ = mep.pages.map((_, i) => flux(mep, i));
  const id = createHash("sha256").update(titre + NL + flux_.join(NL + "%page" + NL)).digest("hex").slice(0, 32).toUpperCase();

  const objets: string[] = [];
  const kids = mep.pages.map((_, i) => `${7 + 2 * i} 0 R`).join(" ");
  objets[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objets[2] = `<< /Type /Pages /Kids [${kids}] /Count ${mep.pages.length} >>`;
  objets[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objets[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objets[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>";
  objets[6] = `<< /Title ${texteInfo(titre)} /Producer (Zabelie) >>`;
  const ressources = "<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>";
  flux_.forEach((contenu, i) => {
    objets[7 + 2 * i] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${nombre(FORMAT.largeur)} ${nombre(FORMAT.hauteur)}] ` +
      `/Resources ${ressources} /Contents ${8 + 2 * i} 0 R >>`;
    objets[8 + 2 * i] = `<< /Length ${contenu.length} >>` + NL + "stream" + NL + contenu + NL + "endstream";
  });

  let pdf = "%PDF-1.4" + NL + "%" + String.fromCharCode(0xe2, 0xe3, 0xcf, 0xd3) + NL;
  const positions: number[] = [];
  for (let n = 1; n < objets.length; n++) {
    positions[n] = pdf.length;
    pdf += `${n} 0 obj` + NL + objets[n] + NL + "endobj" + NL;
  }
  const xref = pdf.length;
  pdf += "xref" + NL + `0 ${objets.length}` + NL + "0000000000 65535 f " + NL;
  for (let n = 1; n < objets.length; n++) pdf += String(positions[n]).padStart(10, "0") + " 00000 n " + NL;
  pdf += "trailer" + NL + `<< /Size ${objets.length} /Root 1 0 R /Info 6 0 R /ID [<${id}> <${id}>] >>` + NL;
  pdf += "startxref" + NL + xref + NL + "%%EOF" + NL;
  return Uint8Array.from(Buffer.from(pdf, "latin1"));
}
