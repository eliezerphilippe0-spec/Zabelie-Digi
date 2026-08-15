import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Next 16 : convention « proxy » (ex-« middleware »). Rafraîchit la session
// Supabase à chaque requête. Comportement inchangé — simple renommage du point
// d'entrée (le helper updateSession reste dans lib/supabase/middleware.ts).
export async function proxy(request: NextRequest) {
  const response = await updateSession(request);

  // Affiliation (0081) : un lien partagé porte ?ref=<code>. Le cookie vit
  // 7 jours (fenêtre Jumia — docs/37 §A) ; l'attribution réelle est décidée
  // par le SERVEUR au checkout, ce cookie n'est qu'un porteur. Un code au
  // format invalide n'est jamais posé — la validation est la même regex que
  // la contrainte SQL de zabelie_affiliates.
  const ref = request.nextUrl.searchParams.get("ref");
  if (ref && REF_CODE_RE.test(ref)) {
    response.cookies.set(REF_COOKIE_NOM, ref, {
      maxAge: REF_COOKIE_JOURS_N * 86400,
      path: "/",
      sameSite: "lax",
      httpOnly: true,
    });
  }
  return response;
}

// Constantes recopiées de lib/affiliation.ts : le proxy Edge ne doit importer
// aucun module qui touche Supabase. tests/affiliation.test.ts CROISE les deux
// définitions — une divergence échoue la suite.
const REF_COOKIE_NOM = "zab_ref";
const REF_COOKIE_JOURS_N = 7;
const REF_CODE_RE = /^[a-z0-9]{6,16}$/;

export const config = {
  matcher: [
    // Tout sauf assets statiques et fichiers image.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
