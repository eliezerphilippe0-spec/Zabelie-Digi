import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRoute } from "./helpers/route-harness";
import { UUID_RE } from "../lib/collections";
import { LANGS, t, type I18nKey, type Lang } from "../lib/i18n";
import { formatHTG } from "../lib/sample-data";

/**
 * M2 (audit du 2026-10-27) — LE REFUS DE RETRAIT DIT LA RAISON ET L'ACTION,
 * DANS LA LANGUE DU VENDEUR.
 *
 * Avant : `app/api/payouts/route.ts` annonçait que `reason` était un code
 * stable « que le client affiche dans la langue du vendeur » ; le client
 * affichait `data.error ?? "—"`, ignorait `code`, et `error` était en français
 * en dur — y compris les trois variantes KYC et les montants.
 *
 * CHOIX : traduction CÔTÉ SERVEUR, motif de `lib/api-erreur.ts` (la phrase
 * part traduite, aucun écran n'a à la reconstruire), et `code` conservé pour
 * que l'écran propose l'ACTION — `kyc_requis` mène au dépôt des pièces.
 *
 * ⚠️ ZONE ARGENT — CE QUI NE BOUGE PAS. Le RPC, ses deux arguments et leurs
 * SOURCES (l'utilisateur de la session, le montant entier du corps) sont
 * gardés deux fois : par l'exécution (l'appel enregistré) et par la LIAISON
 * dans le texte — `p_user_id` lié à `user.id` et non au champ du formulaire,
 * qui porte la MÊME valeur dans le cas nominal et qu'aucune exécution ne
 * distinguerait. Mutation éprouvée : `p_user_id: body.expectedActorId` →
 * R2 rouge, tous les tests d'exécution verts.
 */

const A = "11300000-0000-4000-8000-0000000000b1";

function fixture(lang: Lang, result: Record<string, unknown>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const route = loadRoute("app/api/payouts/route.ts", {
    "@/lib/auth": { getCurrentUser: async () => ({ id: A }) },
    "@/lib/collections": { UUID_RE },
    "@/lib/api-erreur": { erreurTraduite: async (key: I18nKey, status: number) =>
      Response.json({ error: t(lang, key) }, { status }) },
    "@/lib/i18n-server": { getLang: async () => lang },
    "@/lib/i18n": { t },
    "@/lib/sample-data": { formatHTG },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push(JSON.parse(JSON.stringify({ name, args })));
      return { data: result, error: null };
    } }) },
  });
  const send = () => route.POST(new Request("https://example.test/api/payouts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountHtg: 1500, expectedActorId: A }),
  }));
  return { calls, send };
}

/** Chaque refus de la RPC, et la phrase EXACTE attendue dans la langue. */
const REFUS: [Record<string, unknown>, (l: Lang) => string][] = [
  [{ reason: "montant_invalide" }, (l) => t(l, "api.amount.invalid")],
  [{ reason: "sous_minimum", min_htg: 1000 }, (l) => t(l, "api.payout.minimum", { min: formatHTG(1000) })],
  [{ reason: "sous_minimum" }, (l) => t(l, "api.payout.minimum", { min: formatHTG(500) })],
  [{ reason: "au_dessus_plafond", max_htg: 250000 }, (l) => t(l, "api.payout.maximum", { max: formatHTG(250000) })],
  [{ reason: "au_dessus_plafond" }, (l) => t(l, "api.payout.maximum", { max: formatHTG(100000) })],
  [{ reason: "compte_suspendu" }, (l) => t(l, "api.payout.suspended")],
  [{ reason: "portefeuille_absent" }, (l) => t(l, "api.payout.nobalance")],
  [{ reason: "demande_en_cours" }, (l) => t(l, "api.payout.pending")],
  [{ reason: "delai_non_ecoule", cooldown_hours: 48 }, (l) => t(l, "api.payout.cooldown", { heures: "48" })],
  [{ reason: "solde_insuffisant", disponible_htg: 1200, frais_ia_htg: 0 },
    (l) => t(l, "api.payout.balance", { disponible: formatHTG(1200) })],
  [{ reason: "solde_insuffisant", disponible_htg: 1200, frais_ia_htg: 75 },
    (l) => t(l, "api.payout.balance.ia", { disponible: formatHTG(1200), frais: formatHTG(75) })],
  [{ reason: "kyc_requis", kyc_statut: "pending" }, (l) => t(l, "api.payout.kyc.pending")],
  [{ reason: "kyc_requis", kyc_statut: "rejected" }, (l) => t(l, "api.payout.kyc.rejected")],
  [{ reason: "kyc_requis", kyc_statut: "absent" }, (l) => t(l, "api.payout.kyc.missing")],
  [{ reason: "raison_future_inconnue" }, (l) => t(l, "api.payout.refused")],
];

for (const lang of LANGS) {
  test(`R1 — chaque refus de la RPC part traduit, avec son code et ses nombres formatés (${lang})`, async () => {
    for (const [resultat, attendu] of REFUS) {
      const f = fixture(lang, { ok: false, ...resultat });
      const res = await f.send();
      assert.equal(res.status, 422);
      const corps = await res.json();
      assert.deepEqual(corps, { error: attendu(lang), code: resultat.reason }, JSON.stringify(resultat));
      // Aucune variable laissée en clair (`{min}`, `{frais}`…).
      assert.doesNotMatch(corps.error, /\{[a-z]+\}/, `${lang} ${resultat.reason}`);
      // Le RPC est appelé une fois, avec la session et le montant du corps.
      assert.deepEqual(f.calls, [{ name: "zabelie_request_payout", args: { p_user_id: A, p_amount_htg: 1500 } }]);
    }
  });
}

test("R1b — les phrases diffèrent selon la langue : le kreyòl n'est pas un repli du français", () => {
  for (const cle of ["api.payout.minimum", "api.payout.kyc.missing", "api.payout.balance.ia", "api.payout.failed"] as const) {
    assert.equal(new Set(LANGS.map((l) => t(l, cle))).size, 4, cle);
  }
  // Les variables survivent dans chaque langue.
  for (const l of LANGS) {
    assert.ok(t(l, "api.payout.minimum").includes("{min}"), l);
    assert.ok(t(l, "api.payout.maximum").includes("{max}"), l);
    assert.ok(t(l, "api.payout.cooldown").includes("{heures}"), l);
  }
});

/** Code exécuté seulement : les commentaires disent ce qui ne bouge pas. */
const ROUTE = readFileSync("app/api/payouts/route.ts", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("R2 — ZONE ARGENT : l'appel RPC et ses arguments restent liés aux mêmes sources", () => {
  // La session : seule source de l'identité transmise.
  assert.match(ROUTE, /const user = await getCurrentUser\(\);/);
  // Le montant : lié au corps, puis contrôlé entier positif, puis transmis.
  assert.match(
    ROUTE,
    /const amount = Number\(body\.amountHtg\);\s*if \(!Number\.isInteger\(amount\) \|\| amount <= 0\) \{/,
  );
  // L'appel lui-même, avec ses deux arguments EXACTS et rien d'autre.
  assert.match(
    ROUTE,
    /await admin\.rpc\("zabelie_request_payout", \{\s*p_user_id: user\.id,\s*p_amount_htg: amount,\s*\}\);/,
  );
  assert.equal((ROUTE.match(/\.rpc\(/g) ?? []).length, 1, "un seul appel RPC dans la route");
  // Le succès remonte les champs de la RPC, inchangés.
  assert.match(ROUTE, /payoutId: data\.payout_id,\s*balanceHtg: data\.balance_htg,/);
});

test("R2b — les replis numériques affichés sont ceux d'avant (500, 100 000, 24, 0)", () => {
  assert.match(ROUTE, /min: htg\(data\?\.min_htg, 500\)/);
  assert.match(ROUTE, /max: htg\(data\?\.max_htg, 100000\)/);
  assert.match(ROUTE, /heures: String\(data\?\.cooldown_hours \?\? 24\)/);
  assert.match(ROUTE, /disponible: htg\(data\?\.disponible_htg, 0\)/);
  // Plus aucun message en dur dans la route.
  assert.doesNotMatch(ROUTE, /error:\s*"[^"]{6,}"/);
});

const COMPOSANT = readFileSync("components/payout-request.tsx", "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");

test("R3 — l'écran : le code commande l'action KYC, l'erreur est annoncée", () => {
  // Le code du refus est CONSERVÉ depuis l'issue de la porte…
  assert.match(COMPOSANT, /setMsg\(\{ ok: false, text: issue\.error \?\? labels\.failed, code: issue\.code \}\);/);
  // … et c'est lui, et lui seul, qui fait apparaître le lien de dépôt des pièces.
  assert.match(
    COMPOSANT,
    /\{msg\.code === "kyc_requis" && \(\s*<Link\s+href=\{DEPOT_PIECES\}[\s\S]{0,200}\{labels\.kycAction\}/,
  );
  assert.match(COMPOSANT, /const DEPOT_PIECES = "\/tableau-de-bord\/compte#verification";/);
  // Erreur annoncée, succès en statut : chacun commandé par `ok`.
  assert.match(COMPOSANT, /\{msg\?\.ok === false && \(\s*<div role="alert"/);
  assert.match(COMPOSANT, /\{msg\?\.ok === true && \(\s*<p role="status"/);
  // Réseau ≠ refus serveur, et plus de « — » ni de lecture de réponse hors porte.
  assert.match(COMPOSANT, /else if \(issue\.etat === "reseau"\) \{\s*setMsg\(\{ ok: false, text: labels\.networkError \}\);/);
  assert.doesNotMatch(COMPOSANT, /"—"|await res\.json\(\)|await fetch\(/);
});

test("R4 — les trois boutons et le champ font 44 px (min-h-11)", () => {
  const boutons = COMPOSANT.match(/<button[\s\S]*?className="([^"]*)"/g) ?? [];
  assert.equal(boutons.length, 3, `boutons lus : ${boutons.length}`);
  for (const b of boutons) assert.match(b, /className="[^"]*\bmin-h-11\b/, b);
  assert.match(COMPOSANT, /<input[\s\S]{0,200}name="amount"[\s\S]{0,300}className="[^"]*\bmin-h-11\b/);
  // La page passe les deux libellés nouveaux, traduits.
  const page = readFileSync("app/tableau-de-bord/page.tsx", "utf8");
  assert.match(page, /failed: t\(lang, "api\.payout\.failed"\)/);
  assert.match(page, /kycAction: t\(lang, "vendeur\.retrait\.kyc"\)/);
});
