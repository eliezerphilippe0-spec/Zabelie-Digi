"use client";

import { useEffect } from "react";

/**
 * RATTRAPAGE DU LIEN DE RÉINITIALISATION — retirer la dépendance à la console.
 *
 * ─── LE BLOCAGE, ET POURQUOI IL EST HORS DE PORTÉE DU CODE ─────────────────
 * `resetPasswordForEmail` envoie `redirectTo` = `/reinitialiser-mot-de-passe`.
 * Supabase ne l'honore QUE si l'URL figure dans l'allowlist « Redirect URLs »
 * de la configuration Auth. Sinon il n'échoue pas : il retombe SILENCIEUSEMENT
 * sur le Site URL du projet. L'utilisateur clique son lien, atterrit sur
 * l'accueil, et « rien ne se passe ».
 *
 * Cette allowlist vit dans le plan de contrôle Supabase, pas dans la base :
 * `information_schema` ne connaît aucune table de configuration Auth (mesuré
 * le 2026-08-16 — le schéma `auth` n'expose que des données, jamais de
 * réglage). Aucun outil MCP ne l'atteint. C'est un geste de console, et il le
 * restera.
 *
 * ─── CE QUE CE COMPOSANT FAIT, ET POURQUOI ÇA SUFFIT ───────────────────────
 * Le repli n'efface PAS les jetons : Supabase les accroche à l'URL de repli
 * exactement comme il l'aurait fait sur la bonne page. Le fragment
 * `#access_token=…&type=recovery` est donc bien arrivé — simplement sur une
 * page qui ne le regarde pas. On le regarde ici, et on le porte à destination.
 *
 * Il est correct dans les DEUX états du monde, et c'est le point :
 *   • allowlist réglée → l'utilisateur atterrit directement au bon endroit,
 *     ce composant ne se déclenche jamais ;
 *   • allowlist absente → il atterrit ailleurs, et on le redirige.
 * Le réglage de console reste souhaitable (un aller-retour de moins, et le
 * `?code=` du PKCE est lié à l'origine), mais il cesse d'être BLOQUANT.
 *
 * ─── POURQUOI `type=recovery` ET RIEN D'AUTRE ──────────────────────────────
 * C'est le seul marqueur non ambigu. Un `?code=` nu sur l'accueil peut être un
 * retour OAuth ordinaire : le détourner casserait la connexion. On ne capte
 * que ce qu'on sait nommer.
 *
 * ⚠️ Aucun `g` sur ce motif : un regex `g` porte `lastIndex` et rendrait vrai
 * ou faux selon l'ordre des appels (règle du dépôt, mordue le 2026-08-14).
 */
export const CIBLE_RECOVERY = "/reinitialiser-mot-de-passe";

/** Vrai si la chaîne (fragment OU query) porte le marqueur de récupération. */
export function porteMarqueurRecovery(s: string): boolean {
  return /(?:^|[#&?])type=recovery(?:$|&)/.test(s);
}

export function RecoveryCatcher() {
  useEffect(() => {
    const { pathname, hash, search } = window.location;
    // Déjà à destination : ne rien faire, sous peine de boucle.
    if (pathname === CIBLE_RECOVERY) return;
    if (!porteMarqueurRecovery(hash) && !porteMarqueurRecovery(search)) return;

    /* `replace` et pas `assign` : l'entrée de repli ne doit pas rester dans
     * l'historique, sinon un retour arrière ramène l'utilisateur sur une URL
     * qui porte encore ses jetons. Le fragment est reporté tel quel — la page
     * cible sait consommer les deux formes (fragment et `?code=`). */
    window.location.replace(`${CIBLE_RECOVERY}${search}${hash}`);
  }, []);

  return null;
}
