import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Aucune fiche ne part en ligne sans qu'un humain l'ait décidé.
 *
 * La politique publique (`/produits-interdits`) promet que chaque fiche est
 * examinée avant d'apparaître. Cette promesse n'est tenable que si les TROIS
 * types naissent en brouillon. Deux chemins la trahissaient :
 *
 *   - `service: "published"` — mise en ligne immédiate, personne ne regarde ;
 *   - la route d'upload de livrable, qui faisait passer un `fichier` de
 *     `draft` à `published` toute seule.
 *
 * Ce sont exactement les deux types où atterrissent les risques que la
 * politique vise : un « sèvis transfè lajan » et un logiciel piraté. Le
 * physique, lui, était déjà correct.
 *
 * ⚠️ Garde de SOURCE, pas d'exécution : il lit le code, il ne le fait pas
 * tourner. Il attrape la régression évidente (quelqu'un remet `"published"`),
 * pas une mise en ligne écrite autrement. Un test de bout en bout dirait
 * plus ; celui-ci coûte une seconde et couvre le cas qui s'est produit.
 */

const CREATION = join("app", "api", "products", "route.ts");
const ASSET = join("app", "api", "products", "asset", "route.ts");

test("les trois types de fiche naissent en brouillon", () => {
  const src = readFileSync(CREATION, "utf8");

  // Ancrage sur `pickByKind`, PAS sur le premier `status:` du fichier : celui-ci
  // est le code HTTP d'une réponse d'erreur (`{ status: 401 }`), et la première
  // version de ce test lisait donc le mauvais bloc — elle passait au vert sur
  // un mutant qui remettait `service: "published"`.
  const debut = src.indexOf("pickByKind(kind, {");
  assert.notEqual(debut, -1, "le statut à la création ne vient plus de pickByKind");
  const bloc = src.slice(debut, src.indexOf("}", src.indexOf("physical", debut)) + 1);

  for (const type of ["file", "service", "physical"]) {
    assert.match(
      bloc,
      new RegExp(`${type}:\\s*"draft"`),
      `${type} ne naît pas en brouillon dans ${CREATION} — ` +
        "une fiche de ce type partirait en ligne sans revue humaine, alors que " +
        "/produits-interdits promet le contraire.",
    );
  }
  assert.doesNotMatch(
    bloc,
    /"published"/,
    `${CREATION} publie encore un type à la création.`,
  );
});

test("l'upload d'un livrable ne publie pas la fiche", () => {
  const src = readFileSync(ASSET, "utf8");
  assert.doesNotMatch(
    src,
    /update\(\s*\{\s*status:\s*["']published["']/,
    `${ASSET} repasse une fiche en 'published' : le fichier se remettrait à ` +
      "se publier tout seul, sans qu'aucun humain ne l'ait vue.",
  );
});
