import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { configPublique } from "@/lib/supabase/config";

// Client Supabase côté serveur (Server Components, Route Handlers, Server Actions).
export async function createClient() {
  const cookieStore = await cookies();

  // Lecture centralisée (`lib/supabase/config.ts`) : `.trim()` + rejet du
  // connu-mauvais. Les `!` d'origine passaient `undefined` tel quel — même
  // message d'absence au bout, mais aucune validation. Trou trouvé au rebase
  // du 2026-08-18 : cette lecture brute contournait la garde.
  const { url, key } = configPublique();

  return createServerClient(
    url,
    key,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : ignorable si un middleware
            // rafraîchit les sessions.
          }
        },
      },
    }
  );
}
