import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { configPublique } from "@/lib/supabase/config";

/**
 * Rafraîchit la session Supabase à chaque requête (pattern SSR officiel).
 * No-op si Supabase n'est pas configuré (démo sans base).
 */
export async function updateSession(request: NextRequest, reecriture?: URL) {
  // `reecriture` : l'adresse servie quand l'URL publique en diffère (`/ht/…`,
  // lib/langue-url.ts). Les cookies de session sont posés sur la même réponse.
  const suite = () => (reecriture ? NextResponse.rewrite(reecriture, { request }) : NextResponse.next({ request }));
  let response = suite();

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
        // Forward refreshed cookies to this render as well as to the browser.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = suite();
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
