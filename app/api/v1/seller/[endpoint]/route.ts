import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { CleIndisponible, lireCle, resoudreCle } from "@/lib/api-keys";
import { readApiBody } from "@/lib/api/v1/transport";
import { ApiErrorOutput } from "@/lib/api/v1/schemas";
import { ErreurApi } from "@/lib/api/v1/handlers";
import { SELLER_ENDPOINTS, SELLER_HANDLERS, type SellerEndpointName } from "@/lib/api/v1/seller";
import { sellerOpenApiDocument } from "@/lib/api/v1/seller-openapi";
import { estCleMessage, langueApi, message, type CleMessage } from "@/lib/api/v1/seller-i18n";
import type { Lang } from "@/lib/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * API VENDEUR v1 — `POST /api/v1/seller/{endpoint}`, clé d'API obligatoire.
 *
 * Ordre garanti :
 *   1. endpoint inscrit au registre, sinon 404 ;
 *   2. clé présente et bien formée, sinon 401 ;
 *   3. clé connue, active, vendeur non suspendu, sinon 401 (même réponse
 *      pour les trois : rien à apprendre en essayant des clés) ; panne de
 *      lecture → 500 « indisponible », jamais 401 ;
 *   4. portée de la clé suffisante, sinon 403 ;
 *   5. cadence bornée PAR CLÉ, sinon 429 ;
 *   6. corps JSON et entrée conformes, sinon 400 + champ ;
 *   7. handler, cloisonné au vendeur de la clé ;
 *   8. sortie conforme au contrat, sinon `internal` — jamais une réponse approximative.
 *
 * ⚠️ PAS DE CORS, volontairement : une clé d'API ne doit jamais vivre dans un
 * navigateur. Sans `Access-Control-Allow-Origin`, un script de page ne peut
 * pas lire la réponse — l'appel se fait depuis le SERVEUR du site vendeur.
 */

const CODE_HTTP: Record<string, number> = {
  invalid_input: 400, unauthenticated: 401, forbidden: 403, not_found: 404,
  rate_limited: 429, unsupported_state: 409, internal: 500,
};

/** Erreur normalisée, message dans la langue de l'appelant. Jamais de phrase en dur ici. */
function erreur(lang: Lang, code: string, cle: CleMessage, field?: string, vars: Record<string, string> = {}): NextResponse {
  const v = ApiErrorOutput.safeParse({ type: "error", code, message: message(lang, cle, vars), ...(field ? { field } : {}) });
  const corps = v.success ? v.data : { type: "error", code: "internal", message: message(lang, "internal") };
  const res = NextResponse.json(corps, { status: v.success ? CODE_HTTP[code] ?? 500 : 500 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Content-Language", lang);
  if (code === "unauthenticated") res.headers.set("WWW-Authenticate", 'Bearer realm="zabelie"');
  if (code === "rate_limited") res.headers.set("Retry-After", "60");
  return res;
}

export async function POST(req: Request, { params }: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await params;
  const lang = langueApi(req.headers, req.url);
  if (!Object.prototype.hasOwnProperty.call(SELLER_ENDPOINTS, endpoint)) {
    return erreur(lang, "not_found", "endpoint_unknown", undefined, { name: endpoint.slice(0, 60) });
  }
  const nom = endpoint as SellerEndpointName;
  const { input: schemaEntree, output: schemaSortie, scope } = SELLER_ENDPOINTS[nom];

  const brutCle = lireCle(req.headers);
  if (!brutCle) return erreur(lang, "unauthenticated", "key_missing");

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch (e) {
    console.error("[api/v1/seller] client de service indisponible", e);
    return erreur(lang, "internal", "unavailable");
  }

  let resolue;
  try { resolue = await resoudreCle(admin, brutCle); } catch (e) {
    if (e instanceof CleIndisponible) return erreur(lang, "internal", "unavailable");
    throw e;
  }
  if (!resolue) return erreur(lang, "unauthenticated", "key_invalid");
  if (!resolue.scopes.includes(scope)) return erreur(lang, "forbidden", "scope_missing", undefined, { scope });

  if (!(await rateLimit(admin, `apiv1:seller:${resolue.keyId}`, 120))) {
    return erreur(lang, "rate_limited", "rate_limited");
  }

  let brut: unknown;
  try { brut = await readApiBody(req); } catch {
    return erreur(lang, "invalid_input", "body_invalid");
  }
  const entree = schemaEntree.safeParse(brut);
  if (!entree.success) {
    const p = entree.error.issues[0];
    const champ = p?.path.length ? String(p.path[0]) : "body";
    return erreur(lang, "invalid_input", "input_invalid", champ === "body" ? undefined : champ, { field: champ });
  }

  let resultat: unknown;
  try {
    resultat = await (SELLER_HANDLERS[nom] as (i: unknown, c: { admin: typeof admin; sellerId: string }) => Promise<unknown>)(
      entree.data, { admin, sellerId: resolue.sellerId },
    );
  } catch (e) {
    if (e instanceof ErreurApi) return erreur(lang, e.code, estCleMessage(e.message) ? e.message : "internal", e.field);
    console.error(`[api/v1/seller/${nom}] exception non prévue`, e);
    return erreur(lang, "internal", "internal");
  }

  const sortie = schemaSortie.safeParse(resultat);
  if (!sortie.success) {
    console.error(`[api/v1/seller/${nom}] SORTIE NON CONFORME — réponse retenue.`, JSON.stringify(sortie.error.issues.slice(0, 5)));
    return erreur(lang, "internal", "contract");
  }
  return NextResponse.json(sortie.data, { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Language": lang } });
}

export async function GET(req: Request, { params }: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await params;
  const lang = langueApi(req.headers, req.url);
  // Le contrat est public (aucune donnée), donc lisible depuis n'importe quel outil.
  if (endpoint === "openapi.json") return NextResponse.json(sellerOpenApiDocument(lang), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff", "Content-Language": lang, Vary: "Accept-Language" },
  });
  return NextResponse.json(
    { type: "error", code: "invalid_input", message: message(lang, "use_post") },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store", "Content-Language": lang } },
  );
}
