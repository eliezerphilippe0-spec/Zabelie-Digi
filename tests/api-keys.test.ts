import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  CleIndisponible, MAX_CLES_ACTIVES, SCOPES, SCOPES_PAR_DEFAUT, empreinteCle, formatCleValide, genererCle, lireCle, nomCleValide, resoudreCle,
} from "../lib/api-keys";

const SQL = readFileSync("supabase/migrations/0121_zabelie_api_keys.sql", "utf8");

test("A1 — une clé générée a le bon format, et la base n'en reçoit que l'empreinte", () => {
  const { cle, prefixe, empreinte } = genererCle();
  assert.ok(formatCleValide(cle), cle);
  assert.match(prefixe, new RegExp(SQL.match(/prefix ~ '([^']+)'/)![1]), "préfixe refusé par la contrainte SQL");
  assert.ok(cle.startsWith(prefixe));
  assert.equal(empreinte, empreinteCle(cle));
  assert.match(empreinte, /^[0-9a-f]{64}$/);
  assert.notEqual(genererCle().cle, cle, "deux clés identiques");
});

test("A2 — la clé se lit en Bearer ou X-API-Key ; tout le reste est rejeté avant la base", () => {
  const { cle } = genererCle();
  assert.equal(lireCle(new Headers({ authorization: `Bearer ${cle}` })), cle);
  assert.equal(lireCle(new Headers({ "x-api-key": cle })), cle);
  for (const mauvais of ["", "Bearer ", `Bearer ${cle}x`, `Bearer sk_live_${cle.slice(8)}`, `Bearer ${cle.slice(0, 40)}`, "Basic abc"]) {
    assert.equal(lireCle(new Headers({ authorization: mauvais })), null, mauvais);
  }
});

test("A3 — portées et plafond : le code et la migration disent la même chose", () => {
  const sqlScopes = SQL.match(/scopes <@ array\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
  assert.deepEqual(sqlScopes, [...SCOPES]);
  const defaut = SQL.match(/default array\[([^\]]+)\]/)![1].match(/'([^']+)'/g)!.map((s) => s.slice(1, -1));
  assert.deepEqual(defaut, [...SCOPES_PAR_DEFAUT]);
  assert.match(SQL, new RegExp(`if v_actives >= ${MAX_CLES_ACTIVES} then`));
});

test("A4 — nom de clé : 1 à 60 caractères visibles", () => {
  assert.equal(nomCleValide("  Mon   site "), "Mon site");
  for (const non of ["", "   ", "x".repeat(61), 42, null]) assert.equal(nomCleValide(non), null);
});

/** Faux client : rend `ligne` pour la lecture par empreinte, enregistre les mises à jour. */
function faux(ligne: unknown, erreur: unknown = null) {
  const lus: string[] = []; const ecrits: unknown[] = [];
  const client = {
    from() {
      return {
        select() { return { eq(_c: string, v: string) { lus.push(v); return { maybeSingle: async () => ({ data: ligne, error: erreur }) }; } }; },
        update(v: unknown) { ecrits.push(v); return { eq: async () => ({ error: null }) }; },
      };
    },
  } as unknown as SupabaseClient;
  return { client, lus, ecrits };
}

test("A5 — résolution : inconnue, révoquée, vendeur suspendu → null ; panne → lève", async () => {
  const { cle } = genererCle();
  const base = { id: "k1", seller_id: "s1", scopes: ["products:read"], revoked_at: null, last_used_at: null, seller: { suspended_at: null } };
  const ok = faux(base);
  assert.deepEqual(await resoudreCle(ok.client, cle), { keyId: "k1", sellerId: "s1", scopes: ["products:read"] });
  assert.deepEqual(ok.lus, [empreinteCle(cle)], "la lecture doit porter sur l'EMPREINTE, jamais sur la clé");
  assert.equal(await resoudreCle(faux(null).client, cle), null);
  assert.equal(await resoudreCle(faux({ ...base, revoked_at: "2026-10-01" }).client, cle), null);
  assert.equal(await resoudreCle(faux({ ...base, seller: { suspended_at: "2026-10-01" } }).client, cle), null);
  await assert.rejects(resoudreCle(faux(null, { message: "panne" }).client, cle), CleIndisponible);
  await assert.rejects(resoudreCle(faux({ ...base, seller: null }).client, cle), CleIndisponible, "vendeur illisible ≠ vendeur actif");
  const horsFormat = faux(base);
  assert.equal(await resoudreCle(horsFormat.client, "zb_live_court"), null);
  assert.deepEqual(horsFormat.lus, [], "une clé hors format ne doit pas atteindre la base");
});

test("A6 — trace d'usage écrite au plus toutes les 5 minutes", async () => {
  const { cle } = genererCle();
  const t0 = new Date("2026-10-03T12:00:00Z");
  const base = { id: "k1", seller_id: "s1", scopes: ["products:read"], revoked_at: null, seller: { suspended_at: null } };
  const recent = faux({ ...base, last_used_at: "2026-10-03T11:58:00Z" });
  await resoudreCle(recent.client, cle, t0);
  assert.equal(recent.ecrits.length, 0);
  const ancien = faux({ ...base, last_used_at: "2026-10-03T11:50:00Z" });
  await resoudreCle(ancien.client, cle, t0);
  assert.deepEqual(ancien.ecrits, [{ last_used_at: t0.toISOString() }]);
});

test("A7 — les routes : l'empreinte seule part en base, la révocation filtre le vendeur dans la même requête", () => {
  const creer = readFileSync("app/api/account/api-keys/route.ts", "utf8");
  assert.match(creer, /const \{ cle, prefixe, empreinte \} = genererCle\(\);[\s\S]{0,200}\.insert\(\{ seller_id: user\.id, name: nom, prefix: prefixe, key_hash: empreinte,/);
  assert.doesNotMatch(creer, /insert\([^)]*\bcle\b/, "la clé en clair ne doit jamais être insérée");
  const revoquer = readFileSync("app/api/account/api-keys/[id]/route.ts", "utf8");
  assert.match(revoquer, /\.update\(\{ revoked_at: [^}]+\}\)\s*\.eq\("id", id\)\s*\.eq\("seller_id", user\.id\)\s*\.is\("revoked_at", null\)/);
});
