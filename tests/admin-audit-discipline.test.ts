import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { refus } from "./refus-forme";

/**
 * TOUTE MUTATION ADMIN LAISSE UNE TRACE — et le test le tient pour l'avenir.
 *
 * Le journal `zabelie_admin_actions` (0055) n'a de valeur que s'il est
 * ALIMENTÉ : neuf routes câblées aujourd'hui ne disent rien de la dixième
 * qu'on écrira dans six mois. Ce croisement ferme la classe, comme
 * `crons-appelants` pour les fonctions de maintenance : toute route sous
 * `app/api/admin/` qui exporte un verbe MUTANT (POST/PATCH/PUT/DELETE) doit
 * appeler `journaliserActeAdmin(` — sauf inscription justifiée ci-dessous.
 *
 * Les routes qui n'exportent que GET sont exemptes par détection, pas par
 * liste : lire ne se journalise pas.
 */

const ADMIN_ROOT = join(__dirname, "..", "app", "api", "admin");

/**
 * Routes dont un verbe mutant est EN RÉALITÉ une lecture — chacune doit
 * exhiber la preuve indiquée (le même contrat que PUBLIC_ROUTES). La liste
 * se périme dans les deux sens : une entrée dont la preuve ne correspond
 * plus échoue aussi.
 */
const MUTANTS_LECTURE_SEULE: Record<string, RegExp> = {
  // Le POST relance le MÊME contrôle de cohérence que le GET (déclenchement
  // manuel post-incident) : aucune écriture, la preuve est l'appel unique au
  // rapport de solvabilité.
  "coherence/route.ts": /zabelie_solvency_report/,
};

const VERBES_MUTANTS = /export (?:async function|const) (?:POST|PATCH|PUT|DELETE)\b/;

function collectRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...collectRoutes(p));
    else if (entry === "route.ts") out.push(p);
  }
  return out;
}

test("toute route admin mutante journalise son acte (zabelie_admin_actions)", () => {
  const routes = collectRoutes(ADMIN_ROOT);
  assert.ok(routes.length >= 10, `sanity check : ${routes.length} routes admin`);

  const exemptionsVues = new Set<string>();
  let mutantes = 0;

  for (const file of routes) {
    const rel = relative(ADMIN_ROOT, file).replace(/\\/g, "/");
    const src = readFileSync(file, "utf8");
    if (!VERBES_MUTANTS.test(src)) continue; // GET seul : lire ne se journalise pas

    if (rel in MUTANTS_LECTURE_SEULE) {
      exemptionsVues.add(rel);
      assert.match(
        src,
        MUTANTS_LECTURE_SEULE[rel],
        `${rel} : exemptée comme lecture seule, mais sa preuve ne correspond plus — ` +
          `si la route mute désormais, elle doit journaliser`
      );
      continue;
    }

    mutantes += 1;
    assert.ok(
      src.includes("journaliserActeAdmin(") || src.includes("exigerTraceAdmin("),
      `${rel} : route admin MUTANTE sans trace d'audit — appeler ` +
        `journaliserActeAdmin (best-effort) ou exigerTraceAdmin (fail-closed) ` +
        `avant le retour de succès, ou justifier une entrée MUTANTS_LECTURE_SEULE`
    );
  }

  // Le connu-négatif du croisement lui-même : si plus aucune route mutante
  // n'est vue, c'est la détection qui est cassée, pas le dépôt qui est sage.
  assert.ok(mutantes >= 9, `détection suspecte : ${mutantes} routes mutantes vues`);

  // Les exemptions se périment dans les deux sens.
  for (const ex of Object.keys(MUTANTS_LECTURE_SEULE)) {
    assert.ok(
      exemptionsVues.has(ex),
      `L'exemption « ${ex} » ne correspond plus à aucune route mutante : la retirer.`
    );
  }
});

/**
 * FAIL-CLOSED : la trace PRÉCÈDE l'acte — arbitrage porteur 2026-08-10.
 *
 * Pour les routes de sensibilité maximale, « pas d'audit, pas de mutation » :
 * la trace s'écrit AVANT la RPC d'argent, et son échec rend 503 sans muter.
 * Une garde écrite APRÈS l'appel protégerait le néant (la leçon de
 * facture-token) — ce test verrouille donc l'ORDRE, pas la seule présence.
 * La liste est fermée et se lit comme une politique : y entrer ou en sortir
 * est un arbitrage porteur, pas un détail d'implémentation.
 */
const FAIL_CLOSED: Record<string, string> = {
  // route → la RPC d'argent que la trace doit précéder
  "refund/route.ts": '.rpc("refund_order"',
  "confirm-zelle/route.ts": '.rpc("confirm_payment"',
};

test("routes fail-closed : la trace d'audit est exigée AVANT la RPC d'argent", () => {
  for (const [rel, rpc] of Object.entries(FAIL_CLOSED)) {
    const src = readFileSync(join(ADMIN_ROOT, rel), "utf8");
    const iTrace = src.indexOf("exigerTraceAdmin(");
    const iRpc = src.indexOf(rpc);
    assert.ok(iTrace > -1, `${rel} : exigerTraceAdmin absent — la route n'est plus fail-closed`);
    assert.ok(iRpc > -1, `${rel} : la RPC attendue « ${rpc} » est introuvable — la liste est périmée`);
    assert.ok(
      iTrace < iRpc,
      `${rel} : la trace (${iTrace}) est écrite APRÈS la RPC (${iRpc}) — elle ne bloque rien`
    );
    /* ⚠️ RENFORCÉ le 2026-08-22 — l'assertion précédente était
     * `src.includes("status: 503")` : un littéral FLOTTANT, que rien ne
     * rattachait à l'échec de trace. Supprimer le garde `if (!trace)` l'aurait
     * laissée VERTE dès qu'un 503 subsistait ailleurs dans le fichier — et ces
     * deux routes en portent d'autres.
     *
     * On assert donc sur la LIAISON : c'est l'absence de trace qui commande le
     * refus. `refus()` reconnaît les deux formes (`status: 503` et
     * `erreurTraduite(…, 503)`) — voir tests/refus-forme.ts. */
    assert.match(
      src,
      new RegExp(`if \\(!trace\\)[\\s\\S]{0,160}${refus(503)}`),
      `${rel} : l'échec de trace ne commande aucun refus 503 — la route n'est ` +
        "plus fail-closed, ou son garde a été rendu inatteignable"
    );
  }
});
