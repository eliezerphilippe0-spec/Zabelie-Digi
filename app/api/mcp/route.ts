import { NextResponse } from "next/server";
import { POST as appelerV1 } from "@/app/api/v1/[endpoint]/route";
import { POST as appelerVendeurV1 } from "@/app/api/v1/seller/[endpoint]/route";
import { lireCle } from "@/lib/api-keys";
import { SELLER_ENDPOINTS } from "@/lib/api/v1/seller";
import { isPublicEndpoint, readApiBody } from "@/lib/api/v1/transport";
import { langueApi } from "@/lib/api/v1/messages";
import { MCP_VERSIONS, RPC, erreurRpc, traiterCorpsMcp, type AppelOutil } from "@/lib/mcp/serveur";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/mcp` — serveur MCP de Zabelie, LECTURE SEULE (lot 1, 2026-11-11).
 *
 * Transport « Streamable HTTP », sans état : une requête JSON-RPC entre, une
 * réponse JSON sort. Pas de session, pas de flux SSE (GET rend 405), pas de
 * clé : exactement la surface de l'API publique v1, et rien de plus.
 *
 * LE GARDE, et pourquoi cette route peut être publique :
 *
 *   1. un outil n'est exécuté que s'il est une opération PUBLIQUE de la v1
 *      (`isPublicEndpoint`) — les commandes personnelles n'y passent jamais ;
 *   2. l'exécution est DÉLÉGUÉE à `POST /api/v1/{nom}` : validation d'entrée,
 *      quota par adresse et par opération, contrôle de sortie restent ceux de
 *      la v1. Cette route n'ouvre aucun chemin de données qui n'existait pas ;
 *   3. la requête transmise à la v1 ne porte NI cookie NI en-tête
 *      d'autorisation : seule l'adresse de l'appelant suit, pour le quota.
 *
 * `initialize`, `ping` et `tools/list` ne touchent pas la base : ils répondent
 * même si elle est indisponible.
 *
 * OUTILS VENDEUR (lot 3a) — si la requête porte une clé d'API vendeur, les
 * lectures de l'API vendeur s'ajoutent. Trois règles, et elles ne se négocient pas :
 *
 *   a. la clé n'est transmise QU'À la route vendeur (`/api/v1/seller/{nom}`),
 *      qui reste seule à juger sa validité, sa portée et son quota. Elle
 *      n'accompagne jamais un appel d'outil public ;
 *   b. un en-tête de clé présent mais mal formé est refusé en 401 : on ne
 *      rétrograde pas en silence vers l'anonyme un client qui croit être connecté ;
 *   c. une réponse obtenue avec une clé ne porte AUCUN en-tête CORS, comme
 *      l'API vendeur : une clé d'API ne vit pas dans un navigateur. `Authorization`
 *      et `X-API-Key` ne figurent pas non plus dans les en-têtes CORS autorisés.
 *
 * Origine : la validation d'`Origin` du protocole protège un serveur LOCAL
 * contre le détournement DNS. Ici, les données sont publiques et aucune
 * identité ambiante n'est lue : toute origine reçoit ce que `curl` reçoit, et
 * les en-têtes CORS sont ceux de l'API publique.
 */

const EN_TETES: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Accept-Language, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "Retry-After",
};

/** Avec une clé : pas de CORS. Sans : les en-têtes de l'API publique. */
const SANS_CORS: Record<string, string> = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const json = (corps: unknown, status = 200, enTetes: Record<string, string> = EN_TETES) => NextResponse.json(corps, { status, headers: enTetes });
const refusMethode = () =>
  NextResponse.json(erreurRpc(null, RPC.requete, "Method not allowed"), { status: 405, headers: { ...EN_TETES, Allow: "POST, OPTIONS" } });

export async function POST(req: Request) {
  const lang = langueApi(req.headers, req.url);

  // Après l'initialisation, le client annonce la révision négociée. Une révision inconnue est refusée.
  const version = req.headers.get("mcp-protocol-version");
  if (version && !(MCP_VERSIONS as readonly string[]).includes(version)) {
    return json(erreurRpc(null, RPC.requete, `Unsupported protocol version (supported: ${MCP_VERSIONS.join(", ")})`), 400);
  }
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(erreurRpc(null, RPC.requete, "Content-Type must be application/json"), 415);
  }

  // Clé d'API vendeur : absente (outils publics seuls), bien formée, ou refusée.
  const cle = lireCle(req.headers);
  if (!cle && (req.headers.has("authorization") || req.headers.has("x-api-key"))) {
    return NextResponse.json(erreurRpc(null, RPC.requete, "Invalid API key"), { status: 401, headers: { ...SANS_CORS, "WWW-Authenticate": 'Bearer realm="zabelie"' } });
  }
  const enTetes = cle ? SANS_CORS : EN_TETES;

  let corps: unknown;
  try {
    corps = await readApiBody(req);
  } catch {
    return json(erreurRpc(null, RPC.parse, "Parse error"), 400, enTetes);
  }

  const adresse = req.headers.get("x-forwarded-for");
  const appeler: AppelOutil = async (nom, args) => {
    // Défense en profondeur : le registre du module a déjà filtré, la route refuse aussi.
    if (!isPublicEndpoint(nom)) return { status: 404, corps: { type: "error", code: "not_found" } };
    const reponse = await appelerV1(
      new Request(`https://zabelie.invalid/api/v1/${nom}?lang=${lang}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(adresse ? { "x-forwarded-for": adresse } : {}) },
        body: JSON.stringify(args),
      }),
      { params: Promise.resolve({ endpoint: nom }) }
    );
    return { status: reponse.status, corps: await reponse.json().catch(() => null) };
  };

  const appelerVendeur: AppelOutil | null = !cle ? null : async (nom, args) => {
    if (!Object.prototype.hasOwnProperty.call(SELLER_ENDPOINTS, nom)) return { status: 404, corps: { type: "error", code: "not_found" } };
    const reponse = await appelerVendeurV1(
      new Request(`https://zabelie.invalid/api/v1/seller/${nom}?lang=${lang}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
        body: JSON.stringify(args),
      }),
      { params: Promise.resolve({ endpoint: nom }) }
    );
    return { status: reponse.status, corps: await reponse.json().catch(() => null) };
  };

  const resultat = await traiterCorpsMcp(corps, { lang, appeler, appelerVendeur });
  // Que des notifications : accusé de réception, sans corps.
  if (resultat === null) return new NextResponse(null, { status: 202, headers: enTetes });
  return json(resultat, 200, enTetes);
}

/** Aucun flux SSE n'est offert : le protocole demande alors 405. */
export function GET() {
  return refusMethode();
}
/** Aucune session à fermer. */
export function DELETE() {
  return refusMethode();
}
export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: EN_TETES });
}
