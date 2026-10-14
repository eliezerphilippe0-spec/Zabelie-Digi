/**
 * Échappe un texte avant de l'insérer dans du HTML, en corps comme dans un
 * attribut entre guillemets. Sert aux e-mails : tout texte qui ne vient pas du
 * gabarit lui-même (titre de fiche, numéro, date, lien) passe par ici avant
 * d'entrer dans un message signé Zabelie.
 *
 * `&` d'abord : sinon les entités produites ensuite seraient échappées deux fois.
 */
export function echapperHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
