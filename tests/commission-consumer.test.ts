import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `lib/commission.ts` doit avoir au moins un consommateur RÉEL.
 *
 * Motif : un module d'oracle dont le seul importateur est sa propre suite de
 * tests ne peut pas diverger bruyamment. Il diverge en silence — la suite
 * reste verte puisqu'elle vérifie le module contre lui-même, et rien à
 * l'écran ne contredit jamais la règle SQL. C'est exactement la forme de
 * mensonge d'instrument décrite dans `CLAUDE.md` : le code de vérification
 * n'est vérifié par personne.
 *
 * En exigeant un consommateur applicatif, un écart entre l'oracle TS et
 * `zabelie_commission_htg` (0044) devient visible sur l'écran d'un vendeur.
 *
 * Ce test ne dit RIEN sur la justesse du calcul — c'est le rôle de
 * `commission.test.ts`. Il dit seulement que le module est branché.
 */

const ROOTS = ["app", "components", "lib"];
const IMPORT_RE = /from\s+["'](?:@\/lib\/commission|(?:\.\.?\/)+lib\/commission|\.\/commission)["']/;
/**
 * Un import de TYPE ne compte pas : il est effacé à la compilation, donc il
 * ne peut rien faire diverger. Seul un APPEL au calcul est un consommateur —
 * c'est pourquoi on exige l'un des appels, pas seulement l'import.
 *
 * ⚠️ LISTE À TENIR À JOUR, et elle a déjà bougé une fois. Le 2026-08-12, le
 * câblage de `0054` a fait passer `net-estimate.tsx` de `commissionHTG` à
 * `commissionAuTaux` — l'écran consommait toujours le module, mais ce garde
 * a rougi parce qu'il énumérait les NOMS. Le rouge était juste dans sa forme
 * (quelque chose a changé) et faux dans son message (« oracle sans
 * consommateur »).
 *
 * Ne pas remplacer cette énumération par un simple test d'import : c'est
 * précisément ce que la note ci-dessus refuse, un import de type suffirait
 * alors à faire croire le module branché.
 */
const CALL_RE = /\b(?:commissionHTG|netHTG|commissionAuTaux)\s*\(/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("lib/commission.ts a un consommateur applicatif, pas seulement des tests", () => {
  const files = ROOTS.flatMap((r) => walk(r)).filter(
    // Le module lui-même ne compte pas comme son propre consommateur.
    (f) => f !== join("lib", "commission.ts"),
  );

  const consumers = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return IMPORT_RE.test(src) && CALL_RE.test(src);
  });

  assert.ok(
    consumers.length > 0,
    "Aucun fichier de app/, components/ ou lib/ n'importe lib/commission.ts.\n" +
      "Le module est redevenu un oracle sans consommateur : soit on le rebranche\n" +
      "sur un chemin réel (l'estimation vendeur), soit on le supprime et on\n" +
      "déplace l'oracle dans la suite de tests. Voir components/net-estimate.tsx.",
  );
});
