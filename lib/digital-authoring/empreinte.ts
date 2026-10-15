import { createHash } from "node:crypto";

/**
 * Empreintes du Studio de création éditoriale : entrée d'une opération,
 * contenu d'une révision. SERVEUR uniquement (`node:crypto`).
 *
 * Le JSON est CANONIQUE : clés triées à toute profondeur, tableaux dans leur
 * ordre (l'ordre des sections EST du contenu). Sans tri, deux objets égaux
 * construits dans un ordre différent auraient deux empreintes, et un rejeu
 * légitime passerait pour un conflit.
 *
 * Les textes doivent arriver déjà normalisés (`normaliserTexte`, NFC) : ce
 * module ne les retouche pas, il les mesure.
 */
export function jsonCanonique(valeur: unknown): string {
  if (valeur === null || typeof valeur === "string" || typeof valeur === "boolean") return JSON.stringify(valeur);
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) throw new Error("empreinte : nombre non fini");
    return JSON.stringify(valeur);
  }
  if (Array.isArray(valeur)) return `[${valeur.map(jsonCanonique).join(",")}]`;
  if (typeof valeur === "object") {
    const objet = valeur as Record<string, unknown>;
    const cles = Object.keys(objet).filter((c) => objet[c] !== undefined).sort();
    return `{${cles.map((c) => `${JSON.stringify(c)}:${jsonCanonique(objet[c])}`).join(",")}}`;
  }
  // `undefined` en tête, fonction, symbole, bigint : rien de tout ça n'est du contenu.
  throw new Error(`empreinte : type ${typeof valeur} non admis`);
}

/** SHA-256 hexadécimal (64 caractères) du JSON canonique. */
export function empreinte(valeur: unknown): string {
  return createHash("sha256").update(jsonCanonique(valeur), "utf8").digest("hex");
}
