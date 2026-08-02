import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

/**
 * `sharp` — surveillance d'un risque ACCEPTÉ, pas d'un risque corrigé.
 *
 * ⚠️ CE TEST EST INVERSÉ : il échoue sur une BONNE nouvelle.
 *
 * État au 2026-08-02 : `sharp@0.34.5`, transitive sous `next@16.2.10`. L'avis
 * GHSA-f88m-g3jw-g9cj (CVE-2026-33327, -33328, -35590, -35591 dans libvips)
 * exige `>= 0.35.0`. Aucun chemin de correction n'existe qui ne passe pas par
 * `next` — `npm audit` donne le même `fixAvailable` pour les deux, et ce
 * `fixAvailable` est un RECUL de `next` 16.2.10 vers 14.2.35, incompatible
 * avec React 19.
 *
 * RISQUE ACCEPTÉ — décision porteur du 2026-08-02, sur un fait mesuré : la
 * base contient **zéro produit**, donc aucune image vendeur n'a jamais été
 * téléversée. L'entrée non fiable qui atteindrait libvips n'existe pas encore.
 * Le risque est réel mais entièrement FUTUR, et il a un moment d'activation
 * identifiable : le premier téléversement vendeur. Forcer `sharp` par un
 * `overrides` que Next n'a pas validé échangerait ce risque futur contre un
 * risque de rendu sur les photos produit — l'actif qui n'existe pas encore.
 *
 * POURQUOI UN TEST PLUTÔT QU'UNE LIGNE DANS UN FICHIER DE SUIVI
 * -------------------------------------------------------------
 * Une ligne de suivi demande qu'on pense à la relire. Ce test ne demande rien :
 * le jour où Next 16.x embarquera `sharp >= 0.35`, la CI cassera et dira quoi
 * faire. C'est la seule forme de surveillance qui survit à trois mois
 * d'attention ailleurs.
 *
 * Il lit la version RÉELLEMENT INSTALLÉE, pas celle déclarée : `sharp` n'est
 * pas dans `package.json`, elle arrive par `next`, et c'est l'arbre installé
 * qui décide de ce que libvips exécutera.
 */

const require_ = createRequire(import.meta.url);

/** Version corrigée selon l'avis. Ne pas modifier sans lire l'avis. */
const VERSION_CORRIGEE = "0.35.0";

function compare(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

test("le comparateur de versions discrimine (contrôle de l'instrument)", () => {
  // Sans ce contrôle, un comparateur cassé rendrait 0 partout et le test
  // suivant passerait pour de mauvaises raisons — exactement le motif que ce
  // dépôt traque.
  assert.ok(compare("0.34.5", "0.35.0") < 0, "0.34.5 doit être INFÉRIEUR à 0.35.0");
  assert.ok(compare("0.35.0", "0.35.0") === 0);
  assert.ok(compare("0.36.1", "0.35.0") > 0);
  assert.ok(compare("1.0.0", "0.35.0") > 0, "une majeure doit dominer");
});

test("sharp est TOUJOURS vulnérable — si ce test échoue, c'est une BONNE nouvelle", () => {
  const version: string = require_("sharp/package.json").version;

  assert.ok(
    compare(version, VERSION_CORRIGEE) < 0,
    `\n\n  ✅ BONNE NOUVELLE — sharp est passée à ${version}, soit >= ${VERSION_CORRIGEE}.\n` +
      `  L'avis GHSA-f88m-g3jw-g9cj ne s'applique plus.\n\n` +
      `  À FAIRE MAINTENANT :\n` +
      `    1. \`npm audit --omit=dev\` — vérifier que le compte est retombé ;\n` +
      `    2. retirer le geste bloqué « téléversement vendeur » d'OPS_TODO.md ;\n` +
      `    3. supprimer ce fichier de test, il n'a plus d'objet.\n`
  );

  // L'absence de signal doit être un signal : on journalise l'état surveillé
  // même quand rien ne bouge, sinon « surveillé » et « oublié » se
  // ressemblent trait pour trait dans une sortie de CI.
  console.log(
    `[sharp] ${version} < ${VERSION_CORRIGEE} — risque accepté (0 produit en ` +
      `base au 2026-08-02). Revoir AVANT d'ouvrir le téléversement vendeur.`
  );
});
