import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GROUPES_SYNONYMES,
  MAX_VARIANTES,
  MIN_VARIANTE,
  cleMot,
  clausesRecherche,
  variantesRecherche,
} from "../lib/recherche-synonymes";

/**
 * SYNONYMES KREYÒL ↔ FRANÇAIS DANS LA RECHERCHE — audit `docs/69` (lot 1).
 *
 *  R1  « soulye » trouve « chaussure », et l'inverse, pluriel compris ;
 *  R2  la reconnaissance ignore accents et majuscules (« TELEFON » = « telefòn ») ;
 *  R3  un mot d'une requête de plusieurs mots est remplacé seul ;
 *  R4  aucun mot de moins de MIN_VARIANTE lettres n'est injecté (sous-chaîne) ;
 *  R5  un mot n'appartient qu'à un groupe ; les mots ambigus n'y sont pas ;
 *  R6  le nombre de variantes est borné ; une requête inconnue reste seule ;
 *  R7  les clauses PostgREST sont nettoyées, et les deux requêtes du catalogue
 *      (et le repli de démonstration) passent par elles.
 *
 * Chaque garde a été rougie par une mutation avant d'être crue (PR du lot 1).
 */

const RACINE = join(import.meta.dirname, "..");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const PRODUITS = sansCommentaires(readFileSync(join(RACINE, "lib/products.ts"), "utf8"));

test("R1 — soulye ↔ chaussure, dans les deux sens, pluriel compris", () => {
  assert.ok(variantesRecherche("soulye").includes("chaussure"));
  assert.ok(variantesRecherche("chaussure").includes("soulye"));
  assert.ok(variantesRecherche("chaussures").includes("soulye"), "le pluriel doit être reconnu");
  assert.ok(variantesRecherche("dèlko").includes("génératrice"));
  assert.ok(variantesRecherche("gâteaux").includes("gato"));
  assert.equal(variantesRecherche("soulye")[0], "soulye", "la requête d'origine passe en premier");
});

test("R2 — accents et majuscules ignorés à la reconnaissance", () => {
  assert.ok(variantesRecherche("TELEFON").includes("téléphone"));
  assert.ok(variantesRecherche("Téléphone").includes("telefòn"));
  assert.equal(cleMot("  Òdinatè "), "odinate");
});

test("R3 — un mot à la fois dans une requête de plusieurs mots", () => {
  const v = variantesRecherche("soulye nwa");
  assert.ok(v.includes("chaussure nwa"));
  assert.ok(variantesRecherche("panneau solaire").includes("panno solè"), "une expression entière est reconnue");
});

test("R4 — aucun mot court injecté", () => {
  let vus = 0;
  for (const groupe of GROUPES_SYNONYMES) {
    for (const mot of groupe) {
      for (const v of variantesRecherche(mot).slice(1)) {
        vus++;
        assert.ok(v.length >= MIN_VARIANTE, `« ${v} » injecté depuis « ${mot} » : trop court pour une sous-chaîne`);
      }
    }
  }
  assert.ok(vus > 100, `${vus} variantes examinées : extraction suspecte`);
  assert.ok(!variantesRecherche("robe").includes("wòb"), "« wòb » est une clé, jamais une variante");
});

test("R5 — un mot, un seul groupe ; aucun mot ambigu", () => {
  const vu = new Map<string, number>();
  GROUPES_SYNONYMES.forEach((g, i) => {
    for (const mot of g) {
      const k = cleMot(mot);
      assert.ok(!vu.has(k) || vu.get(k) === i, `« ${mot} » est dans deux groupes`);
      vu.set(k, i);
    }
  });
  assert.ok(vu.size > 120, `${vu.size} mots lus : extraction suspecte`);
  for (const ambigu of ["tablet", "tablette", "cours", "rad", "riz"]) {
    assert.ok(!vu.has(cleMot(ambigu)), `« ${ambigu} » est ambigu en sous-chaîne ou en sens`);
  }
});

test("R6 — borné ; une requête inconnue reste seule", () => {
  const longue = "soulye wòb chemiz jip chapo valiz bijou kolye brasle telefòn";
  assert.ok(variantesRecherche(longue).length <= MAX_VARIANTES);
  assert.deepEqual(variantesRecherche("presets lightroom"), ["presets lightroom"]);
  assert.deepEqual(variantesRecherche("   "), []);
});

test("R7 — clauses nettoyées, et le catalogue passe par elles", () => {
  const c = clausesRecherche("soulye");
  assert.ok(c.includes("title.ilike.%soulye%") && c.includes("title.ilike.%chaussure%") && c.includes("description.ilike.%chaussure%"));
  const sales = clausesRecherche("a,b(c)%d");
  assert.equal(sales.length, 2);
  for (const cl of sales) {
    const valeur = /^(title|description)\.ilike\.%(.*)%$/.exec(cl)?.[2];
    assert.ok(valeur !== undefined, `clause mal formée : ${cl}`);
    assert.doesNotMatch(valeur, /[,()%]/);
  }
  // Les deux requêtes du catalogue et le repli de démonstration.
  assert.match(PRODUITS, /if \(q\) \{\s*query = query\.or\(clausesRecherche\(q\)\.join\(","\)\);/);
  assert.match(PRODUITS, /if \(q\) \{\s*const clauses = clausesRecherche\(q\);/);
  assert.match(PRODUITS, /const variantes = variantesRecherche\(q\)\.map\(\(v\) => v\.toLowerCase\(\)\);\s*out = out\.filter\(\(p\) => \{[\s\S]{0,160}return variantes\.some\(\(v\) => texte\.includes\(v\)\);/);
});
