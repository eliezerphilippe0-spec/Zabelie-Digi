import { isBinary, isIntent, type Binary, type Intent } from "./taxonomy";

/**
 * Lecteur du jeu étiqueté par le porteur : `message,entansyon,eskalade,ijans`.
 *
 * RFC 4180 à la main (guillemets, virgules et retours à la ligne dans un
 * champ, `""` échappé) : aucune dépendance nouvelle. Fail-closed sur tout ce
 * qui n'est pas attendu — en-tête différent, étiquette hors taxonomie, champ
 * manquant. Une ligne mal étiquetée ne doit jamais devenir une « erreur de
 * Jev » dans le rapport ; elle arrête la lecture, avec son numéro de ligne.
 */
export type LabeledMessage = {
  line: number;
  message: string;
  entansyon: Intent;
  eskalade: Binary;
  ijans: Binary;
};

export const HEADER = ["message", "entansyon", "eskalade", "ijans"] as const;

export function parseCsvRows(text: string): { line: number; cells: string[] }[] {
  const src = text.replace(/^﻿/, "");
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else {
        if (ch === "\n") line++;
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") quoted = true;
    else if (ch === '"') throw new Error(`csv_guillemet_inattendu ligne ${line}`);
    else if (ch === ",") { cells.push(cell); cell = ""; }
    else if (ch === "\r" && src[i + 1] === "\n") continue;
    else if (ch === "\n" || ch === "\r") {
      cells.push(cell);
      rows.push({ line: rowLine, cells });
      cells = []; cell = ""; line++; rowLine = line;
    } else cell += ch;
  }
  if (quoted) throw new Error(`csv_guillemet_non_ferme ligne ${rowLine}`);
  if (cell !== "" || cells.length) { cells.push(cell); rows.push({ line: rowLine, cells }); }
  return rows.filter((r) => !(r.cells.length === 1 && r.cells[0].trim() === ""));
}

export function parseLabeledCsv(text: string): LabeledMessage[] {
  const [head, ...body] = parseCsvRows(text);
  const header = head?.cells.map((c) => c.trim().toLowerCase());
  if (!header || header.join(",") !== HEADER.join(",")) {
    throw new Error(`csv_entete_invalide : attendu « ${HEADER.join(",")} »`);
  }
  if (body.length === 0) throw new Error("csv_vide");
  return body.map(({ line, cells }) => {
    if (cells.length !== HEADER.length) throw new Error(`csv_colonnes ligne ${line} : ${cells.length} au lieu de 4`);
    const [message, entansyon, eskalade, ijans] = cells.map((c) => c.trim());
    const e = entansyon.toLowerCase(), k = eskalade.toLowerCase(), j = ijans.toLowerCase();
    if (!message) throw new Error(`csv_message_vide ligne ${line}`);
    if (!isIntent(e)) throw new Error(`csv_entansyon_inconnue ligne ${line} : « ${entansyon} »`);
    if (!isBinary(k)) throw new Error(`csv_eskalade_invalide ligne ${line} : « ${eskalade} » (wi/non)`);
    if (!isBinary(j)) throw new Error(`csv_ijans_invalide ligne ${line} : « ${ijans} » (wi/non)`);
    return { line, message, entansyon: e, eskalade: k, ijans: j };
  });
}
