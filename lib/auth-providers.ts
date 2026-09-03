/**
 * Fournisseurs d'identité tiers (Google, Microsoft, Facebook, Apple) — V-19.
 *
 * ⚠️ RIEN N'EST AFFICHÉ SANS CONFIGURATION, et c'est le point de conception.
 * Un bouton « Continuer avec Google » dont le fournisseur n'est pas activé
 * dans Supabase envoie l'utilisateur sur une page d'erreur brute de
 * `/auth/v1/authorize` — hors de notre interface, intraduisible, sans retour.
 * `signInWithOAuth` ne lève pas : il NAVIGUE. L'erreur n'est donc jamais
 * attrapable côté client. La seule garde possible est en amont : un
 * fournisseur n'apparaît que s'il est nommé dans `NEXT_PUBLIC_AUTH_PROVIDERS`,
 * et cette variable se pose APRÈS l'avoir activé dans le tableau de bord
 * Supabase (`OPS_TODO`, runbook « connexion tierce »).
 *
 * Absente ou vide → aucun bouton, le formulaire e-mail reste seul. C'est
 * l'état de production tant que le porteur n'a pas fait la configuration.
 *
 * Les identifiants sont les NÔTRES (`microsoft`, pas `azure`) : c'est ce que
 * l'acheteur lit sur le bouton. La correspondance vers le nom Supabase vit
 * ici, en un seul endroit, avec les options que chaque fournisseur exige.
 * Une valeur inconnue est journalisée et IGNORÉE — jamais rendue : un bouton
 * vers un fournisseur qui n'existe pas serait le défaut décrit ci-dessus,
 * une couche plus bas.
 */

export type AuthProviderId = "google" | "microsoft" | "facebook" | "apple";

export type AuthProvider = {
  id: AuthProviderId;
  /** Nom du fournisseur tel que Supabase l'attend dans `signInWithOAuth`. */
  supabase: "google" | "azure" | "facebook" | "apple";
  /** Portées à demander — Azure ne renvoie l'e-mail que si on le demande. */
  scopes?: string;
};

const CATALOGUE: Record<AuthProviderId, AuthProvider> = {
  google: { id: "google", supabase: "google" },
  microsoft: { id: "microsoft", supabase: "azure", scopes: "email" },
  facebook: { id: "facebook", supabase: "facebook" },
  apple: { id: "apple", supabase: "apple" },
};

/** Alias tolérés à la saisie de la variable. `azure` reste lisible pour qui
 *  vient du tableau de bord Supabase, où c'est le nom affiché. */
const ALIAS: Record<string, AuthProviderId> = {
  azure: "microsoft",
  "azure-ad": "microsoft",
  entra: "microsoft",
};

export function estFournisseur(v: string): v is AuthProviderId {
  return v in CATALOGUE;
}

/**
 * Lit la liste depuis la valeur brute de `NEXT_PUBLIC_AUTH_PROVIDERS`
 * (`google,microsoft`). Ordre conservé, doublons retirés, inconnus ignorés
 * et journalisés. Ne lève jamais : une variable mal écrite ne doit pas
 * casser la page de connexion, elle doit seulement ne rien ajouter.
 */
export function resolveAuthProviders(
  brut: string | undefined | null,
  journal: (message: string) => void = (m) => console.error(m)
): AuthProvider[] {
  if (!brut) return [];
  const vus = new Set<AuthProviderId>();
  const sortie: AuthProvider[] = [];
  for (const morceau of brut.split(",")) {
    const v = morceau.trim().toLowerCase();
    if (v === "") continue;
    const id = estFournisseur(v) ? v : ALIAS[v];
    if (!id) {
      journal(
        `[auth] NEXT_PUBLIC_AUTH_PROVIDERS porte « ${morceau.trim()} », qui n'est ` +
          `pas un fournisseur connu (google, microsoft, facebook, apple) — ignoré.`
      );
      continue;
    }
    if (vus.has(id)) continue;
    vus.add(id);
    sortie.push(CATALOGUE[id]);
  }
  return sortie;
}

/**
 * URL de retour après le fournisseur : TOUJOURS `/auth/callback`, qui échange
 * le code contre une session, puis `next` passe par `safeNext` côté serveur.
 * L'origine est celle de la page courante (apex ou www), pour la même raison
 * que `lib/site-origin.ts` : le cookie de session doit suivre la redirection.
 */
export function urlDeRetourOAuth(origine: string, next: string): string {
  return `${origine}/auth/callback?next=${encodeURIComponent(next)}`;
}
