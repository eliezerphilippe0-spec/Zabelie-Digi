import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { CONDITIONS } from "../lib/policy-terms";

/**
 * LE §13 DES CONDITIONS DÉCRIT LA SUSPENSION QUE FAIT LE CODE — RIEN DE PLUS.
 *
 * Rédigé le 2026-10-03 sur le modèle d'Amazon (motif notifié, recours,
 * préavis de 30 jours hors faute), le §13 promet trois choses au vendeur
 * suspendu. Chacune n'est vraie que tant que le code la tient :
 *   1. « toute suspension est motivée » → la route refuse une suspension
 *      sans motif (`api.reason.required`) ;
 *   2. « une suspension n'efface ni ne réduit les sommes dues » → la route ne
 *      touche à AUCUNE table d'argent ; la remédiation d'une fraude passe par
 *      le remboursement, commande par commande (`/api/admin/refund`) ;
 *   3. « seul leur retrait est bloqué » → la version en vigueur de
 *      `zabelie_request_payout` refuse un compte suspendu (`compte_suspendu`).
 *
 * Si l'un des trois bouge, ce n'est plus une évolution technique : c'est le
 * contrat qui devient faux. Ce test le dit au moment du changement.
 */

const ROUTE = "app/api/admin/user-status/route.ts";
const MIGRATIONS = "supabase/migrations";

/** Le code sans ses commentaires : ceux de la route citent le wallet et l'escrow pour dire qu'elle n'y touche pas. */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

/**
 * Toute lecture ou écriture d'une table d'argent, ou appel d'une fonction qui
 * en déplace. Les noms sont ceux que les migrations DÉCLARENT (`create table`),
 * relevés le 2026-10-03 — le test suivant vérifie qu'ils existent toujours.
 */
const TABLES_ARGENT = ["wallets", "wallet_transactions", "escrow_entries", "payouts", "zabelie_refund_receipts", "zabelie_topup_ledger"];
const ARGENT = new RegExp(
  String.raw`\.from\(\s*["'](${TABLES_ARGENT.join("|")})["']\s*\)|\.rpc\(\s*["'](refund_order|mature_wallets|zabelie_request_payout)["']`,
);

/** Texte français du §13, aplati. */
function section13(): string {
  const s = CONDITIONS.fr.sections.find((x) => x.titre.startsWith("13."));
  assert.ok(s, "section 13 introuvable dans les Conditions");
  return s.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul)).join("\n");
}

// ───────────────── L'instrument avant la mesure ──────────────────────────────

test("le détecteur voit un geste d'argent, et pas sa mention en commentaire", () => {
  assert.match('await admin.from("wallets").update({ balance_htg: 0 })', ARGENT);
  assert.match('await admin.rpc("refund_order", { p_order_id })', ARGENT);
  assert.doesNotMatch(sansCommentaires('// Le wallet reste intact : on ne touche pas à .from("wallets")\nconst x = 1;'), ARGENT);
  assert.doesNotMatch('await admin.from("profiles").update({ suspended_at })', ARGENT);
});

test("chaque table d'argent surveillée existe vraiment dans les migrations", () => {
  // Un nom inventé rendrait le garde vert au-dessus du vide : c'est le défaut
  // que la première version de ce fichier portait (`payout_requests`).
  const sql = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"))
    .join("\n");
  for (const table of TABLES_ARGENT) {
    assert.match(sql, new RegExp(String.raw`create table (if not exists )?(public\.)?${table}\b`, "i"), `table ${table} absente des migrations`);
  }
});

// ───────────────────────── Le contrôle ───────────────────────────────────────

test("la route de suspension exige un motif et ne touche à aucune table d'argent", () => {
  const code = sansCommentaires(readFileSync(ROUTE, "utf8"));
  assert.match(code, /"api\.reason\.required"/, "la route accepte une suspension sans motif : le §13 promet le contraire");
  assert.doesNotMatch(code, ARGENT, "la route de suspension déplace de l'argent : le §13 promet que les sommes dues restent intactes");
});

test("la version en vigueur du retrait refuse un compte suspendu", () => {
  const definitions = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => /create (or replace )?function (public\.)?zabelie_request_payout\b/i.test(readFileSync(join(MIGRATIONS, f), "utf8")));
  assert.ok(definitions.length > 0, "aucune migration ne définit zabelie_request_payout");
  const enVigueur = definitions[definitions.length - 1];
  assert.match(
    readFileSync(join(MIGRATIONS, enVigueur), "utf8"),
    /compte_suspendu/,
    `${enVigueur} : le retrait n'est plus refusé à un compte suspendu — le §13 dit le contraire`,
  );
});

test("le §13 promet exactement ce que le code tient", () => {
  const texte = section13();
  for (const promesse of [
    "toute suspension est motivée",
    "n'efface ni ne réduit les sommes dues",
    "seul leur retrait est bloqué",
    "la suspension est réversible",
  ]) {
    assert.ok(texte.includes(promesse), `§13 : « ${promesse} » a disparu ou changé — relire ce test et le code ensemble`);
  }
});
