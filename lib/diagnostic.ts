/**
 * LA FRONTIÈRE ENTRE CE QU'UN UTILISATEUR LIT ET CE QU'UN DÉVELOPPEUR DOIT
 * SAVOIR.
 *
 * Pourquoi ce module existe. Trois écrans publics disaient à l'utilisateur des
 * choses qui ne le concernent pas et qu'il ne peut pas corriger :
 *
 *   • `/vendre`  : « La publication nécessite une base Supabase configurée
 *                   (voir `supabase/README.md`) » ;
 *   • `/connexion` : « Mode démo : connectez le projet Supabase » ;
 *   • `POST /api/checkout` : « migration 0087 non appliquée » — renvoyé à un
 *     ACHETEUR, sur le chemin de l'argent, **traduit en kreyòl**. Quelqu'un a
 *     donc pris la peine de traduire un numéro de migration pour un acheteur
 *     haïtien qui voulait payer.
 *
 * Deux défauts distincts, et le second est le plus grave :
 *
 *   1. Le vocabulaire. Nommer un artefact interne à quelqu'un qui n'y a pas
 *      accès ne l'aide pas — ça lui apprend seulement que le site est cassé
 *      d'une manière qu'il ne comprend pas.
 *   2. **Une panne de configuration se présentait comme un MODE.** « Mode
 *      démo » est le vocabulaire d'un état voulu. En production, une variable
 *      d'environnement absente n'est pas un mode : c'est un incident. Et il ne
 *      journalisait RIEN — la page rendait 200, l'écran paraissait normal, et
 *      aucun signal ne partait. C'est exactement le corollaire d'observabilité
 *      de `CLAUDE.md` : « n'a pas tourné » et « a tourné, rien trouvé »
 *      produisaient le même vide.
 *
 * La règle posée ici : **l'utilisateur lit ce que ça veut dire POUR LUI, la
 * cause part au journal serveur, et l'indice technique n'existe qu'en dehors
 * de la production.**
 */

/**
 * Sommes-nous ailleurs qu'en production ?
 *
 * `next dev` rend `development` ; un build servi par `next start` rend
 * `production`, y compris en local — et c'est le bon découpage : dès qu'on
 * sert un build, on sert ce qu'un visiteur verrait.
 */
export function horsProduction(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Journalise une configuration absente, UNE FOIS PAR PROCESSUS.
 *
 * Le compteur n'est pas de l'élégance : sans lui, une page publique visitée en
 * boucle noierait le journal, et un incident bruyant qu'on apprend à ignorer
 * cesse d'être un incident. Une ligne par cause et par démarrage suffit à ce
 * qu'elle soit vue.
 *
 * ⚠️ `console.error` et pas `warn` : en production, c'est une panne. Le
 * `contexte` ne doit contenir AUCUN secret — on nomme la variable, jamais sa
 * valeur.
 */
const dejaSignale = new Set<string>();

export function signalerConfigAbsente(
  quoi: string,
  contexte: Record<string, unknown> = {},
): void {
  if (dejaSignale.has(quoi)) return;
  dejaSignale.add(quoi);
  console.error(
    "[config] " +
      JSON.stringify({
        at: new Date().toISOString(),
        manquant: quoi,
        // Un écran public dégradé en production est un incident ; en
        // développement, c'est l'état normal d'un poste sans `.env.local`.
        gravite: horsProduction() ? "attendu_en_dev" : "incident_production",
        ...contexte,
      }),
  );
}

/** Remise à zéro — réservée aux tests, qui doivent pouvoir rejouer le signal. */
export function reinitialiserSignaux(): void {
  dejaSignale.clear();
}
