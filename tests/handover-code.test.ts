import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { codeHttpDuMotif } from "../lib/fulfillment";
import { loadRoute } from "./helpers/route-harness";

/* ── Les deux routes du code de remise (0163) ───────────────────────────────── */

type Reponse = { data: unknown; error: { message: string } | null };
function fixture(chemin: "handover-code" | "handover", options: { user?: boolean; limite?: boolean; rpc?: Reponse } = {}) {
  const appels: { rpc: [string, Record<string, unknown>][]; limites: string[]; journal: unknown[][] } = { rpc: [], limites: [], journal: [] };
  const mod = loadRoute(`app/api/fulfillment/${chemin}/route.ts`, {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: "session-user" } } }) } }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (nom: string, args: Record<string, unknown>) => { appels.rpc.push([nom, args]); return options.rpc ?? { data: { ok: true, code: "482915" }, error: null }; } }) },
    "@/lib/zabelie-rate-limit": { rateLimit: async (_a: unknown, cle: string) => { appels.limites.push(cle); return options.limite !== false; } },
    "@/lib/fulfillment": { codeHttpDuMotif },
  }, {}, { console: { log: (...a: unknown[]) => appels.journal.push(a), warn: (...a: unknown[]) => appels.journal.push(a), error: (...a: unknown[]) => appels.journal.push(a) } });
  const poste = (corps: unknown) => mod.POST(new Request(`https://zabelie.test/api/fulfillment/${chemin}`, { method: "POST", body: typeof corps === "string" ? corps : JSON.stringify(corps) }));
  return { poste, appels };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));

test("acheteur : l'identité vient de la SESSION, jamais du corps ; le code part en no-store", async () => {
  const f = fixture("handover-code");
  const res = await f.poste({ orderId: "o1", userId: "pirate", p_user_id: "pirate", buyer_id: "pirate" });
  assert.equal(res.status, 200);
  assert.deepEqual(await json(res), { ok: true, code: "482915" });
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(JSON.parse(JSON.stringify(f.appels.rpc)), [["zabelie_handover_code_get", { p_order_id: "o1", p_user_id: "session-user" }]]);
  assert.equal(f.appels.limites[0], "handover_code:session-user");
});

test("acheteur : sans session 401, sans commande 400, JSON illisible 400, débit épuisé 429 — rien n'atteint la base", async () => {
  for (const [options, corps, statut] of [
    [{ user: false }, { orderId: "o1" }, 401],
    [{}, {}, 400],
    [{}, "pas du json", 400],
    [{ limite: false }, { orderId: "o1" }, 429],
  ] as const) {
    const f = fixture("handover-code", options);
    assert.equal((await f.poste(corps)).status, statut, JSON.stringify([options, corps]));
    assert.equal(f.appels.rpc.length, 0);
  }
});

test("acheteur : les refus de la base gardent leur motif et leur code HTTP ; une réponse sans code valide n'est jamais un succès", async () => {
  for (const [reason, statut] of [["non_autorise", 403], ["commande_introuvable", 404], ["suivi_absent", 409], ["etat_incompatible", 409]] as const) {
    const f = fixture("handover-code", { rpc: { data: { ok: false, reason }, error: null } });
    const res = await f.poste({ orderId: "o1" });
    assert.equal(res.status, statut, reason);
    assert.equal((await json(res)).error, reason);
  }
  for (const data of [{ ok: true }, { ok: true, code: 482915 }, null]) {
    const f = fixture("handover-code", { rpc: { data, error: null } });
    assert.notEqual((await f.poste({ orderId: "o1" })).status, 200, JSON.stringify(data));
  }
  const panne = fixture("handover-code", { rpc: { data: null, error: { message: "relation zabelie_handover_codes: boom" } } });
  const reponse = await panne.poste({ orderId: "o1" });
  assert.equal(reponse.status, 500);
  // docs/78 L4 : le texte de Postgres ne sort pas, une phrase traduite le remplace.
  assert.deepEqual(await json(reponse), { error: "api.write.failed" });
});

test("vendeur : l'identité vient de la SESSION ; le code est rogné et réduit à une chaîne", async () => {
  const f = fixture("handover", { rpc: { data: { ok: true }, error: null } });
  const res = await f.poste({ orderId: "o1", code: "  123456  ", sellerId: "pirate", p_seller_id: "pirate" });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(f.appels.rpc)), [["zabelie_handover_confirm", { p_order_id: "o1", p_seller_id: "session-user", p_code: "123456" }]]);
  assert.equal(f.appels.limites[0], "handover:session-user");
  for (const mauvais of [123456, null, undefined, { a: 1 }, ["123456"]]) {
    const g = fixture("handover", { rpc: { data: { ok: false, reason: "code_invalide" }, error: null } });
    await g.poste({ orderId: "o1", code: mauvais });
    assert.equal(g.appels.rpc[0][1].p_code, "", `un code non textuel part vide : ${JSON.stringify(mauvais)}`);
  }
  const long = fixture("handover", { rpc: { data: { ok: false, reason: "code_invalide" }, error: null } });
  await long.poste({ orderId: "o1", code: "1".repeat(500) });
  assert.equal((long.appels.rpc[0][1].p_code as string).length, 12, "borné avant la base");
});

test("vendeur : 401, 400, 429 avant la base ; les motifs du code ont leur code HTTP et les essais restants sont rendus", async () => {
  for (const [options, corps, statut] of [[{ user: false }, { orderId: "o1", code: "1" }, 401], [{}, { code: "123456" }, 400], [{ limite: false }, { orderId: "o1", code: "123456" }, 429]] as const) {
    const f = fixture("handover", options);
    assert.equal((await f.poste(corps)).status, statut);
    assert.equal(f.appels.rpc.length, 0);
  }
  const cas: [Record<string, unknown>, number][] = [
    [{ ok: false, reason: "code_incorrect", restantes: 3 }, 422],
    [{ ok: false, reason: "code_invalide" }, 422],
    [{ ok: false, reason: "code_absent" }, 409],
    [{ ok: false, reason: "verrouille" }, 423],
    [{ ok: false, reason: "non_autorise" }, 403],
    [{ ok: false, reason: "etat_incompatible", status: "disputed_by_buyer" }, 409],
  ];
  for (const [data, statut] of cas) {
    const f = fixture("handover", { rpc: { data, error: null } });
    const res = await f.poste({ orderId: "o1", code: "123456" });
    assert.equal(res.status, statut, String(data.reason));
    const corps = await json(res);
    assert.equal(corps.error, data.reason);
    if (data.reason === "code_incorrect") assert.equal(corps.restantes, 3);
  }
  const doublon = fixture("handover", { rpc: { data: { ok: true, duplicate: true }, error: null } });
  assert.deepEqual(await json(await doublon.poste({ orderId: "o1", code: "123456" })), { ok: true, duplicate: true });
});

test("le code n'est JAMAIS journalisé : ni celui rendu à l'acheteur, ni celui saisi par le vendeur", async () => {
  const a = fixture("handover-code");
  await a.poste({ orderId: "o1" });
  const v = fixture("handover", { rpc: { data: { ok: false, reason: "code_incorrect", restantes: 2 }, error: null } });
  await v.poste({ orderId: "o1", code: "987654" });
  const tout = JSON.stringify([a.appels.journal, v.appels.journal]);
  assert.ok(!tout.includes("482915") && !tout.includes("987654"), "un code apparaît dans un journal");
  for (const f of ["app/api/fulfillment/handover-code/route.ts", "app/api/fulfillment/handover/route.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /console\.(log|warn|error|info)\(/, `${f} ne journalise rien`);
  }
});

/* ── Le croisement SQL ↔ code ──────────────────────────────────────────────────── */

test("chaque motif que la migration peut rendre a un code HTTP explicite — aucun ne retombe sur le 400 par défaut", () => {
  const sql = readFileSync("supabase/migrations/0163_zabelie_handover_code.sql", "utf8");
  const motifs = [...new Set([...sql.matchAll(/'reason',\s*'([a-z_]+)'/g)].map((m) => m[1]))];
  assert.ok(motifs.length >= 8, `motifs lus : ${motifs.join(", ")}`);
  for (const m of ["commande_introuvable", "non_autorise", "suivi_absent", "etat_incompatible", "code_invalide", "code_absent", "verrouille", "code_incorrect"]) {
    assert.ok(motifs.includes(m), `la migration ne rend plus ${m}`);
  }
  for (const m of motifs) assert.notEqual(codeHttpDuMotif(m), 400, `${m} retombe sur le 400 par défaut : un refus prévu se lirait comme une erreur du client`);
  assert.equal(codeHttpDuMotif("verrouille"), 423);
  assert.equal(codeHttpDuMotif("inconnu"), 400, "un motif inconnu reste une erreur du client");
});

/* ── Les structures qui COMMANDENT ───────────────────────────────────────────── */

const lire = (f: string) => readFileSync(f, "utf8");

test("la migration réutilise le chemin d'écriture UNIQUE de la réception, avec l'identité de l'acheteur, jamais en mode automatique", () => {
  const sql = lire("supabase/migrations/0163_zabelie_handover_code.sql");
  assert.match(sql, /v_res := zabelie_mark_received\(p_order_id, v_buyer, false\);/);
  // Aucune écriture d'argent dans la migration : ni escrow, ni portefeuille, ni grand livre.
  const sansCommentaires = sql.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sansCommentaires, /\b(insert\s+into|update|delete\s+from)\s+(escrow_entries|wallets|wallet_transactions|payments)\b/i);
});

test("le composant ne garde le code ni dans l'URL ni dans le stockage du navigateur, n'envoie aucune identité, et ne lit pas t()", () => {
  const src = lire("components/handover-code.tsx");
  assert.doesNotMatch(src, /localStorage|sessionStorage|document\.cookie|location\.(href|search|hash)|history\.(push|replace)State/);
  assert.doesNotMatch(src, /from "@\/lib\/i18n(-server)?"/);
  assert.doesNotMatch(src, /\bt\(/);
  assert.doesNotMatch(src, /userId|sellerId|buyerId|p_user_id|p_seller_id/);
  assert.match(src, /^"use client";/);
  assert.match(src, /body: JSON\.stringify\(\{ orderId \}\)/);
  assert.match(src, /body: JSON\.stringify\(\{ orderId, code: saisie \}\)/);
  // La saisie est réduite aux chiffres, six au plus ; le bouton n'est actif qu'à six.
  assert.match(src, /replace\(\/\\D\/g, ""\)\.slice\(0, 6\)/);
  assert.match(src, /disabled=\{busy \|\| saisie\.length !== 6\}/);
  // Le code se lit « 482 915 » : un champ limité à SIX caractères tronquerait un code collé avec son espace
  // AVANT le filtrage (« 48291 »). La limite du champ doit dépasser six ; la borne à six chiffres est le slice.
  // Ancré sur l'ÉLÉMENT <input> (inputMode numérique) : le commentaire du composant cite lui aussi `maxLength={8}`,
  // et une recherche nue lirait le commentaire — la mutation qui remet 6 sur l'attribut resterait verte.
  const limite = /inputMode="numeric"[^>]*?maxLength=\{(\d+)\}/.exec(src);
  assert.ok(limite && Number(limite[1]) >= 7, `maxLength du champ de saisie : ${limite?.[1]}`);
  // Le code rendu n'est accepté que s'il a EXACTEMENT six chiffres.
  assert.match(src, /res\.ok && typeof data\.code === "string" && \/\^\[0-9\]\{6\}\$\/\.test\(data\.code\)/);
});

test("les écrans : l'acheteur voit son code à `awaiting_shipment` comme à `shipped` ; le vendeur peut le saisir aux deux", () => {
  const achats = lire("app/mes-achats/page.tsx");
  assert.match(achats, /\(suivi\.status === "awaiting_shipment" \|\| suivi\.status === "shipped"\) && \(\s*<HandoverCodeBuyer/);
  const ventes = lire("app/mes-ventes/page.tsx");
  assert.match(ventes, /\(v\.status === "awaiting_shipment" \|\| v\.status === "shipped"\) && \(\s*<HandoverCodeSeller/);
});
