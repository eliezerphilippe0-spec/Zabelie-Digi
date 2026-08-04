import { createClient } from "@supabase/supabase-js";
import { configService } from "@/lib/supabase/config";

/**
 * Client Supabase "service role" — réservé au CÔTÉ SERVEUR (route handlers,
 * webhook, réconciliateur). Contourne la RLS : ne JAMAIS l'exposer au navigateur.
 *
 * Instancié par appel (et non au chargement du module) pour ne pas exiger les
 * variables d'env au build.
 */
export function createAdminClient() {
  // Même lecture centralisée que le client navigateur. Le `.trim()` compte
  // autant ici : la clé de service est recollée à chaque rotation.
  const { url, key: serviceKey } = configService();

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
