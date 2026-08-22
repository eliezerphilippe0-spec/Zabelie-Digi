import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UN RÔLE NE SE RÉTROGRADE JAMAIS PAR EFFET DE BORD.
 *
 * ⚠️ CE FICHIER NAÎT D'UNE PANNE SUBIE, PAS D'UNE PRÉCAUTION. Le 2026-08-21, le
 * porteur a publié un produit et a perdu son rôle d'administrateur. Cause :
 * `app/api/products/route.ts` faisait `update({ role: "creator" })` SANS
 * CONDITION, via le client d'administration.
 *
 * Le symptôme était un lien disparu de la navigation. Aucune erreur, aucun
 * journal, aucune trace — la panne s'est présentée comme une absence.
 *
 * ⚠️ ET LE GARDE EXISTANT REGARDAIT AILLEURS. `protect_profile_privileges`
 * (0015) fige `role` en UPDATE, mais exempte `service_role` : la dégradation
 * passait précisément par la porte que la protection laisse ouverte, par
 * conception. C'est pourquoi ce contrôle vit ICI, côté appelants, et non en
 * base : c'est là que se trouve le trou.
 */

const RACINE = ["app", "lib"];

function modules(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) modules(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/** Retire les commentaires : un motif ne doit jamais matcher de la prose. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const FICHIERS = RACINE.flatMap((r) => modules(r));

test("R0 — l'extracteur a lu le dépôt, pas le vide", () => {
  // « aucune écriture trouvée » et « rien lu » ne doivent pas se ressembler.
  assert.ok(FICHIERS.length >= 100, `modules lus : ${FICHIERS.length}`);
});

test("R1 — toute écriture de `role` sur profiles est CONDITIONNELLE", () => {
  const coupables: string[] = [];

  for (const f of FICHIERS) {
    const src = code(readFileSync(f, "utf8"));
    // On cherche les `.update({ ... role ... })` puis on regarde ce qui suit :
    // la chaîne doit porter un filtre sur `role` avant de se terminer.
    const re = /\.update\(\s*\{[^}]*\brole\b[^}]*\}\s*\)([\s\S]{0,240})/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      const suite = m[1];
      // `.eq("role", …)` ou `.in("role", …)` ou `.neq("role", …)` : n'importe
      // quel filtre qui BORNE les lignes touchées selon leur rôle actuel.
      if (!/\.(eq|in|neq|not)\(\s*["']role["']/.test(suite)) {
        coupables.push(f);
      }
    }
  }

  assert.deepEqual(
    coupables,
    [],
    "Écriture de `role` sans filtre sur le rôle courant : " +
      coupables.join(", ") +
      ".\nUne promotion doit être bornée — `.eq(\"role\", \"buyer\")` — sinon " +
      "elle RÉTROGRADE un admin qui passe par ce chemin. Le trigger " +
      "`protect_profile_privileges` (0015) ne vous couvre PAS : il exempte " +
      "`service_role`, et c'est par là que l'écriture passe."
  );
});

test("R2 — la promotion à la publication borne bien sur « buyer »", () => {
  // Le cas nommé, en plus du contrôle général : si la route change de forme,
  // R1 pourrait cesser de la voir sans que personne s'en aperçoive.
  const PUB = code(readFileSync("app/api/products/route.ts", "utf8"));
  assert.match(
    PUB,
    /\.update\(\s*\{\s*role:\s*"creator"\s*\}\s*\)[\s\S]{0,160}\.eq\(\s*"role",\s*"buyer"\s*\)/,
    "la promotion en créateur doit être bornée aux acheteurs"
  );
});
