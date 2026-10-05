import { editorialLangFromPath } from "@/lib/editorial-routing";
import { langueDeLUrl } from "@/lib/langue-url";
import { cheminPublicitaire } from "@/lib/pixels";
import { guideLangFromPath } from "@/lib/guide-routing";
import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { contentSecurityPolicy } from "@/lib/content-security-policy";
import { configPublique } from "@/lib/supabase/config";
import { cheminSurDomaine, estHoteZabelie, hoteDe, resoudreDomaine } from "@/lib/domaines";
import { siteUrl } from "@/lib/site-url";

// Next 16 : convention « proxy » (ex-« middleware »). Rafraîchit la session
// Supabase à chaque requête. Comportement inchangé — simple renommage du point
// d'entrée (le helper updateSession reste dans lib/supabase/middleware.ts).
export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  let backendUrl: string | undefined;
  let config: { url: string; key: string } | null = null;
  try { config = configPublique(); backendUrl = config.url; } catch { /* Public demo has no backend. */ }

  /* DOMAINE D'UN VENDEUR (0125). Sa racine sert la boutique ; TOUT autre
     chemin repart vers zabelie.com, où vivent la session, le paiement et
     l'escrow. Aucune session n'est rafraîchie ici : ce domaine ne porte
     jamais les cookies de Zabelie. */
  const hote = hoteDe(request.headers.get("host"));
  if (!estHoteZabelie(hote)) {
    if (cheminSurDomaine(request.nextUrl.pathname) === "zabelie") {
      const renvoi = NextResponse.redirect(new URL(request.nextUrl.pathname + request.nextUrl.search, siteUrl()), 308);
      // Signature lue par l'activation admin : prouve que le domaine atteint
      // CE proxy, et pas une simple redirection posée chez le registraire.
      renvoi.headers.set("x-zabelie-domaine", hote);
      return renvoi;
    }
    const slug = await resoudreDomaine(hote, config);
    const policyBoutique = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production", backendUrl, { publicite: Boolean(slug) });
    request.headers.set("x-zabelie-nonce", nonce);
    request.headers.set("Content-Security-Policy", policyBoutique);
    // Inconnu, inactif ou vendeur plus éligible : un vrai 404, décidé AVANT tout rendu.
    const boutique = slug
      ? NextResponse.rewrite(new URL(`/boutik/${slug}`, request.url), { request: { headers: request.headers } })
      : NextResponse.rewrite(new URL("/404", request.url), { status: 404, request: { headers: request.headers } });
    boutique.headers.set("Content-Security-Policy", policyBoutique);
    return boutique;
  }
  /* LA LANGUE DANS L'URL (docs/47 §3) : `/ht/produit/x` sert `/produit/x` en
     kreyòl. Réécriture, pas redirection : l'adresse indexée reste celle que
     le visiteur voit. Calculée AVANT la CSP, qui juge la page servie. */
  const localise = langueDeLUrl(request.nextUrl.pathname);
  // Domaines des régies publicitaires : seulement sur les pages qui peuvent porter le pixel d'un vendeur.
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV !== "production", backendUrl, { publicite: cheminPublicitaire(localise?.base ?? request.nextUrl.pathname) });
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
  const guideLang = localise?.lang ?? guideLangFromPath(request.nextUrl.pathname) ?? editorialLangFromPath(request.nextUrl.pathname);
  if (guideLang) request.headers.set("x-zabelie-guide-lang", guideLang);
  // API handlers own authentication; public reads must not refresh caller cookies.
  const publicApi = request.nextUrl.pathname.startsWith("/api/v1/");
  const response = request.nextUrl.pathname === "/hors-ligne" || publicApi
    ? NextResponse.next({ request })
    : await updateSession(request, localise ? new URL(localise.base + request.nextUrl.search, request.url) : undefined);
  response.headers.set("Content-Security-Policy", policy);
  if (publicApi) return response;

  // Arrivé par `/ht/…` depuis Google : la suite de la visite (liens internes
  // sans préfixe) reste dans cette langue. Même cookie que `lang-toggle`.
  if (localise && request.cookies.get(LANG_COOKIE_NOM)?.value !== localise.lang) {
    response.cookies.set(LANG_COOKIE_NOM, localise.lang, { maxAge: 31536000, path: "/", sameSite: "lax" });
  }

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
// Recopiée de lib/i18n.ts (LANG_COOKIE) : le dictionnaire n'a rien à faire
// dans le bundle Edge. tests/langue-url.test.ts croise les deux.
const LANG_COOKIE_NOM = "zabelie_lang";
const REF_COOKIE_JOURS_N = 7;
const REF_CODE_RE = /^[a-z0-9]{6,16}$/;

export const config = {
  matcher: [
    // Tout sauf assets statiques et fichiers image.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
