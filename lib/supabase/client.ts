import { createBrowserClient } from "@supabase/ssr";
import { configPublique } from "@/lib/supabase/config";

// Client Supabase côté navigateur (composants client).
export function createClient() {
  // Lecture centralisée : `.trim()` + rejet du connu-mauvais.
  // Voir `lib/supabase/config.ts` — l'absence de validation ici a coûté trois
  // heures de diagnostic le 2026-08-04.
  const { url, key } = configPublique();
  return createBrowserClient(url, key);
}
