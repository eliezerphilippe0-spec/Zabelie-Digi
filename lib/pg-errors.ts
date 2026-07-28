/**
 * Reconnaissance d'erreurs PostgreSQL / PostgREST par CODE, jamais par texte.
 *
 * Un test sur le message casse au changement de version du serveur ou de sa
 * locale — et il casse en SILENCE, en laissant croire que la garde est en
 * place. C'est la même raison qui fait lire `42703` et non « column … does
 * not exist » dans `lib/products.ts` (`isMissingColumn`).
 */

/**
 * La fonction appelée n'existe pas.
 *
 * Deux codes, et aucun n'est de trop :
 *   - `42883` — `undefined_function`, rendu par PostgreSQL lui-même ;
 *   - `PGRST202` — rendu par PostgREST quand la fonction est absente de son
 *     cache de schéma, ce qui est le cas courant sur Supabase : la requête
 *     n'atteint alors jamais PostgreSQL et `42883` n'apparaît pas.
 *
 * N'en garder qu'un revient à ne pas détecter le cas dans la moitié des
 * déploiements.
 */
export function isMissingFunction(
  error: { code?: string | null } | null | undefined
): boolean {
  const code = error?.code ?? "";
  return code === "42883" || code === "PGRST202";
}
