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

/**
 * Seuls fichiers autorisés à écrire un littéral de type de produit :
 *   - le module lui-même, qui les déclare ;
 *   - les dictionnaires i18n, dont les clés contiennent ces mots.
 */
const AUTHORIZED = ["lib/product-kind.ts", "lib/i18n.ts", "lib/i18n-server.ts"];
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

const files = ROOTS.flatMap((r) => walk(r)).filter((f) => !AUTHORIZED.includes(f));

test("aucun littéral de type de produit hors lib/product-kind.ts", () => {
  // La règle porte sur les LITTÉRAUX, pas sur la comparaison `kind ===`.
  // Interdire la seule comparaison laissait trois contournements syntaxiques
  // ouverts, tous parfaitement innocents à écrire :
  //     kind !== "fichier"
  //     ["fichier", "service"].includes(kind)
  //     const t = product.kind; if (t === "fichier") …
  // Un littéral n'a pas de variante d'écriture : on le voit ou il n'est pas là.
  const literal = new RegExp(String.raw`["'](${KINDS.join("|")})["']`);

  const offenders: string[] = [];
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    let inBlockComment = false;
    lines.forEach((line, i) => {
      // La règle porte sur le CODE. Un commentaire qui cite « 'service' » pour
      // expliquer un champ n'ouvre aucun contournement — l'interdire ne ferait
      // qu'inciter à écrire des commentaires plus vagues.
      let code = line;
      if (inBlockComment) {
        const end = code.indexOf("*/");
        if (end === -1) return;
        code = code.slice(end + 2);
        inBlockComment = false;
      }
      const open = code.indexOf("/*");
      if (open !== -1 && code.indexOf("*/", open) === -1) {
        inBlockComment = true;
        code = code.slice(0, open);
      }
      // `//` de commentaire, jamais celui d'une URL (`https://`).
      const slashes = code.replace(/[a-z]+:\/\//gi, "");
      const lineComment = slashes.indexOf("//");
      if (lineComment !== -1) code = slashes.slice(0, lineComment);

      if (literal.test(code)) offenders.push(`${f}:${i + 1} → ${line.trim()}`);
    });
  }

  assert.deepEqual(
    offenders,
    [],
    "Un type de produit ne s'écrit qu'une fois, dans lib/product-kind.ts :\n" +
      "importez KIND_FILE / KIND_SERVICE / KIND_PHYSICAL pour construire,\n" +
      "isDownloadable / isService / pickByKind / kindLabelKey pour décider.\n" +
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
