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
  //
  // ⚠️ DEUX hôtes, pas un. L'actuel est `supabase.com/dashboard/project/…`,
  // l'ANCIEN est `app.supabase.com/project/…` — encore massivement présent
  // dans les onglets ouverts, les signets et les tutoriels. Une égalité
  // stricte sur `supabase.com` laisserait passer le second.
  //
  // Et un seul caractère sépare `supabase.com` de `supabase.co` : le test de
  // suffixe doit porter sur `.supabase.com` avec son point, sinon il
  // attraperait aussi les URL d'API légitimes.
  if (hote === "supabase.com" || hote.endsWith(".supabase.com")) {
    throw new ConfigSupabaseInvalide(
      url,
      "c'est l'URL du tableau de bord, pas celle de l'API — attendu " +
        "https://<ref>.supabase.co"
    );
  }
}

/**
 * LE CONNU-MAUVAIS LE PLUS DANGEREUX DU LOT — et le plus silencieux.
 *
 * Coller `sb_secret_…` dans `NEXT_PUBLIC_SUPABASE_ANON_KEY` ne casse RIEN. Le
 * site fonctionne parfaitement, aucune erreur, aucune trace, aucun symptôme.
 * Et la clé de service part dans le bundle JavaScript de **chaque visiteur** —
 * donc la RLS devient contournable par quiconque ouvre l'onglet Sources.
 *
 * Le risque est maximal le jour d'une rotation : les deux valeurs passent dans
 * le presse-papier à quelques minutes d'intervalle, et elles se ressemblent.
 *
 * Deux formes à couvrir, parce que Supabase les fait coexister :
 *   • `sb_secret_…` — la forme actuelle, reconnaissable au préfixe ;
 *   • un JWT hérité (`eyJ…`) dont la charge utile porte `"role":"service_role"`.
 *     La charge est du base64url non signé : on la lit sans rien vérifier, ce
 *     qui suffit ici — on ne valide pas un jeton, on refuse un copier-coller.
 *
 * Zéro faux positif possible : aucune clé publiable légitime ne commence par
 * `sb_secret_`, et aucune ne porte le rôle `service_role`.
 */
export function verifierClePublique(key: string): void {
  if (key.startsWith("sb_secret_")) {
    throw new ConfigSupabaseInvalide(
      "sb_secret_…(masquée)",
      "c'est la CLÉ DE SERVICE dans une variable NEXT_PUBLIC_ — elle partirait " +
        "dans le navigateur de chaque visiteur et rendrait la RLS contournable"
    );
  }
  const parties = key.split(".");
  if (parties.length === 3 && key.startsWith("eyJ")) {
    try {
      // `atob`, pas `Buffer` : ce fichier part dans le BUNDLE NAVIGATEUR via
      // `lib/supabase/client.ts`, et `Buffer` n'y existe pas — la garde aurait
      // planté chez l'utilisateur au lieu de le protéger.
      const b64 = parties[1].replace(/-/g, "+").replace(/_/g, "/");
      const charge = JSON.parse(
        atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4))
      ) as { role?: string };
      if (charge.role === "service_role") {
        throw new ConfigSupabaseInvalide(
          "eyJ…(masquée)",
          "ce JWT porte le rôle `service_role` — c'est la clé de service, " +
            "elle ne doit jamais être exposée au navigateur"
        );
      }
    } catch (e) {
      // Une charge illisible n'est pas une preuve de faute : on ne juge que ce
      // qu'on a pu lire. Seule notre propre erreur remonte.
      if (e instanceof ConfigSupabaseInvalide) throw e;
    }
  }
}

/** Configuration NAVIGATEUR (clé publiable / anon). */
export function configPublique(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) throw new Error(MSG_ABSENT);
  verifierUrlSupabase(url);
  verifierClePublique(key);
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
