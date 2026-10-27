/**
 * Lecteur de déclarations CSS minimal, partagé par les gardes du système de
 * design (`mouvement-jetons`, `valeurs-en-dur`). Chaque déclaration sort avec
 * la PILE des préludes qui l'enveloppent (sélecteur, `@media`, `@supports`,
 * `@keyframes`…) : c'est la place d'une déclaration qui dit si elle est sous
 * `prefers-reduced-motion: no-preference`, ou dans une image clé.
 *
 * Commentaires retirés ; chaînes entre guillemets traversées sans interpréter
 * `{`, `}` ni `;` (les `url("data:…")` du dépôt en portent).
 */
export type Decl = { prop: string; valeur: string; contextes: string[] };

/** Les déclarations d'une feuille, chacune avec la pile des préludes qui l'enveloppent. */
export function declarations(css: string): Decl[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const pile: string[] = [];
  const out: Decl[] = [];
  let tampon = "";
  let guillemet: string | null = null;
  const vider = () => {
    const d = tampon.trim();
    tampon = "";
    const i = d.indexOf(":");
    if (i > 0 && pile.length > 0 && !d.startsWith("@")) {
      out.push({ prop: d.slice(0, i).trim().toLowerCase(), valeur: d.slice(i + 1).trim(), contextes: [...pile] });
    }
  };
  for (const c of src) {
    if (guillemet) {
      tampon += c;
      if (c === guillemet) guillemet = null;
    } else if (c === '"' || c === "'") {
      guillemet = c;
      tampon += c;
    } else if (c === "{") {
      pile.push(tampon.trim().replace(/\s+/g, " "));
      tampon = "";
    } else if (c === "}") {
      vider();
      pile.pop();
    } else if (c === ";") {
      vider();
    } else tampon += c;
  }
  return out;
}
