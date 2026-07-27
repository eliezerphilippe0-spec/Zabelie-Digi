import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Une page que rien ne lie n'existe pas.
 *
 * `/vendre/physique` a vécu des semaines complet et invisible : la seule
 * occurrence de son chemin en dehors de sa propre page était un COMMENTAIRE
 * de code. Formulaire fonctionnel, taxonomie de 123 catégories derrière,
 * variantes, compatibilité véhicule — et aucun vendeur ne pouvait y arriver
 * autrement qu'en tapant l'URL.
 *
 * Rien ne cassait, aucun test ne rougissait, le build passait. C'est la forme
 * de panne la plus discrète du dépôt : la fonctionnalité est là, le chemin
 * n'y est pas.
 */

const ROOTS = ["app", "components"];

/** Pages qui doivent être atteignables autrement qu'en tapant leur URL. */
const CIBLES = [
  { chemin: "/vendre/physique", page: join("app", "vendre", "physique", "page.tsx") },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Un chemin cité dans un commentaire ne mène nulle part. */
function liensReels(src: string, chemin: string): boolean {
  return src
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .some((l) => l.includes(`href="${chemin}"`) || l.includes(`href={"${chemin}"}`));
}

test("les pages vendeur sont atteignables depuis l'interface", () => {
  const fichiers = ROOTS.flatMap((r) => walk(r));

  for (const { chemin, page } of CIBLES) {
    const liens = fichiers.filter((f) => f !== page && liensReels(readFileSync(f, "utf8"), chemin));
    assert.ok(
      liens.length > 0,
      `Aucun lien vers ${chemin}.\n` +
        "La page existe et fonctionne, mais plus personne ne peut y arriver " +
        "sans connaître l'URL. Un chemin cité en commentaire ne compte pas.",
    );
  }
});
