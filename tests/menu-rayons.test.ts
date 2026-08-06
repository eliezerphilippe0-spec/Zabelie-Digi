import test from "node:test";
import assert from "node:assert/strict";
import { construireMenu } from "../lib/taxonomy";

/**
 * Construction du menu des rayons — éprouvée sans base.
 *
 * Le vrai chemin (`getMenuRayons`) rend `[]` sans Supabase : la seule façon
 * d'exercer la règle est de l'avoir sortie de la requête. C'est aussi là que
 * vivent les fautes qui coûtent cher — un département marqué désert alors que
 * sa marchandise est rangée un niveau plus bas, un rayon orphelin qui remonte
 * à la racine et se fait passer pour un département.
 */

type Cat = Parameters<typeof construireMenu>[0][number];

const cat = (o: Partial<Cat> & { id: string; slug: string }): Cat => ({
  label_fr: o.slug,
  label_kr: o.slug + "-kr",
  label_en: o.slug + "-en",
  level: 1,
  parent_id: null,
  active: true,
  position: 0,
  ...o,
}) as Cat;

// Département actif, un sous-rayon actif, un sous-rayon INACTIF.
const CATS: Cat[] = [
  cat({ id: "d1", slug: "manje", label_fr: "Alimentation", level: 1, position: 10 }),
  cat({ id: "s1", slug: "pwodwi-lokal", label_fr: "Produits locaux", level: 2, parent_id: "d1", position: 10 }),
  cat({ id: "s2", slug: "bwason", label_fr: "Boissons", level: 2, parent_id: "d1", position: 20 }),
  cat({ id: "s3", slug: "cache", label_fr: "Masqué", level: 2, parent_id: "d1", active: false }),
  cat({ id: "d2", slug: "elektwonik", label_fr: "Électronique", level: 1, position: 20 }),
  cat({ id: "d3", slug: "dormant", label_fr: "Dormant", level: 1, active: false, position: 30 }),
];

test("le lien d'un rayon filtre par le label_fr du DÉPARTEMENT, jamais par son slug", () => {
  // Le bug que ce test fige : `?cat=<slug>` alors que `products.category`
  // stocke le label_fr du département (`api/products/physical` §160). Un
  // clic de menu rendait toujours zéro résultat — et rien ne le signalait
  // tant qu'aucun produit physique n'était publié.
  const m = construireMenu(CATS, new Map(), "ht"); // langue ≠ fr, exprès :
  // le libellé AFFICHÉ suit la langue, le FILTRE reste label_fr.
  const dep = m[0];
  assert.equal(dep.href, "/catalogue?cat=Alimentation");
  assert.equal(dep.enfants[0].href, "/catalogue?cat=Alimentation&sous=pwodwi-lokal");
  // Connu-négatif : la forme fautive d'origine ne doit réapparaître nulle part.
  const tous = m.flatMap((r) => [r, ...r.enfants]);
  for (const r of tous) {
    assert.ok(
      !r.href.includes("cat=" + r.slug),
      `href fautif (slug comme filtre département) : ${r.href}`
    );
  }
});

test("seuls les rayons ACTIFS apparaissent", () => {
  const m = construireMenu(CATS, new Map(), "fr");
  assert.deepEqual(m.map((r) => r.slug), ["manje", "elektwonik"]);
  assert.deepEqual(m[0].enfants.map((e) => e.slug), ["pwodwi-lokal", "bwason"]);
});

test("l'ordre suit `position`, pas l'alphabet", () => {
  // Alimentation (10) avant Électronique (20) — l'inverse de l'ordre alphabétique.
  const m = construireMenu(CATS, new Map(), "fr");
  assert.equal(m[0].label, "Alimentation");
  assert.equal(m[1].label, "Électronique");
});

test("catalogue vide → tous les rayons sont marqués vides", () => {
  const m = construireMenu(CATS, new Map(), "fr");
  assert.ok(m.every((r) => r.vide), "aucun produit : tout doit être marqué");
  assert.ok(m[0].enfants.every((e) => e.vide));
});

test("un produit rangé au NIVEAU 2 rend son département non vide", () => {
  // Le piège : compter seulement les produits attachés au département lui-même
  // afficherait « Alimentation » grisé alors qu'il contient des boissons.
  const m = construireMenu(CATS, new Map([["s2", 3]]), "fr");
  const manje = m.find((r) => r.slug === "manje")!;
  assert.equal(manje.vide, false, "le département doit hériter du compte de ses enfants");
  assert.equal(manje.enfants.find((e) => e.slug === "bwason")!.vide, false);
  assert.equal(
    manje.enfants.find((e) => e.slug === "pwodwi-lokal")!.vide,
    true,
    "le rayon frère, lui, reste vide"
  );
});

test("un rayon de niveau 2 ne remonte JAMAIS à la racine", () => {
  // Sinon « Boissons » s'afficherait à côté de « Alimentation » comme un
  // département, et l'acheteur ne comprendrait plus la hiérarchie.
  const m = construireMenu(CATS, new Map(), "fr");
  assert.equal(m.some((r) => r.slug === "bwason"), false);
});

test("le libellé suit la langue, avec repli sur le français", () => {
  assert.equal(construireMenu(CATS, new Map(), "en")[0].label, "manje-en");
  assert.equal(construireMenu(CATS, new Map(), "ht")[0].label, "manje-kr");
  const sansEn = CATS.map((c) => (c.id === "d1" ? { ...c, label_en: "" } : c));
  assert.equal(
    construireMenu(sansEn, new Map(), "en")[0].label,
    "Alimentation",
    "libellé anglais vide → repli français, jamais un rayon sans nom"
  );
});

test("un compte sur une catégorie INACTIVE ne dépollue pas son parent", () => {
  // `s3` est masqué : ses produits ne sont pas atteignables depuis le menu,
  // donc les compter rendrait « Alimentation » cliquable vers du vide.
  const m = construireMenu(CATS, new Map([["s3", 9]]), "fr");
  assert.equal(
    m.find((r) => r.slug === "manje")!.vide,
    true,
    "un rayon masqué ne doit pas peupler son département"
  );
});
