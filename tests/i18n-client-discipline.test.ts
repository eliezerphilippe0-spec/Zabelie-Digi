import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Aucun composant CLIENT ne doit importer `t` ou `DICT` de `lib/i18n`.
 *
 * POURQUOI CE CONTRÔLE EXISTE
 * ---------------------------
 * La règle est écrite en tête de `lib/i18n.ts` depuis l'audit de juillet :
 * `t()` est serveur uniquement, un `"use client"` reçoit ses libellés en props.
 * Elle n'a jamais été vérifiée par rien. Or l'enfreindre ne casse AUCUNE
 * compilation — `t` est une fonction pure, elle s'importe et s'exécute
 * parfaitement dans un composant client. Le seul symptôme est un bundle qui
 * grossit de ~800 lignes × 2 langues, ce que personne ne remarque en
 * développement sur une connexion de bureau. Sur le terrain visé — Android
 * d'entrée de gamme, 3G — c'est exactement le coût qu'on cherche à éviter.
 *
 * Le déclencheur : `app/error.tsx` est le premier composant client du produit
 * qui a réellement BESOIN de libellés traduits sans pouvoir les recevoir en
 * props (Next.js l'instancie avec `{ error, reset }`, il n'a pas de parent).
 * D'où `lib/i18n-erreur.ts`. La tentation de « simplifier » plus tard en
 * réimportant `t` sera forte et paraîtra raisonnable — d'où ce test.
 *
 * EXCEPTION, et une seule : `LANG_COOKIE`, `isLang` et les TYPES peuvent
 * s'importer côté client. Ils ne pèsent rien au bundle et la règle du dépôt les
 * autorise nommément (`lang-toggle`).
 */

const RACINES = ["app", "components"];

function fichiersTsx(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiersTsx(p, acc);
    else if (p.endsWith(".tsx") || p.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

/** Un import de `@/lib/i18n` qui amène `t` ou `DICT` comme valeur. */
function importeLeDictionnaire(src: string): boolean {
  // On isole la clause d'import de `@/lib/i18n`, puis on regarde les
  // spécificateurs NON précédés de `type`. `import { type Lang }` est permis,
  // `import { t }` ne l'est pas.
  const m = src.match(/import\s*\{([^}]*)\}\s*from\s*["']@\/lib\/i18n["']/);
  if (!m) return false;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .some((spec) => {
      if (spec.startsWith("type ")) return false;
      const nom = spec.split(/\s+as\s+/)[0].trim();
      return nom === "t" || nom === "DICT";
    });
}

test("aucun composant client n'importe t() ni DICT depuis lib/i18n", () => {
  const coupables: string[] = [];
  for (const racine of RACINES) {
    for (const f of fichiersTsx(racine)) {
      const src = readFileSync(f, "utf8");
      const estClient = /^\s*["']use client["']/m.test(src);
      if (estClient && importeLeDictionnaire(src)) coupables.push(f);
    }
  }
  assert.deepEqual(
    coupables,
    [],
    `composant(s) client important le dictionnaire i18n : ${coupables.join(", ")}\n` +
      "Passer les libellés en props depuis le parent serveur. Si le composant " +
      "n'a aucun parent (frontière d'erreur), suivre le modèle de " +
      "lib/i18n-erreur.ts."
  );
});
