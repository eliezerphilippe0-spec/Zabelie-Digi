/**
 * Traduction des échecs d'authentification Supabase en causes NOMMÉES.
 *
 * POURQUOI
 * --------
 * `components/connexion-form.tsx` affichait le message brut du serveur :
 * « User already registered », « Invalid login credentials ». En anglais,
 * sans explication, sans geste à faire — devant un acheteur haïtien à qui
 * l'interface parle kreyòl partout ailleurs.
 *
 * Le coût n'est pas seulement l'inconfort. Un échec d'inscription signalé
 * cette nuit n'a pas pu être diagnostiqué : l'utilisateur avait vu « quelque
 * chose », personne ne savait quoi, et il a fallu interroger la base pour
 * découvrir qu'aucun compte n'avait été créé. Une interface qui nomme la
 * cause aurait donné la réponse en une seconde. **Un message d'erreur est un
 * instrument de mesure**, pas seulement une politesse.
 *
 * PAR CODE D'ABORD, PAR TEXTE ENSUITE
 * ------------------------------------
 * Même raison qu'en `lib/pg-errors.ts` : un test sur le message casse au
 * changement de version ou de locale du serveur, et il casse en SILENCE.
 * Supabase expose un `code` stable depuis GoTrue v2.
 *
 * Le repli textuel existe quand même, parce que les déploiements plus anciens
 * ne renvoient pas de `code` — mais il est SECOND, jamais premier.
 *
 * ⚠️ RÈGLE : hors des cas connus, cette fonction rend `null` et l'appelant
 * affiche le message BRUT. Ne jamais remplacer un échec non reconnu par un
 * message générique rassurant — ce serait masquer la seule information
 * disponible le jour où une cause nouvelle apparaît. L'absence de
 * reconnaissance doit rester visible.
 */

export type CauseAuth =
  | "exists" // l'adresse a déjà un compte
  | "credentials" // e-mail ou mot de passe faux
  | "password" // mot de passe trop court / trop faible
  | "notConfirmed" // compte créé, lien de confirmation jamais ouvert
  | "rate" // trop de tentatives, ou plafond d'envoi d'e-mails
  | "disabled" // inscriptions fermées côté projet
  | "email" // adresse rejetée par le serveur
  | "network"; // la requête n'a jamais abouti

/** Codes GoTrue → cause. Source de vérité quand le serveur en renvoie un. */
const PAR_CODE: Record<string, CauseAuth> = {
  user_already_exists: "exists",
  email_exists: "exists",
  invalid_credentials: "credentials",
  weak_password: "password",
  email_not_confirmed: "notConfirmed",
  over_request_rate_limit: "rate",
  over_email_send_rate_limit: "rate",
  signup_disabled: "disabled",
  email_address_invalid: "email",
  validation_failed: "email",
};

/**
 * Repli textuel pour les serveurs qui ne renvoient pas de `code`.
 * Comparé en minuscules, sur des fragments STABLES du message anglais.
 */
const PAR_TEXTE: [string, CauseAuth][] = [
  ["already registered", "exists"],
  ["already been registered", "exists"],
  ["invalid login credentials", "credentials"],
  ["password should be at least", "password"],
  ["email not confirmed", "notConfirmed"],
  ["rate limit", "rate"],
  ["signups not allowed", "disabled"],
  ["unable to validate email", "email"],
  ["invalid format", "email"],
  ["failed to fetch", "network"],
  ["networkerror", "network"],
];

/**
 * Rend la cause reconnue, ou `null` si aucune ne correspond — auquel cas
 * l'appelant DOIT montrer le message brut.
 */
export function causeAuth(
  erreur: { code?: string | null; message?: string | null } | null | undefined
): CauseAuth | null {
  if (!erreur) return null;

  const code = (erreur.code ?? "").trim();
  if (code && code in PAR_CODE) return PAR_CODE[code];

  const texte = (erreur.message ?? "").toLowerCase();
  if (!texte) return null;
  for (const [fragment, cause] of PAR_TEXTE) {
    if (texte.includes(fragment)) return cause;
  }
  return null;
}

/**
 * Le mode démo n'est pas une erreur d'authentification : `createClient()`
 * lève avant tout appel réseau quand les variables Supabase manquent. Gardé à
 * part pour que `causeAuth` ne traite que ce qui vient du serveur.
 */
export function estModeDemo(message: string | null | undefined): boolean {
  return (message ?? "").includes("URL and API key");
}
