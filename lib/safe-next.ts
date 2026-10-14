/**
 * Validation de la destination post-connexion (?next=…) — anti open redirect.
 * N'accepte QUE des chemins internes relatifs. Rejette :
 *   - les URL absolues (https://…, moitié du phishing post-login) ;
 *   - les protocol-relative (//evil.com) ;
 *   - les backslashes ("/\\evil.com" : certains navigateurs les traitent
 *     comme des slashes) ;
 *   - les caractères de contrôle ("/<TAB>/evil.com" : le parseur d'URL des
 *     navigateurs les EFFACE, et l'adresse devient "//evil.com") ;
 *   - tout ce qui ne commence pas par "/".
 * Puis, défense en profondeur : `resteSurLeSite`. Les gardes textuels
 * énumèrent les pièges CONNUS ; celui-là pose la question qui compte, avec le
 * parseur que le navigateur utilisera. Aucune entrée connue ne passe les gardes
 * textuels et sort du site — c'est pourquoi il est exporté et éprouvé SEUL :
 * dans `safeNext`, aucun test ne pourrait le voir travailler.
 * Testée dans tests/safe-next.test.ts — c'est une fonction de sécurité.
 */
const ORIGINE_TEMOIN = "https://zabelie.invalid";

/** Vrai si `chemin`, résolu comme le ferait un navigateur, reste sur le site. */
export function resteSurLeSite(chemin: string): boolean {
  return new URL(chemin, ORIGINE_TEMOIN).origin === ORIGINE_TEMOIN;
}

export function safeNext(raw: string | null | undefined): string {
  if (
    typeof raw === "string" &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(raw) &&
    resteSurLeSite(raw)
  ) {
    return raw;
  }
  return "/";
}
