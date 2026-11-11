import type { Lang } from "@/lib/i18n";
import { openApiDocument, PUBLIC_OPERATIONS } from "@/lib/api/v1/openapi";
import { apiDocsCopy } from "@/lib/api/v1/docs-copy";
import { SELLER_OPERATIONS, sellerOpenApiDocument } from "@/lib/api/v1/seller-openapi";
import { operationEcrit } from "@/lib/api/v1/seller";

/**
 * SERVEUR MCP DE ZABELIE — lot 1, LECTURE SEULE (2026-11-11).
 *
 * Model Context Protocol : le moyen pour un assistant (Claude, ChatGPT, Cursor…)
 * de consulter le catalogue. `docs/24` l'annonçait : « consommés aujourd'hui
 * par la marketplace et demain par un agent sans réécriture ». Ce module est
 * ce « demain », et il ne réécrit rien :
 *
 * * les OUTILS sont les opérations publiques de l'API v1, dérivées du même
 *   registre que la spécification OpenAPI (`PUBLIC_OPERATIONS`). Ajouter une
 *   lecture publique à la v1 l'ajoute ici ; il n'existe aucune seconde liste ;
 * * l'EXÉCUTION d'un outil est déléguée par la route à `POST /api/v1/{nom}` :
 *   même validation d'entrée, même quota, même contrôle de sortie ;
 * * ce fichier ne porte que le PROTOCOLE (JSON-RPC 2.0), et il est pur : la
 *   fonction qui appelle un outil lui est passée, donc tout se teste sans base.
 *
 * Ce que ce lot ne fait PAS, volontairement : aucune écriture, aucune clé,
 * aucune session, aucun outil vendeur, aucun flux SSE. Les commandes
 * personnelles (`get_order`, `get_user_orders`) n'y sont pas : elles exigent
 * une session, et `PUBLIC_OPERATIONS` les exclut déjà.
 *
 * Protocole vérifié le 2026-11-11 sur l'implémentation de référence
 * (`@modelcontextprotocol/sdk` 1.32.2, lue, non installée) : versions,
 * négociation, codes d'erreur, forme des résultats d'outil.
 */

/** Révisions du protocole acceptées, la plus récente d'abord. */
export const MCP_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const MCP_VERSION_RECENTE: string = MCP_VERSIONS[0];
/** Un lot JSON-RPC (révision 2025-03-26) reste borné : chaque appel d'outil compte au quota. */
export const MCP_LOT_MAX = 10;
export const MCP_SERVEUR = { name: "zabelie", title: "Zabelie", version: "1.0.0" } as const;

/** Codes JSON-RPC 2.0. */
export const RPC = { parse: -32700, requete: -32600, methode: -32601, params: -32602, interne: -32603 } as const;

export type OutilMcp = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  annotations:
    | { readOnlyHint: true; idempotentHint: true; openWorldHint: false }
    /** Une opération qui dépose quelque chose : jamais annoncée en lecture seule, jamais destructive. */
    | { readOnlyHint: false; destructiveHint: false; idempotentHint: false; openWorldHint: false };
};

/* `get_product` attend `id` OU `slug`, jamais les deux. L'OpenAPI le dit par un
 * `oneOf` à la racine du schéma ; plusieurs clients MCP refusent un `oneOf`,
 * `anyOf` ou `allOf` à la racine d'un schéma d'outil. La contrainte est donc
 * dite en clair ici, et elle reste APPLIQUÉE par le serveur (schéma zod de la v1). */
const UN_SEUL_REPERE: Record<Lang, string> = {
  fr: "Fournir exactement un des deux : id ou slug.",
  ht: "Bay youn nan de yo sèlman : id oswa slug.",
  en: "Provide exactly one of id or slug.",
  es: "Indique exactamente uno de los dos: id o slug.",
};

type Operation = {
  summary: string;
  description: string;
  requestBody: { content: { "application/json": { schema: Record<string, unknown> } } };
  responses: Record<string, { content?: { "application/json": { schema: Record<string, unknown> } } }>;
};

const sansCles = (objet: Record<string, unknown>, ...cles: string[]) =>
  Object.fromEntries(Object.entries(objet).filter(([cle]) => !cles.includes(cle)));

/** Les outils, dans la langue de l'appelant. Même source que `/api/v1/openapi.json`. */
export function outilsMcp(lang: Lang): OutilMcp[] {
  const chemins = openApiDocument(lang).paths as Record<string, { post: Operation }>;
  return PUBLIC_OPERATIONS.map(([name]) => {
    const op = chemins[`/api/v1/${name}`].post;
    const entree = op.requestBody.content["application/json"].schema;
    const sortie = op.responses["200"].content!["application/json"].schema;
    return {
      name,
      title: op.summary,
      description: "oneOf" in entree ? `${op.description} ${UN_SEUL_REPERE[lang]}` : op.description,
      inputSchema: { ...sansCles(entree, "$schema", "oneOf"), type: "object" },
      outputSchema: { ...sansCles(sortie, "$schema"), type: "object" },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    };
  });
}

export function nomsOutilsMcp(): string[] {
  return PUBLIC_OPERATIONS.map(([name]) => name);
}

/**
 * OUTILS VENDEUR (lot 3a, 2026-11-11) — les lectures de l'API vendeur v1, pour
 * un assistant qui présente la clé d'API du vendeur. Même principe que les
 * outils publics : dérivés du registre (`SELLER_OPERATIONS`), jamais recopiés,
 * et exécutés par la route vendeur, qui reste SEULE à juger la clé, sa portée
 * et son quota. Trois opérations ne font que lire (`create_product_link` rend
 * l'adresse d'une fiche, il ne crée rien).
 *
 * `prepare_product` (lot 3b) DÉPOSE une fiche préparée — pas un produit. Son
 * annotation n'est donc pas « lecture seule » : elle vient du drapeau `ecrit`
 * du registre vendeur, jamais d'une liste tenue ici. Un client MCP qui demande
 * une confirmation avant toute écriture la demandera pour cet outil.
 *
 * Ils ne sont listés et appelables que si une clé accompagne la requête.
 */
export function outilsVendeurMcp(lang: Lang): OutilMcp[] {
  const chemins = sellerOpenApiDocument(lang).paths as unknown as Record<string, { post: Operation }>;
  return SELLER_OPERATIONS.map(([name]) => {
    const op = chemins[`/api/v1/seller/${name}`].post;
    return {
      name,
      title: op.summary,
      description: op.description,
      inputSchema: { ...sansCles(op.requestBody.content["application/json"].schema, "$schema"), type: "object" },
      outputSchema: { ...sansCles(op.responses["200"].content!["application/json"].schema, "$schema"), type: "object" },
      annotations: operationEcrit(name)
        ? { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
        : { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    };
  });
}

export function nomsOutilsVendeurMcp(): string[] {
  return SELLER_OPERATIONS.map(([name]) => name);
}

/** Ce que le serveur dit de lui-même à l'assistant : les phrases déjà publiées sur `/developpeurs`. */
export function instructionsMcp(lang: Lang, vendeur = false): string {
  const c = apiDocsCopy(lang);
  return [c.scope, c.texts, c.empty, ...(vendeur ? [c.sellerIntro, c.sellerPrivacy] : [])].join("\n");
}

/** Résultat de `POST /api/v1/{nom}`, tel que la route le rend à ce module. */
export type ReponseOutil = { status: number; corps: unknown };
export type AppelOutil = (nom: string, args: Record<string, unknown>) => Promise<ReponseOutil>;

type Id = string | number | null;
export type ReponseRpc =
  | { jsonrpc: "2.0"; id: Id; result: unknown }
  | { jsonrpc: "2.0"; id: Id; error: { code: number; message: string } };

const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const estId = (v: unknown): v is string | number => typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

export function erreurRpc(id: Id, code: number, message: string): ReponseRpc {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

/**
 * Traite UN message JSON-RPC. Rend la réponse, ou `null` pour une notification
 * (un message sans `id` n'attend jamais de réponse, même s'il est inconnu).
 */
export type ContexteMcp = {
  lang: Lang;
  appeler: AppelOutil;
  /** Présent seulement si une clé d'API vendeur bien formée accompagne la requête. */
  appelerVendeur?: AppelOutil | null;
};

export async function traiterMessageMcp(message: unknown, ctx: ContexteMcp): Promise<ReponseRpc | null> {
  if (!estObjet(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return erreurRpc(estObjet(message) && estId(message.id) ? message.id : null, RPC.requete, "Invalid Request");
  }
  const aUnId = Object.prototype.hasOwnProperty.call(message, "id");
  if (!aUnId) return null;
  if (!estId(message.id)) return erreurRpc(null, RPC.requete, "Invalid Request");
  const id = message.id;
  const params = message.params === undefined ? {} : message.params;
  if (!estObjet(params)) return erreurRpc(id, RPC.params, "Invalid params");

  switch (message.method) {
    case "initialize": {
      const demandee = params.protocolVersion;
      const protocolVersion = (MCP_VERSIONS as readonly unknown[]).includes(demandee) ? (demandee as string) : MCP_VERSION_RECENTE;
      return {
        jsonrpc: "2.0", id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVEUR,
          instructions: instructionsMcp(ctx.lang, Boolean(ctx.appelerVendeur)),
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return { jsonrpc: "2.0", id, result: { tools: [...outilsMcp(ctx.lang), ...(ctx.appelerVendeur ? outilsVendeurMcp(ctx.lang) : [])] } };
    case "tools/call": {
      const nom = params.name;
      // Le registre EST la liste blanche : un nom hors registre n'atteint jamais la v1.
      if (typeof nom !== "string") return erreurRpc(id, RPC.params, "Unknown tool");
      // Un outil vendeur n'existe pas pour un appelant sans clé : même refus qu'un nom inconnu.
      const executer = nomsOutilsMcp().includes(nom) ? ctx.appeler
        : ctx.appelerVendeur && nomsOutilsVendeurMcp().includes(nom) ? ctx.appelerVendeur : null;
      if (!executer) return erreurRpc(id, RPC.params, "Unknown tool");
      const args = params.arguments === undefined ? {} : params.arguments;
      if (!estObjet(args)) return erreurRpc(id, RPC.params, "Invalid params");
      let reponse: ReponseOutil;
      try {
        reponse = await executer(nom, args);
      } catch (e) {
        console.error(`[mcp] outil ${nom} : exception non prévue`, e);
        return erreurRpc(id, RPC.interne, "Internal error");
      }
      const texte = JSON.stringify(reponse.corps);
      /* Un refus de la v1 (entrée invalide, introuvable, quota) est une erreur
       * D'OUTIL, pas de protocole : l'assistant doit pouvoir la lire et se
       * corriger. Son message est celui de la v1, déjà traduit et sans détail interne. */
      if (reponse.status !== 200 || !estObjet(reponse.corps)) {
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: texte }], isError: true } };
      }
      return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: texte }], structuredContent: reponse.corps } };
    }
    default:
      return erreurRpc(id, RPC.methode, "Method not found");
  }
}

/**
 * Traite le corps d'une requête HTTP : un message, ou un lot borné.
 * `null` : rien à répondre (que des notifications) — la route rend alors 202.
 */
export async function traiterCorpsMcp(corps: unknown, ctx: ContexteMcp): Promise<ReponseRpc | ReponseRpc[] | null> {
  if (!Array.isArray(corps)) return traiterMessageMcp(corps, ctx);
  if (corps.length === 0 || corps.length > MCP_LOT_MAX) return erreurRpc(null, RPC.requete, "Invalid Request");
  const reponses: ReponseRpc[] = [];
  // En série : un lot ne doit pas ouvrir dix lectures simultanées sur la base.
  for (const message of corps) {
    const r = await traiterMessageMcp(message, ctx);
    if (r) reponses.push(r);
  }
  return reponses.length ? reponses : null;
}
