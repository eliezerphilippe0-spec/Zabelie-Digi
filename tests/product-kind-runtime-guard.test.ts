import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DIGITAL_KINDS,
  KIND_FILE,
  KIND_PHYSICAL,
  KIND_SERVICE,
  isDigitalKind,
} from "../lib/product-kind";

/**
 * Le `kind` reçu du réseau est validé À L'EXÉCUTION.
 *
 * LE DÉFAUT QUE CE TEST FIGE
 * --------------------------
 * `app/api/products/route.ts` déclarait `kind?: DigitalKind` sur un corps
 * issu de `req.json()`. Un type TypeScript est effacé à la compilation : il
 * ne validait donc rien. Seule la présence de `kind` était testée (`!kind`),
 * et `physical` — valeur d'énumération valide en base depuis `0036` —
 * passait. Une fiche PHYSIQUE pouvait naître par la route DIGITALE, hors des
 * validations de `/api/products/physical` (catégorie active, poids, stock,
 * variantes, acceptation de politique).
 *
 * Le défaut ne cassait aucune compilation, ne levait aucune erreur, et
 * n'était mitigé que par un contrôle HUMAIN (toute fiche naît en brouillon).
 * C'est la forme exacte du motif que ce dépôt traque : ce qui n'échoue pas à
 * la compilation doit échouer à l'exécution, sinon rien n'échoue.
 */

test("connu-positif : les deux types digitaux passent", () => {
  assert.equal(isDigitalKind(KIND_FILE), true);
  assert.equal(isDigitalKind(KIND_SERVICE), true);
});

test("connu-négatif : `physical` est REFUSÉ — c'est le cas du défaut", () => {
  assert.equal(
    isDigitalKind(KIND_PHYSICAL),
    false,
    "un produit physique doit passer par /api/products/physical, qui seul " +
      "valide catégorie active, poids, stock et variantes"
  );
});

test("connu-négatif : toute autre entrée réseau est refusée", () => {
  // Les formes qu'un corps JSON peut réellement prendre — y compris celles
  // qu'un `!kind` laissait passer dès qu'elles étaient « truthy ».
  for (const v of [
    undefined,
    null,
    "",
    " fichier",
    "FICHIER",
    "Fichier",
    0,
    1,
    true,
    {},
    [],
    ["fichier"],
    { kind: "fichier" },
  ]) {
    assert.equal(
      isDigitalKind(v),
      false,
      `entrée acceptée à tort : ${JSON.stringify(v) ?? String(v)}`
    );
  }
});

test("le garde dérive de DIGITAL_KINDS — pas d'union maintenue à part", () => {
  // Si un type digital est ajouté à l'union sans être ajouté au tableau, le
  // garde le refuserait en silence. Le tableau étant la source du type, ce
  // scénario est impossible — ce test l'ancre pour que la refactorisation
  // inverse (réécrire l'union à la main) se voie.
  assert.deepEqual([...DIGITAL_KINDS], [KIND_FILE, KIND_SERVICE]);
  for (const k of DIGITAL_KINDS) assert.equal(isDigitalKind(k), true);
});

test("la route de publication APPELLE le garde", () => {
  // Un garde sans appelant ne protège rien et ne signale rien — le motif
  // « code sans appelant » du CLAUDE.md. La fonction vit dans
  // lib/product-kind.ts (seul fichier autorisé aux littéraux de type) : seule
  // une vérification croisée peut prouver qu'elle atteint la frontière.
  const route = readFileSync("app/api/products/route.ts", "utf8");
  assert.match(
    route,
    /isDigitalKind\(\s*kind\s*\)/,
    "app/api/products/route.ts ne valide plus `kind` à l'exécution — le type " +
      "TypeScript ne le fait pas à sa place."
  );
});
