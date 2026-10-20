import { createBrowserClient } from "@supabase/ssr";
import { createClient as createIsolatedClient } from "@supabase/supabase-js";
import { configPublique } from "@/lib/supabase/config";

// Client Supabase côté navigateur (composants client).
export function createClient() {
  // Lecture centralisée : `.trim()` + rejet du connu-mauvais.
  // Voir `lib/supabase/config.ts` — l'absence de validation ici a coûté trois
  // heures de diagnostic le 2026-08-04.
  const { url, key } = configPublique();
  return createBrowserClient(url, key);
}

/** La page de récupération consomme le lien une seule fois, explicitement.
 * Le client habituel et son singleton gardent leurs réglages. */
export function createRecoveryClient() {
  const { url, key } = configPublique();
  return createBrowserClient(url, key, {
    isSingleton: false,
    auth: { detectSessionInUrl: false, autoRefreshToken: false },
  });
}

/** Écriture liée aux jetons validés, jamais à une session changée dans un
 * autre onglet entre le contrôle du compte et updateUser. Aucun cookie lu
 * ou écrit par ce client ; sa session reste uniquement en mémoire. */
export function createPasswordWriter() {
  const { url, key } = configPublique();
  return createIsolatedClient(url, key, {
    auth: {
      storageKey: `zabelie-recovery-password-${crypto.randomUUID()}`,
      persistSession: false, detectSessionInUrl: false, autoRefreshToken: false,
    },
  });
}
