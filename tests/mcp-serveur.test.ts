import { test } from "node:test";
import assert from "node:assert/strict";
import * as serveur from "../lib/mcp/serveur";
import { MCP_LOT_MAX, MCP_VERSIONS, MCP_VERSION_RECENTE, RPC, instructionsMcp, nomsOutilsMcp, outilsMcp, traiterCorpsMcp, traiterMessageMcp, type ReponseRpc } from "../lib/mcp/serveur";
import { V1_ENDPOINTS } from "../lib/api/v1/schemas";
import { V1_AUTHENTIFIES } from "../lib/api/v1/handlers";
import { isPublicEndpoint, readApiBody } from "../lib/api/v1/transport";
import { langueApi } from "../lib/api/v1/messages";
import { apiDocsCopy } from "../lib/api/v1/docs-copy";
import { existsSync, readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";

/**
 * SERVEUR MCP, LECTURE SEULE (lot 1, 2026-11-11).
 *
 * Ce que ces tests tiennent : le serveur n'expose QUE les lectures publiques de
 * la v1, il ne les exécute que par la route v1, et il ne lui transmet aucune
 * identité. Le protocole lui-même a été éprouvé avec le client officiel
 * (`@modelcontextprotocol/sdk` 1.32.2) contre un serveur local : négociation,
 * liste des outils, appel, validation de la sortie contre son schéma.
 */
const LANGUES = ["fr", "ht", "en", "es"] as const;

/** Un appelant d'outil espionné : ce qu'il a reçu, et ce qu'il rend. */
function espion(reponse: { status: number; corps: unknown } = { status: 200, corps: { type: "product_results", results: [] } }) {
  const appels: Array<{ nom: string; args: Record<string, unknown> }> = [];
  return { appels, appeler: async (nom: string, args: Record<string, unknown>) => { appels.push({ nom, args }); return reponse; } };
}
const rpc = (method: string, params?: unknown, id: unknown = 1) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });
const erreur = (r: ReponseRpc | null) => (r && "error" in r ? r.error.code : null);
const resultat = (r: ReponseRpc | null) => (r && "result" in r ? (r.result as Record<string, unknown>) : null);

// ── Les outils sont les lectures publiques de la v1, et rien d'autre ──────

test("les outils sont exactement les opérations publiques de la v1 : aucune seconde liste", () => {
  const publics = Object.keys(V1_ENDPOINTS).filter((n) => !V1_AUTHENTIFIES.has(n));
  assert.ok(publics.length >= 8 && V1_AUTHENTIFIES.size >= 1, "le registre a changé de forme : ce test ne compare plus rien");
  assert.deepEqual(nomsOutilsMcp(), publics);
  for (const lang of LANGUES) assert.deepEqual(outilsMcp(lang).map((o) => o.name), publics);
  for (const prive of V1_AUTHENTIFIES) assert.ok(!nomsOutilsMcp().includes(prive), `${prive} exige une session et ne doit pas être un outil`);
});

test("chaque outil a un schéma d'objet sans combinateur à la racine, et se dit en lecture seule", () => {
  for (const lang of LANGUES) {
    for (const o of outilsMcp(lang)) {
      for (const schema of [o.inputSchema, o.outputSchema]) {
        assert.equal(schema.type, "object", `${o.name} : schéma non objet`);
        for (const cle of ["oneOf", "anyOf", "allOf", "$schema"]) assert.ok(!(cle in schema), `${o.name} : ${cle} à la racine`);
      }
      assert.ok(o.description.length > 20 && o.title.length > 3, `${lang}/${o.name} : description absente`);
      assert.deepEqual(o.annotations, { readOnlyHint: true, idempotentHint: true, openWorldHint: false });
    }
  }
  // La contrainte retirée du schéma de get_product est dite en clair, dans chaque langue.
  const regles = LANGUES.map((lang) => outilsMcp(lang).find((o) => o.name === "get_product")!.description);
  for (const d of regles) assert.match(d, /id\b[\s\S]*\bslug/u);
  assert.equal(new Set(regles).size, LANGUES.length, "la règle id/slug doit être traduite");
  assert.notEqual(outilsMcp("fr")[0].description, outilsMcp("ht")[0].description);
});

// ── Le protocole ──────────────────────────────────────────────────────────

test("initialize négocie la révision, n'annonce que les outils, et reprend les phrases publiées", async () => {
  const { appeler, appels } = espion();
  for (const v of MCP_VERSIONS) {
    const r = resultat(await traiterMessageMcp(rpc("initialize", { protocolVersion: v, capabilities: {}, clientInfo: { name: "t", version: "0" } }), { lang: "fr", appeler }));
    assert.equal(r?.protocolVersion, v);
  }
  const inconnu = resultat(await traiterMessageMcp(rpc("initialize", { protocolVersion: "1999-01-01" }), { lang: "ht", appeler }));
  assert.equal(inconnu?.protocolVersion, MCP_VERSION_RECENTE);
  assert.deepEqual(inconnu?.capabilities, { tools: { listChanged: false } });
  assert.equal(inconnu?.instructions, instructionsMcp("ht"));
  assert.ok(instructionsMcp("ht").includes(apiDocsCopy("ht").texts) && instructionsMcp("fr").includes(apiDocsCopy("fr").scope));
  assert.equal(appels.length, 0);
});

test("une notification ne reçoit jamais de réponse ; une requête mal formée ou inconnue reçoit son code", async () => {
  const ctx = { lang: "fr" as const, appeler: espion().appeler };
  assert.equal(await traiterMessageMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, ctx), null);
  assert.equal(await traiterMessageMcp({ jsonrpc: "2.0", method: "notifications/inconnue" }, ctx), null);
  assert.deepEqual(resultat(await traiterMessageMcp(rpc("ping"), ctx)), {});
  assert.equal(erreur(await traiterMessageMcp(rpc("resources/list"), ctx)), RPC.methode);
  assert.equal(erreur(await traiterMessageMcp({ jsonrpc: "1.0", id: 1, method: "ping" }, ctx)), RPC.requete);
  assert.equal(erreur(await traiterMessageMcp({ jsonrpc: "2.0", id: 1 }, ctx)), RPC.requete);
  assert.equal(erreur(await traiterMessageMcp(rpc("ping", undefined, null), ctx)), RPC.requete);
  assert.equal(erreur(await traiterMessageMcp("ping", ctx)), RPC.requete);
  assert.equal(erreur(await traiterMessageMcp(rpc("tools/list", [1, 2]), ctx)), RPC.params);
});

test("tools/call : seul un outil du registre atteint l'exécution, avec ses arguments", async () => {
  const ok = espion({ status: 200, corps: { type: "product_results", results: [{ id: "a" }] } });
  const r = resultat(await traiterMessageMcp(rpc("tools/call", { name: "search_products", arguments: { limit: 3 } }), { lang: "fr", appeler: ok.appeler }));
  assert.deepEqual(ok.appels, [{ nom: "search_products", args: { limit: 3 } }]);
  assert.deepEqual(r?.structuredContent, { type: "product_results", results: [{ id: "a" }] });
  assert.deepEqual(r?.content, [{ type: "text", text: JSON.stringify({ type: "product_results", results: [{ id: "a" }] }) }]);
  assert.ok(!("isError" in r!));

  // Hors registre, privé, ou mal formé : refus AVANT toute exécution.
  for (const params of [{ name: "get_order", arguments: { id: "x" } }, { name: "get_user_orders" }, { name: "drop_table" }, { name: 12 }, {}, { name: "search_products", arguments: "limit=3" }, { name: "search_products", arguments: [1] }]) {
    const refus = espion();
    assert.equal(erreur(await traiterMessageMcp(rpc("tools/call", params), { lang: "fr", appeler: refus.appeler })), RPC.params, JSON.stringify(params));
    assert.equal(refus.appels.length, 0, `exécuté malgré le refus : ${JSON.stringify(params)}`);
  }
  // Arguments absents : un objet vide, comme la v1 l'admet.
  const vide = espion();
  await traiterMessageMcp(rpc("tools/call", { name: "list_categories" }), { lang: "fr", appeler: vide.appeler });
  assert.deepEqual(vide.appels, [{ nom: "list_categories", args: {} }]);
});

test("un refus de la v1 est une erreur d'OUTIL lisible ; une exception est une erreur interne sans détail", async () => {
  const refuse = espion({ status: 400, corps: { type: "error", code: "invalid_input", message: "Entrée invalide (champ : id).", field: "id" } });
  const r = resultat(await traiterMessageMcp(rpc("tools/call", { name: "get_product", arguments: { id: "x", slug: "y" } }), { lang: "fr", appeler: refuse.appeler }));
  assert.equal(r?.isError, true);
  assert.ok(!("structuredContent" in r!), "une erreur ne doit pas se présenter comme une sortie conforme");
  assert.match((r?.content as Array<{ text: string }>)[0].text, /invalid_input/);

  const illisible = espion({ status: 200, corps: null });
  assert.equal(resultat(await traiterMessageMcp(rpc("tools/call", { name: "search_products" }), { lang: "fr", appeler: illisible.appeler }))?.isError, true);

  const casse = await traiterMessageMcp(rpc("tools/call", { name: "search_products" }), { lang: "fr", appeler: async () => { throw new Error("mot de passe=secret"); } });
  assert.equal(erreur(casse), RPC.interne);
  assert.doesNotMatch(JSON.stringify(casse), /secret/);
});

test("un lot est borné, traité en entier, et se tait s'il ne contient que des notifications", async () => {
  const e = espion();
  const ctx = { lang: "fr" as const, appeler: e.appeler };
  const mixte = await traiterCorpsMcp([{ jsonrpc: "2.0", method: "notifications/initialized" }, rpc("ping", undefined, "a"), rpc("tools/call", { name: "search_products" }, "b")], ctx);
  assert.ok(Array.isArray(mixte) && mixte.length === 2);
  assert.deepEqual((mixte as ReponseRpc[]).map((r) => r.id), ["a", "b"]);
  assert.equal(e.appels.length, 1);
  assert.equal(await traiterCorpsMcp([{ jsonrpc: "2.0", method: "notifications/initialized" }], ctx), null);
  assert.equal(erreur((await traiterCorpsMcp([], ctx)) as ReponseRpc), RPC.requete);
  const trop = Array.from({ length: MCP_LOT_MAX + 1 }, (_, i) => rpc("tools/call", { name: "search_products" }, i));
  const avant = e.appels.length;
  assert.equal(erreur((await traiterCorpsMcp(trop, ctx)) as ReponseRpc), RPC.requete);
  assert.equal(e.appels.length, avant, "un lot trop grand ne doit rien exécuter");
});

// ── La route : délégation à la v1, sans identité ──────────────────────────

function route() {
  const recus: Array<{ url: string; endpoint: string; corps: unknown; enTetes: Record<string, string> }> = [];
  const r = loadRoute("app/api/mcp/route.ts", {
    "next/server": { NextResponse: Response },
    "@/app/api/v1/[endpoint]/route": {
      POST: async (req: Request, ctx: { params: Promise<{ endpoint: string }> }) => {
        recus.push({ url: req.url, endpoint: (await ctx.params).endpoint, corps: await req.json(), enTetes: Object.fromEntries(req.headers.entries()) });
        return Response.json({ type: "product_results", results: [] });
      },
    },
    "@/lib/api/v1/transport": { isPublicEndpoint, readApiBody },
    "@/lib/api/v1/messages": { langueApi },
    "@/lib/mcp/serveur": serveur,
  });
  const post = (corps: unknown, enTetes: Record<string, string> = {}) =>
    r.POST(new Request("https://zabelie.test/api/mcp", { method: "POST", headers: { "content-type": "application/json", ...enTetes }, body: typeof corps === "string" ? corps : JSON.stringify(corps) }));
  return { r, recus, post };
}

test("route : l'appel d'outil part vers la v1 sans cookie ni autorisation, avec l'adresse pour le quota", async () => {
  const { recus, post } = route();
  const res = await post(rpc("tools/call", { name: "search_products", arguments: { limit: 2 } }), {
    cookie: "sb-access-token=jeton-de-session", authorization: "Bearer zb_live_cle", "x-forwarded-for": "203.0.113.7, 10.0.0.1", "accept-language": "ht",
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.equal(((await res.json()) as { result: { structuredContent: { type: string } } }).result.structuredContent.type, "product_results");
  assert.equal(recus.length, 1);
  assert.equal(recus[0].endpoint, "search_products");
  assert.deepEqual(recus[0].corps, { limit: 2 });
  assert.equal(new URL(recus[0].url).pathname, "/api/v1/search_products");
  assert.equal(new URL(recus[0].url).searchParams.get("lang"), "ht");
  assert.equal(recus[0].enTetes["x-forwarded-for"], "203.0.113.7, 10.0.0.1");
  for (const interdit of ["cookie", "authorization"]) assert.ok(!(interdit in recus[0].enTetes), `${interdit} transmis à la v1`);
});

test("route : hors registre, la v1 n'est jamais appelée ; les verbes et en-têtes refusés le sont proprement", async () => {
  const { r, recus, post } = route();
  for (const nom of ["get_order", "get_user_orders", "n_importe_quoi"]) {
    const corps = (await (await post(rpc("tools/call", { name: nom, arguments: {} }))).json()) as { error: { code: number } };
    assert.equal(corps.error.code, RPC.params, nom);
  }
  assert.equal(recus.length, 0);

  const notification = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(notification.status, 202);
  assert.equal(await notification.text(), "");
  assert.equal((await post("ceci n'est pas du JSON")).status, 400);
  assert.equal((await post(rpc("ping"), { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(rpc("ping"), { "mcp-protocol-version": "1999-01-01" })).status, 400);
  assert.equal((await post(rpc("ping"), { "mcp-protocol-version": MCP_VERSION_RECENTE })).status, 200);
  for (const verbe of ["GET", "DELETE"] as const) {
    const refus = await (r[verbe] as unknown as () => Response)();
    assert.equal(refus.status, 405);
    assert.equal(refus.headers.get("allow"), "POST, OPTIONS");
  }
  assert.equal(recus.length, 0);
});

// ── L'adresse publiée mène à une route qui existe ─────────────────────────

test("la page développeurs annonce le serveur, dans les quatre langues, à l'adresse de la route", () => {
  assert.ok(existsSync("app/api/mcp/route.ts"), "la route annoncée a disparu");
  const page = readFileSync("app/developpeurs/page.tsx", "utf8");
  assert.match(page, /<h2 id="mcp"[^>]*>\{c\.mcpTitle\}<\/h2>\s*<p[^>]*>\{c\.mcp\}<\/p>/);
  const textes = LANGUES.map((lang) => apiDocsCopy(lang));
  for (const c of textes) {
    assert.ok(c.mcp.includes("https://zabelie.com/api/mcp"), "adresse absente du texte");
    assert.ok(c.mcpTitle.length > 5);
  }
  assert.equal(new Set(textes.map((c) => c.mcp)).size, LANGUES.length, "le paragraphe MCP doit être traduit");
  // Le proxy ne rafraîchit aucune session sur cette route : elle ne lit aucun cookie.
  assert.match(readFileSync("proxy.ts", "utf8"), /const publicApi = request\.nextUrl\.pathname\.startsWith\("\/api\/v1\/"\) \|\| request\.nextUrl\.pathname === "\/api\/mcp";/);
});
