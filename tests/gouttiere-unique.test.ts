import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * UNE SEULE GOUTTIÈRE — l'en-tête, l'accueil et le pied de page sur la même
 * ligne, sur chaque page.
 *
 * Mesuré au rendu sur zabelie.com le 2026-09-29 (Chromium) : l'en-tête et
 * l'accueil étaient à 12 px du bord (`px-3`) quand le reste du site, pied de
 * page compris, était à 20 px (`px-5` : 49 conteneurs, contre 12 en `px-3`).
 * Conséquence visible sur CHAQUE page : l'en-tête décalé de 8 px du contenu
 * et du pied (logo à 156, titre à 164, à 1 440 px). Une seule gouttière,
 * celle que le site portait déjà : `px-5`.
 *
 * L'assertion porte sur la classe qui COMMANDE la gouttière, conteneur par
 * conteneur, et vérifie qu'elle a bien lu les trois qui doivent s'aligner.
 */

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersTsx(chemin) : chemin.endsWith(".tsx") ? [chemin.replace(/\\/g, "/")] : [];
  });
}

test("G2 — une seule gouttière : chaque conteneur de page `max-w-6xl` porte px-5, et rien d'autre", () => {
  const vus = new Map<string, number>();
  for (const fichier of [...fichiersTsx("app"), ...fichiersTsx("components")]) {
    const src = readFileSync(fichier, "utf8");
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
      const classes = (m[1] ?? m[2]).split(/\s+/);
      if (!classes.includes("mx-auto") || !classes.includes("max-w-6xl")) continue;
      const retraits = classes.filter((c) => /^(?:[a-z0-9]+:)?px-/.test(c));
      assert.deepEqual(retraits, ["px-5"], `${fichier} : gouttière « ${retraits.join(" ") || "absente"} » — la grille n'en a qu'une, px-5 (20 px)`);
      vus.set(fichier, (vus.get(fichier) ?? 0) + 1);
    }
  }
  // Non-vacuité, et les trois qui doivent s'aligner entre eux : l'en-tête,
  // l'accueil et le pied de page.
  const total = [...vus.values()].reduce((a, b) => a + b, 0);
  assert.ok(total >= 30, `seulement ${total} conteneurs vus — l'extraction a-t-elle cassé ?`);
  for (const fichier of ["components/site-nav.tsx", "app/page.tsx", "components/site-footer.tsx"]) {
    assert.ok(vus.has(fichier), `${fichier} n'a plus de conteneur de page lisible`);
  }
});
