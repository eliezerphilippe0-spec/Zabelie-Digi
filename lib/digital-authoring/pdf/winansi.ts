/**
 * Texte → encodage WinAnsi des polices standard PDF (Studio de création,
 * tâche 4.1 ; décision D1-A).
 *
 * Les polices standard ne s'embarquent pas : elles ne savent dessiner que les
 * 218 caractères de WinAnsi. Tout le kreyòl (è, ò, à) et le français courant
 * (é, ç, œ, « », ’, —, …) y tiennent. Le reste n'est JAMAIS remplacé en
 * silence : `caracteresNonPrisEnCharge` le liste, et l'export le refuse avec
 * un message qui nomme chaque caractère.
 *
 * Seuls quelques équivalents EXPLICITES, sans perte de sens, sont appliqués :
 * espaces typographiques, traits d'union insécables, signe moins, tabulation.
 * Les caractères invisibles (trait d'union conditionnel, espaces de largeur
 * nulle) sont retirés : ils n'ont pas de dessin.
 *
 * Tout est écrit en points de code : aucune séquence d'échappement dans la
 * source (voir la mémoire « échappements » du chantier).
 */

/** Unicode → octet WinAnsi pour la plage 0x80–0x9F, la seule qui diffère de Latin-1. */
const SPECIAUX: ReadonlyMap<number, number> = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86],
  [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95],
  [0x2013, 0x96], [0x2014, 0x97], [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f],
]);

/** Équivalents explicites : point de code d'origine → point de code dessinable. */
const EQUIVALENTS: ReadonlyMap<number, number> = new Map([
  [0x0009, 0x0020], // tabulation → espace
  [0x2002, 0x0020], [0x2003, 0x0020], [0x2009, 0x0020], [0x200a, 0x0020], // espaces typographiques
  [0x2007, 0x00a0], [0x202f, 0x00a0], // espaces insécables étroites → insécable
  [0x2010, 0x002d], [0x2011, 0x002d], [0x2212, 0x002d], // traits d'union, signe moins
]);

/** Sans dessin : retirés du texte. */
const INVISIBLES: ReadonlySet<number> = new Set([0x00ad, 0x200b, 0x200c, 0x200d, 0x2060, 0xfeff]);

export const NL = String.fromCharCode(10);
export const ESPACE_INSECABLE = String.fromCharCode(0xa0);

/** Octet WinAnsi d'un point de code déjà normalisé, ou `null` s'il n'a pas de dessin. */
export function octetWinAnsi(point: number): number | null {
  if (point >= 0x20 && point <= 0x7e) return point;
  if (point >= 0xa0 && point <= 0xff) return point;
  return SPECIAUX.get(point) ?? null;
}

/**
 * Forme canonique d'un texte pour le PDF : NFC, fins de ligne unifiées,
 * équivalents explicites appliqués, invisibles retirés. Les sauts de ligne
 * sont conservés ; tout autre caractère de contrôle devient une espace.
 */
export function normaliserPourPdf(texte: string): string {
  let sortie = "";
  for (const ch of texte.normalize("NFC")) {
    const p = ch.codePointAt(0) ?? 0;
    if (p === 13) continue;
    if (p === 10) {
      sortie += NL;
      continue;
    }
    if (INVISIBLES.has(p)) continue;
    const e = EQUIVALENTS.get(p);
    if (e !== undefined) {
      sortie += String.fromCodePoint(e);
      continue;
    }
    sortie += p < 32 || p === 127 ? " " : ch;
  }
  return sortie;
}

/** Les caractères (distincts, dans l'ordre d'apparition) qu'aucune police standard ne sait dessiner. */
export function caracteresNonPrisEnCharge(texteNormalise: string): string[] {
  const vus: string[] = [];
  for (const ch of texteNormalise) {
    const p = ch.codePointAt(0) ?? 0;
    if (p === 10) continue;
    if (octetWinAnsi(p) === null && !vus.includes(ch)) vus.push(ch);
  }
  return vus;
}

/** Octets WinAnsi d'un texte normalisé et vérifié (lève si un caractère n'a pas de dessin : erreur de programmation). */
export function versOctets(texteNormalise: string): number[] {
  const octets: number[] = [];
  for (const ch of texteNormalise) {
    const o = octetWinAnsi(ch.codePointAt(0) ?? 0);
    if (o === null) throw new Error("pdf: caractere non verifie avant rendu");
    octets.push(o);
  }
  return octets;
}

/** Inverse de `octetWinAnsi` : sert aux tests qui relisent le PDF produit. */
export function pointDepuisOctet(octet: number): number {
  if (octet >= 0x80 && octet <= 0x9f) {
    for (const [point, o] of SPECIAUX) if (o === octet) return point;
    return 0xfffd;
  }
  return octet;
}
