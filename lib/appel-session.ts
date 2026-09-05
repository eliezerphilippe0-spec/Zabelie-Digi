/**
 * APPELER UNE API QUI EXIGE UNE SESSION — la porte unique.
 *
 * ─── LE DÉFAUT MESURÉ (parcours acheteur du 2026-09-05) ─────────────────────
 * `components/buy-button.tsx` faisait, sur le chemin de l'argent :
 *
 *   const res  = await fetch("/api/checkout", …);
 *   if (res.status === 401) { … }
 *   const data = await res.json();      // ← nu
 *   …
 *   } catch { setError("Connexion impossible. Réessayez."); }
 *
 * Une réponse 500 dont le corps n'est PAS du JSON — la page d'erreur de
 * Next, un 502 de la plateforme, une passerelle qui rend du HTML — fait lever
 * `res.json()`. La levée tombe dans le `catch` prévu pour le réseau, et
 * l'acheteur lit « Connexion impossible. Réessayez. » alors que sa connexion
 * est parfaite : c'est le SERVEUR qui a échoué.
 *
 * Mesuré, pas déduit : au clic « Payer avec MonCash », `HTTP 500 →
 * « Connexion impossible »` (`docs/parcours-acheteur-2026-09-05/journal.json`).
 * Le coût n'est pas le mot : c'est que l'acheteur change de réseau, réessaie,
 * échoue encore, et que personne n'apprend jamais que le serveur est tombé.
 * C'est la classe de défaut que `CLAUDE.md` nomme « l'échec se présente comme
 * autre chose » — ici une panne serveur déguisée en panne de l'utilisateur.
 *
 * ─── LA RÈGLE ───────────────────────────────────────────────────────────────
 * **SEUL un `fetch` qui LÈVE est une panne réseau.** Tout ce qui revient avec
 * un code HTTP est une réponse : le serveur a été joint, il a répondu, et sa
 * réponse se lit — même quand elle est illisible. Un corps non-JSON n'annule
 * pas le fait qu'on a reçu un 500.
 *
 * D'où quatre issues, et pas trois :
 *   `ok`         — le serveur a dit oui, `data` porte sa réponse ;
 *   `connexion`  — 401 : il faut une session ; `vers` est l'URL de connexion
 *                  qui ramène ICI (jamais une impasse, jamais un message) ;
 *   `refus`      — le serveur a répondu non, avec ou sans corps lisible ;
 *   `reseau`     — la requête n'est JAMAIS PARTIE. Le seul cas où « vérifiez
 *                  votre réseau » est une phrase vraie.
 *
 * Deux composants du panier faisaient déjà la moitié du travail
 * (`res.json().catch(() => ({}))`) ; le bouton d'achat, le plus emprunté et le
 * seul sur le money-path, ne la faisait pas. Cette porte met les trois sur le
 * même chemin, et `tests/appel-session.test.ts` refuse qu'un quatrième
 * réinvente le sien.
 */

/** Ce qu'un appel authentifié peut rendre. Union discriminante : le compilateur
 *  force l'appelant à traiter les quatre cas, y compris `reseau`. */
export type IssueAppel<T> =
  | { etat: "ok"; data: T }
  | { etat: "connexion"; vers: string }
  | { etat: "refus"; statut: number; code?: string; error?: string }
  | { etat: "reseau" };

/**
 * L'URL de la page de connexion qui ramène à `ici` une fois connecté.
 *
 * Écrite ICI et pas dans chaque composant, parce que les trois appelants en
 * avaient trois versions : `window.location.pathname` (qui PERD la
 * query — `/catalogue?cat=Beauté` ramenait sur `/catalogue` nu),
 * `"/panier"` en dur, et une troisième identique à la première. La lecture,
 * elle, a toujours été centralisée (`lib/safe-next.ts`, qui refuse une
 * destination externe) : l'écriture le devient.
 */
export function cheminConnexion(ici: string): string {
  return `/connexion?next=${encodeURIComponent(ici || "/")}`;
}

/** Le chemin courant du navigateur, query comprise. Rend `/` hors navigateur. */
export function iciMeme(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * POST JSON vers une API qui exige une session.
 *
 * `ici` est la page où l'on est, pour y revenir après connexion ; par défaut
 * la page courante. Ne redirige PAS elle-même : le composant sait s'il doit
 * employer `router.push` (navigation douce) ou `window.location` (sortie de
 * page), et cette porte n'a pas à trancher pour lui.
 */
export async function appelSession<T = Record<string, unknown>>(
  url: string,
  corps: unknown,
  ici: string = iciMeme(),
): Promise<IssueAppel<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
  } catch {
    // LE SEUL `reseau` du fichier. Si cette ligne se met à couvrir autre
    // chose, le mensonge de 2026-09-05 revient par la fenêtre.
    return { etat: "reseau" };
  }

  if (res.status === 401) return { etat: "connexion", vers: cheminConnexion(ici) };

  // Un corps illisible n'est pas une panne : c'est une réponse sans détail.
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

  if (!res.ok) {
    return {
      etat: "refus",
      statut: res.status,
      code: typeof data.code === "string" ? data.code : undefined,
      error: typeof data.error === "string" ? data.error : undefined,
    };
  }
  return { etat: "ok", data: data as T };
}
