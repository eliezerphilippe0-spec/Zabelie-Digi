/**
 * DÉCOUPER UNE BALISE JSX OUVRANTE, accolades et guillemets équilibrés.
 *
 * Né d'un instrument qui a menti, le 2026-11-07 (chantier design, Phase 2) :
 * le motif `<button((?:[^>]|=>)*?)>` coupait la balise au `>` de la flèche d'un
 * `onClick={() => …}` posé avant `className`. Quarante boutons ont ainsi
 * échappé à une passe, et le contrôle n'aurait rien dit. Ici, un `>` ne ferme
 * la balise que hors de toute accolade et de toute chaîne.
 *
 * Ce n'est pas un analyseur JSX : il lit ce que ce dépôt écrit (attributs en
 * `"…"` ou `{…}`, chaînes `'…'`, `"…"`, `` `…` `` dans les expressions).
 */
export type Balise = { nom: string; attrs: string; index: number; ligne: number };

export function balises(src: string, noms: readonly string[]): Balise[] {
  const out: Balise[] = [];
  const re = new RegExp(`<(${noms.join("|")})(?![\\w-])`, "g");
  for (const m of src.matchAll(re)) {
    const debut = (m.index ?? 0) + m[0].length;
    let j = debut, prof = 0, guillemet: string | null = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (guillemet) {
        if (c === "\\") { j++; continue; }
        if (c === guillemet) guillemet = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { if (prof > 0 || c === '"') guillemet = c; continue; }
      if (c === "{") prof++;
      else if (c === "}") prof--;
      else if (c === ">" && prof === 0) break;
    }
    out.push({ nom: m[1], attrs: src.slice(debut, j), index: m.index ?? 0, ligne: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

/** L'expression d'un attribut : `"…"` littéral, ou le contenu équilibré de `{…}`. */
export function attribut(attrs: string, nom: string): { litteral: string } | { expr: string } | null {
  const m = new RegExp(`(?:^|\\s)${nom}=("|\\{)`).exec(attrs);
  if (!m) return null;
  const i = (m.index ?? 0) + m[0].length;
  if (m[1] === '"') return { litteral: attrs.slice(i, attrs.indexOf('"', i)) };
  let prof = 1, j = i;
  for (; j < attrs.length && prof > 0; j++) {
    if (attrs[j] === "{") prof++;
    else if (attrs[j] === "}") prof--;
  }
  return { expr: attrs.slice(i, j - 1).trim() };
}

/**
 * Les classes qu'une valeur de `className` peut produire, résolues dans `src` :
 * littéral, constante du fichier (`const champ = "…"`), gabarit (avec ses
 * `${CONSTANTE}`), chaînes d'une condition. `null` si rien n'est lisible.
 */
export function classes(v: ReturnType<typeof attribut>, src: string): string | null {
  if (!v) return null;
  if ("litteral" in v) return v.litteral;
  const constante = (nom: string) => {
    const defs = [...src.matchAll(new RegExp(`const\\s+${nom}\\s*=\\s*(?:"([^"]*)"|\`([^\`]*)\`)`, "g"))];
    return defs.length === 1 ? (defs[0][1] ?? defs[0][2]) : null;
  };
  const e = v.expr;
  if (/^[A-Za-z_]\w*$/.test(e)) return constante(e);
  const morceaux: string[] = [];
  for (const m of e.matchAll(/"([^"]*)"|`([^`]*)`|'([^']*)'/g)) morceaux.push(m[1] ?? m[2] ?? m[3]);
  for (const m of e.matchAll(/\$\{([A-Za-z_]\w*)\}/g)) morceaux.push(constante(m[1]) ?? "");
  return morceaux.length ? morceaux.join(" ") : null;
}
