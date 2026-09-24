import { editorialLangFromPath } from "@/lib/editorial-routing";
import { guideLangFromPath } from "@/lib/guide-routing";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
import { configPublique } from "@/lib/supabase/config";

// Next 16 : convention « proxy » (ex-« middleware »). Rafraîchit la session
// Supabase à chaque requête. Comportement inchangé — simple renommage du point
// d'entrée (le helper updateSession reste dans lib/supabase/middleware.ts).
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  let backendUrl: string | undefined;
  try { backendUrl = configPublique().url; } catch { /* Public demo has no backend. */ }
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production", backendUrl);
  request.headers.set("x-zabelie-nonce", nonce);
  request.headers.set("Content-Security-Policy", policy);
  // Strip caller-supplied language headers; only an explicit localized public URL wins over the cookie.
  request.headers.delete("x-zabelie-guide-lang");
  // Un notFound() tardif après le début du streaming rendrait HTTP 200.
  const editorialSegment = /^\/([^/]+)\/(aide|a-propos|recharges)\/?$/.test(request.nextUrl.pathname);
  if (editorialSegment && !editorialLangFromPath(request.nextUrl.pathname)) {
    const response = NextResponse.rewrite(new URL("/404", request.url), { status: 404, request: { headers: request.headers } });
    response.headers.set("Content-Security-Policy", policy);
    return response;
  }
  const guideLang = guideLangFromPath(request.nextUrl.pathname) ?? editorialLangFromPath(request.nextUrl.pathname);
  if (guideLang) request.headers.set("x-zabelie-guide-lang", guideLang);
  // API handlers own authentication; public reads must not refresh caller cookies.
  const publicApi = request.nextUrl.pathname.startsWith("/api/v1/");
  const response = request.nextUrl.pathname === "/hors-ligne" || publicApi
    ? NextResponse.next({ request })
    : await updateSession(request);
  response.headers.set("Content-Security-Policy", policy);
  if (publicApi) return response;

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
      secure: request.nextUrl.protocol === "https:",
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
