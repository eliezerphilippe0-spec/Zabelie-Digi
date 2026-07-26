import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * `lib/product-kind.ts` est le SEUL endroit autorisé à comparer un type de
 * produit.
 *
 * Pourquoi une règle et pas un refactor : ajouter `physical` à l'union n'a
 * cassé aucune compilation — un ternaire avec `else` reste parfaitement typé
 * quelle que soit la taille de l'union. Le compilateur n'énumère donc pas les
 * sites : la liste des douze venait d'un `grep`, et un `grep` ne prouve rien
 * sur ce qu'il n'a pas trouvé. Rien n'empêchait le treizième d'apparaître dans
 * trois semaines, écrit de bonne foi.
 *
 * Ce test transforme cette discipline en contrôle machine. Il tourne dans
 * `npm test`, donc dans la CI, donc il casse la chaîne — ce qu'une convention
 * ne fait pas.
 *
 * ⚠️ Substitution assumée : la forme naturelle serait une règle ESLint
 * `no-restricted-syntax`. Le dépôt n'a NI ESLint (aucune config, aucun
 * binaire, absent de package.json) NI étape de lint en CI, et la règle projet
 * interdit d'ajouter une dépendance sans validation. Le contrôle est donc posé
 * ici. Si ESLint entre un jour dans le projet, cette règle a sa place dans sa
 * configuration et ce fichier peut disparaître.
 */

const AUTHORIZED = "lib/product-kind.ts";
const ROOTS = ["app", "components", "lib"];

/** Valeurs de l'énumération `product_kind` (migrations 0001 et 0036). */
const KINDS = ["fichier", "service", "physical"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r)).filter((f) => f !== AUTHORIZED);

test("aucune comparaison de type de produit hors lib/product-kind.ts", () => {
  // `kind` comparé à l'une des valeurs de l'énumération. Les guillemets des
  // deux styles, avec ou sans espaces, et `===` comme `!==`.
  const compare = new RegExp(
    String.raw`\bkind\s*[=!]==?\s*["'](${KINDS.join("|")})["']`
  );

  const offenders: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (compare.test(line)) offenders.push(`${f}:${i + 1} → ${line.trim()}`);
      });
  }

  assert.deepEqual(
    offenders,
    [],
    "Comparer un type de produit hors de lib/product-kind.ts rouvre le trou :\n" +
      "un `else` écrit pour un fichier attrape toute valeur non prévue.\n" +
      "Utilisez isDownloadable / kindLabelKey / pickByKind / deliveryNoticeKey.\n" +
      offenders.join("\n")
  );
});

test("les valeurs de l'énumération SQL sont toutes connues du code", () => {
  // Le bug d'origine : `alter type product_kind add value 'physical'` (0036)
  // sans que l'union TypeScript l'apprenne. Ce test relit les migrations.
  const migDir = "supabase/migrations";
  const declared = new Set<string>();

  for (const f of readdirSync(migDir).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(migDir, f), "utf8");
    for (const m of sql.matchAll(
      /create\s+type\s+product_kind\s+as\s+enum\s*\(([^)]*)\)/gi
    )) {
      for (const v of m[1].matchAll(/'([^']+)'/g)) declared.add(v[1]);
    }
    for (const m of sql.matchAll(
      /alter\s+type\s+product_kind\s+add\s+value(?:\s+if\s+not\s+exists)?\s+'([^']+)'/gi
    )) {
      declared.add(m[1]);
    }
  }

  assert.ok(declared.size > 0, "aucune valeur product_kind trouvée dans les migrations");
  assert.deepEqual(
    [...declared].sort(),
    [...KINDS].sort(),
    "L'énumération SQL et les unions TypeScript ont divergé. Ajoutez la valeur " +
      "à lib/sample-data.ts, lib/database.types.ts et à KINDS ci-dessus — les " +
      "`switch` exhaustifs de lib/product-kind.ts cesseront alors de compiler " +
      "tant que le cas n'est pas traité."
  );
});
