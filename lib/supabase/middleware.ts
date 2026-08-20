import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configPublique } from "@/lib/supabase/config";

/**
 * Rafraîchit la session Supabase à chaque requête (pattern SSR officiel).
 * No-op si Supabase n'est pas configuré (démo sans base).
 */
export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  // Même lecture centralisée que les trois autres clients. Le NO-OP est
  // préservé — et ÉLARGI en connaissance : absente OU invalide, le middleware
  // passe sans rafraîchir la session. L'échec bruyant vit dans les clients
  // (`server.ts`, `client.ts`), qui lèvent avec la valeur nommée ; un
  // middleware qui lève casserait TOUTES les requêtes, y compris la page
  // d'erreur censée l'expliquer. (`atob`, pas `Buffer` : runtime Edge.)
  let url: string, anon: string;
  try {
    ({ url, key: anon } = configPublique());
  } catch {
    return response;
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: {
          name: string;
          value: string;
          options?: Record<string, unknown>;
        }[]
      ) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Important : rafraîchit le token si nécessaire.
  await supabase.auth.getUser();
  return response;
}
