/**
 * Lecture des variables Supabase — le seul endroit qui les lit.
 *
 * POURQUOI CE FICHIER EXISTE
 * ---------------------------
 * Le 2026-08-04, la production est tombée avec deux symptômes distincts :
 * `Failed to fetch` côté navigateur, et une exception serveur (digest
 * 190275154). L'application affichait « La connexion a été perdue » — un
 * message vrai et inutile.
 *
 * Le défaut n'était PAS l'absence de variable : `estModeDemo`
 * (`lib/auth-erreurs.ts:101`) teste la PRÉSENCE, jamais la VALIDITÉ. Deux
 * causes traversent donc cet interstice sans être vues :
 *
 *   1. un `\n` ou une espace collée en fin de valeur — le collage depuis un
 *      tableau de bord en embarque un très souvent, et rien ne l'affiche ;
 *   2. l'URL du TABLEAU DE BORD (`https://supabase.com/dashboard/project/…`)
 *      copiée depuis la barre d'adresse au lieu de l'URL d'API.
 *
 * Les deux donnent la même signature : variable présente, donc pas de « mode
 * démo » ; URL invalide, donc `Failed to fetch` ; et zéro trace côté Supabase,
 * donc rien à lire dans les journaux. Trois heures de diagnostic.
 *
 * CE QUI EST FAIT ICI, ET CE QUI NE L'EST PAS
 * --------------------------------------------
 * `.trim()` **élimine** la cause 1 au lieu de la diagnostiquer. C'est plus sûr
 * que n'importe quel contrôle : il n'y a plus rien à détecter.
 *
 * Le contrôle de forme ne rejette QUE LE CONNU-MAUVAIS — l'hôte
 * `supabase.com`. Une première version exigeait `^https://[a-z0-9]{20}\.
 * supabase\.co$`, et la mesure a montré qu'elle rejetait trois valeurs
 * parfaitement légitimes : la barre oblique finale (le collage le plus banal
 * qui soit), un domaine personnalisé, et `http://localhost:54321` du CLI
 * Supabase. Une garde qui casse la production pour un non-problème est
 * l'échec INVERSE de celui qu'on corrige — et le pire des deux, parce qu'elle
 * tombe du côté alarmant : elle sera désarmée à la première fausse alerte.
 *
 * ⚠️ `new URL()` ne peut pas servir ici : il NORMALISE le `\n` final
 * (`"https://x.supabase.co\n"` → `"https://x.supabase.co/"`). Mesuré, pas
 * supposé. Seul `.trim()` règle ce cas.
 */

/**
 * Message EXACT attendu par `estModeDemo` (`lib/auth-erreurs.ts:101`, qui teste
 * `includes("URL and API key")`). Ne pas le reformuler sans changer le
 * détecteur : c'est ce qui déclenche l'écran « mode démo ».
 */
const MSG_ABSENT = "Your project's URL and API key are required";

/**
 * Erreur DISTINCTE du mode démo. Une configuration présente mais fausse n'est
 * pas une absence de configuration : les confondre produirait un troisième
 * instrument menteur, qui dirait « mode démo » à quelqu'un dont les variables
 * sont posées.
 */
export class ConfigSupabaseInvalide extends Error {
  constructor(public readonly valeur: string, raison: string) {
    super(`Configuration Supabase invalide (${raison}) : ${valeur}`);
    this.name = "ConfigSupabaseInvalide";
  }
}

/** Rejette ce qu'on sait faux. Tolère tout le reste — voir l'en-tête. */
export function verifierUrlSupabase(url: string): void {
  let hote: string;
  try {
    hote = new URL(url).hostname.toLowerCase();
  } catch {
    throw new ConfigSupabaseInvalide(url, "ce n'est pas une URL");
  }
  // Le piège nommé : l'adresse du TABLEAU DE BORD, pas celle de l'API.
  if (hote === "supabase.com" || hote === "www.supabase.com") {
    throw new ConfigSupabaseInvalide(
      url,
      "c'est l'URL du tableau de bord, pas celle de l'API — attendu " +
        "https://<ref>.supabase.co"
    );
  }
}

/** Configuration NAVIGATEUR (clé publiable / anon). */
export function configPublique(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error(MSG_ABSENT);
  verifierUrlSupabase(url);
  return { url, key };
}

/**
 * Configuration SERVEUR (clé de service). Le `.trim()` compte autant ici : la
 * clé de service est recollée à chaque rotation, donc elle court exactement le
 * même risque de `\n` — et son échec est plus silencieux, puisqu'il ne produit
 * qu'une page d'erreur sans message.
 */
export function configService(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error(
      "Supabase admin : NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant."
    );
  }
  verifierUrlSupabase(url);
  return { url, key };
}
