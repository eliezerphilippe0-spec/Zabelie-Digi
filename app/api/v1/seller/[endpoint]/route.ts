import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { CleIndisponible, lireCle, resoudreCle } from "@/lib/api-keys";
import { readApiBody } from "@/lib/api/v1/transport";
import { ApiErrorOutput } from "@/lib/api/v1/schemas";
import { ErreurApi } from "@/lib/api/v1/handlers";
import { SELLER_ENDPOINTS, SELLER_HANDLERS, type SellerEndpointName } from "@/lib/api/v1/seller";
import { sellerOpenApiDocument } from "@/lib/api/v1/seller-openapi";

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

function erreur(code: string, message: string, field?: string): NextResponse {
  const v = ApiErrorOutput.safeParse({ type: "error", code, message, ...(field ? { field } : {}) });
  const corps = v.success ? v.data : { type: "error", code: "internal", message: "Erreur interne." };
  const res = NextResponse.json(corps, { status: v.success ? CODE_HTTP[code] ?? 500 : 500 });
  res.headers.set("Cache-Control", "no-store");
  if (code === "unauthenticated") res.headers.set("WWW-Authenticate", 'Bearer realm="zabelie"');
  if (code === "rate_limited") res.headers.set("Retry-After", "60");
  return res;
}

export async function POST(req: Request, { params }: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await params;
  if (!Object.prototype.hasOwnProperty.call(SELLER_ENDPOINTS, endpoint)) {
    return erreur("not_found", `Endpoint inconnu : ${endpoint}`);
  }
  const nom = endpoint as SellerEndpointName;
  const { input: schemaEntree, output: schemaSortie, scope } = SELLER_ENDPOINTS[nom];

  const brutCle = lireCle(req.headers);
  if (!brutCle) return erreur("unauthenticated", "Clé d'API absente ou mal formée (Authorization: Bearer zb_live_…).");

  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch (e) {
    console.error("[api/v1/seller] client de service indisponible", e);
    return erreur("internal", "Service indisponible.");
  }

  let resolue;
  try { resolue = await resoudreCle(admin, brutCle); } catch (e) {
    if (e instanceof CleIndisponible) return erreur("internal", "Service indisponible.");
    throw e;
  }
  if (!resolue) return erreur("unauthenticated", "Clé d'API invalide ou révoquée.");
  if (!resolue.scopes.includes(scope)) return erreur("forbidden", `Cette clé n'a pas la portée ${scope}.`);

  if (!(await rateLimit(admin, `apiv1:seller:${resolue.keyId}`, 120))) {
    return erreur("rate_limited", "Trop de requêtes. Réessayez dans une minute.");
  }

  let brut: unknown;
  try { brut = await readApiBody(req); } catch {
    return erreur("invalid_input", "Corps JSON illisible ou supérieur à 16 Kio.");
  }
  const entree = schemaEntree.safeParse(brut);
  if (!entree.success) {
    const p = entree.error.issues[0];
    return erreur("invalid_input", p?.message ?? "Entrée invalide.", p?.path.length ? String(p.path[0]) : undefined);
  }

  let resultat: unknown;
  try {
    resultat = await (SELLER_HANDLERS[nom] as (i: unknown, c: { admin: typeof admin; sellerId: string }) => Promise<unknown>)(
      entree.data, { admin, sellerId: resolue.sellerId },
    );
  } catch (e) {
    if (e instanceof ErreurApi) return erreur(e.code, e.message, e.field);
    console.error(`[api/v1/seller/${nom}] exception non prévue`, e);
    return erreur("internal", "Erreur interne.");
  }

  const sortie = schemaSortie.safeParse(resultat);
  if (!sortie.success) {
    console.error(`[api/v1/seller/${nom}] SORTIE NON CONFORME — réponse retenue.`, JSON.stringify(sortie.error.issues.slice(0, 5)));
    return erreur("internal", "Réponse non conforme au contrat.");
  }
  return NextResponse.json(sortie.data, { status: 200, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ endpoint: string }> }) {
  const { endpoint } = await params;
  // Le contrat est public (aucune donnée), donc lisible depuis n'importe quel outil.
  if (endpoint === "openapi.json") return NextResponse.json(sellerOpenApiDocument(), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
  return NextResponse.json(
    { type: "error", code: "invalid_input", message: "Utilisez POST avec un corps JSON." },
    { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } },
  );
}
