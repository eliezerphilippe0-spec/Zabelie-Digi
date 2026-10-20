/**
 * Purge des brouillons locaux du Studio de création (décision D6, docs/70).
 *
 * Module MINUSCULE et sans dépendance : il est chargé par l'en-tête du site,
 * donc sur toutes les pages, y compris pour un visiteur sur un téléphone
 * d'entrée de gamme. Il ne doit rien tirer d'autre (ni zod, ni schéma).
 *
 * Pourquoi ici : la déconnexion est un formulaire POST sans JavaScript
 * (`components/sign-out-button.tsx`), elle ne peut pas vider le stockage du
 * navigateur. L'en-tête le fait au premier affichage qui suit — sur un Android
 * partagé ou au cybercafé, le texte d'un guide ne survit pas à la session.
 */
export const PREFIXE_BROUILLON = "zabelie:creation:v1:";

export type StockageMinimal = Pick<Storage, "key" | "length" | "removeItem">;

/**
 * Retire les brouillons qui n'appartiennent pas à `garder` (un identifiant de
 * compte), ou TOUS les brouillons si personne n'est connecté. Ne touche à
 * aucune autre clé du site. Rend le nombre de brouillons retirés.
 */
export function purgerBrouillons(stockage: StockageMinimal, garder: string | null, prefixe = PREFIXE_BROUILLON): number {
  const aRetirer: string[] = [];
  for (let i = 0; i < stockage.length; i++) {
    const cle = stockage.key(i);
    if (!cle || !cle.startsWith(prefixe)) continue;
    if (garder && cle.startsWith(`${prefixe}${garder}:`)) continue;
    aRetirer.push(cle);
  }
  for (const cle of aRetirer) stockage.removeItem(cle);
  return aRetirer.length;
}
