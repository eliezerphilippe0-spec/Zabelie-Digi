import { brotliDecompressSync } from "node:zlib";

/**
 * LECTEUR WOFF2 MINIMAL — ce qu'une police CONTIENT, lu dans le fichier.
 *
 * Écrit pour `tests/police-inter.test.ts` : la couverture kreyòl et les
 * symboles d'interface sont une propriété du FICHIER, et une assertion sur le
 * CSS ou sur le nom du fichier resterait verte devant une police régénérée
 * sans `ò`. Seules les tables non transformées par WOFF2 sont lues (`cmap`,
 * `GSUB`, `GPOS`, `fvar`) ; `glyf`/`loca`/`hmtx` ne sont jamais décodées.
 *
 * Aucune dépendance : `zlib` de Node décompresse le Brotli. Spécification :
 * https://www.w3.org/TR/WOFF2/ (§5 en-tête et répertoire, §4.1 UIntBase128).
 *
 * ⚠️ Éprouvé contre fontTools sur le fichier du dépôt ET sur l'Inter servie par
 * Google (voir le test) : un lecteur qui n'a jamais lu qu'un seul fichier n'a
 * pas démontré qu'il lisait.
 */

const ETIQUETTES_CONNUES = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

export type PoliceLue = {
  /** Points de code ayant un glyphe (glyphe ≠ 0). */
  caracteres: Set<number>;
  /** Étiquettes de fonctionnalités OpenType (GSUB), p. ex. `zero`, `cv05`. */
  fonctionnalitesGsub: Set<string>;
  /** Étiquettes de fonctionnalités de positionnement (GPOS), p. ex. `kern`. */
  fonctionnalitesGpos: Set<string>;
  /** Axes de variation : étiquette → [min, max]. */
  axes: Map<string, [number, number]>;
};

function lireUIntBase128(buf: Buffer, pos: number): [number, number] {
  let valeur = 0;
  for (let i = 0; i < 5; i++) {
    const octet = buf[pos + i];
    if (i === 0 && octet === 0x80) throw new Error("UIntBase128 : zéro de tête");
    if (valeur & 0xfe000000) throw new Error("UIntBase128 : dépassement");
    valeur = (valeur << 7) | (octet & 0x7f);
    if ((octet & 0x80) === 0) return [valeur >>> 0, pos + i + 1];
  }
  throw new Error("UIntBase128 : plus de 5 octets");
}

function tables(woff2: Buffer): Map<string, Buffer> {
  if (woff2.readUInt32BE(0) !== 0x774f4632) throw new Error("pas un fichier WOFF2 (signature)");
  const nbTables = woff2.readUInt16BE(12);
  const tailleCompressee = woff2.readUInt32BE(20);

  let pos = 48;
  const entrees: { etiquette: string; longueur: number }[] = [];
  for (let i = 0; i < nbTables; i++) {
    const drapeaux = woff2[pos++];
    const index = drapeaux & 0x3f;
    const versionTransformation = drapeaux >> 6;
    let etiquette: string;
    if (index === 63) {
      etiquette = woff2.toString("latin1", pos, pos + 4);
      pos += 4;
    } else {
      etiquette = ETIQUETTES_CONNUES[index];
    }
    let origine: number;
    [origine, pos] = lireUIntBase128(woff2, pos);
    // `glyf`/`loca` : la version 3 est l'ABSENCE de transformation ; pour
    // toutes les autres tables, c'est la version 0.
    const transformee =
      etiquette === "glyf" || etiquette === "loca" ? versionTransformation !== 3 : versionTransformation !== 0;
    let longueur = origine;
    if (transformee) [longueur, pos] = lireUIntBase128(woff2, pos);
    entrees.push({ etiquette, longueur });
  }

  const donnees = brotliDecompressSync(woff2.subarray(pos, pos + tailleCompressee));
  const somme = entrees.reduce((s, e) => s + e.longueur, 0);
  if (somme !== donnees.length) {
    throw new Error(`WOFF2 : ${donnees.length} octets décompressés pour ${somme} annoncés`);
  }
  const res = new Map<string, Buffer>();
  let curseur = 0;
  for (const e of entrees) {
    res.set(e.etiquette, donnees.subarray(curseur, curseur + e.longueur));
    curseur += e.longueur;
  }
  return res;
}

function caracteres(cmap: Buffer): Set<number> {
  const nb = cmap.readUInt16BE(2);
  const sousTables: { plateforme: number; codage: number; decalage: number }[] = [];
  for (let i = 0; i < nb; i++) {
    const p = 4 + i * 8;
    sousTables.push({ plateforme: cmap.readUInt16BE(p), codage: cmap.readUInt16BE(p + 2), decalage: cmap.readUInt32BE(p + 4) });
  }
  const out = new Set<number>();
  // Format 12 (Unicode complet) s'il existe, sinon format 4 (plan de base).
  const t12 = sousTables.find((t) => cmap.readUInt16BE(t.decalage) === 12);
  if (t12) {
    const o = t12.decalage;
    const groupes = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groupes; g++) {
      const q = o + 16 + g * 12;
      const debut = cmap.readUInt32BE(q), fin = cmap.readUInt32BE(q + 4), glyphe = cmap.readUInt32BE(q + 8);
      for (let c = debut; c <= fin; c++) if (glyphe + (c - debut) !== 0) out.add(c);
    }
    return out;
  }
  const t4 = sousTables.find((t) => cmap.readUInt16BE(t.decalage) === 4);
  if (!t4) throw new Error("cmap : ni format 12 ni format 4");
  const o = t4.decalage;
  const segments = cmap.readUInt16BE(o + 6) / 2;
  const fins = o + 14, debuts = fins + segments * 2 + 2, deltas = debuts + segments * 2, plages = deltas + segments * 2;
  for (let s = 0; s < segments; s++) {
    const fin = cmap.readUInt16BE(fins + s * 2), debut = cmap.readUInt16BE(debuts + s * 2);
    const delta = cmap.readInt16BE(deltas + s * 2), plage = cmap.readUInt16BE(plages + s * 2);
    for (let c = debut; c <= fin && c !== 0xffff; c++) {
      let glyphe: number;
      if (plage === 0) glyphe = (c + delta) & 0xffff;
      else {
        const brut = cmap.readUInt16BE(plages + s * 2 + plage + (c - debut) * 2);
        glyphe = brut === 0 ? 0 : (brut + delta) & 0xffff;
      }
      if (glyphe !== 0) out.add(c);
    }
  }
  return out;
}

function fonctionnalites(table: Buffer | undefined): Set<string> {
  const out = new Set<string>();
  if (!table) return out;
  const liste = table.readUInt16BE(6); // en-tête GSUB/GPOS : FeatureList en +6
  const nb = table.readUInt16BE(liste);
  for (let i = 0; i < nb; i++) out.add(table.toString("latin1", liste + 2 + i * 6, liste + 6 + i * 6));
  return out;
}

function axes(fvar: Buffer | undefined): Map<string, [number, number]> {
  const out = new Map<string, [number, number]>();
  if (!fvar) return out;
  const debut = fvar.readUInt16BE(4), nb = fvar.readUInt16BE(8), taille = fvar.readUInt16BE(10);
  for (let i = 0; i < nb; i++) {
    const p = debut + i * taille;
    out.set(fvar.toString("latin1", p, p + 4), [fvar.readInt32BE(p + 4) / 65536, fvar.readInt32BE(p + 12) / 65536]);
  }
  return out;
}

export function lirePolice(woff2: Buffer): PoliceLue {
  const t = tables(woff2);
  const cmap = t.get("cmap");
  if (!cmap) throw new Error("police sans table cmap");
  return {
    caracteres: caracteres(cmap),
    fonctionnalitesGsub: fonctionnalites(t.get("GSUB")),
    fonctionnalitesGpos: fonctionnalites(t.get("GPOS")),
    axes: axes(t.get("fvar")),
  };
}
