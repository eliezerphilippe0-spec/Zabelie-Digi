import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FILTRES_PRODUITS,
  NOUVEAU_FICHIER,
  NOUVEAU_PRESTATION,
  compterParFiltre,
  dansLeFiltre,
  hrefFiltre,
  hrefNouveau,
  lireFiltre,
  lireNouveau,
} from "../lib/seller-products-filter";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE } from "../lib/product-kind";

/**
 * LA RUBRIQUE « PRODUITS » DU VENDEUR, PAR TYPE (2026-10-18).
 *
 * Constaté par le porteur : depuis le tableau vendeur (produits physiques et
 * services), « Produits » menait à une page pensée pour le numérique, avec
 * un seul formulaire « fichier ou service », l'ancien menu, et une liste qui
 * mêlait tous les types. Les services n'ont pas de page à eux : ils
 * partagent ce tableau et cette rubrique avec le physique.
 */

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const PAGE = sansCommentaires(readFileSync("app/vendre/page.tsx", "utf8"));

test("P1 — le filtre : quatre onglets, et tout le reste vaut « tous »", () => {
  assert.deepEqual([...FILTRES_PRODUITS], ["tous", "physiques", "services", "numeriques"]);
  for (const f of FILTRES_PRODUITS) assert.equal(lireFiltre(f), f);
  for (const autre of [undefined, null, "", "physical", "service", "fichier", "TOUS", 3]) assert.equal(lireFiltre(autre), "tous", String(autre));
  assert.equal(lireFiltre(["services", "physiques"]), "services", "un paramètre répété : le premier compte");
});

test("P2 — chaque onglet ne montre que son type ; un type inconnu n'apparaît que sous « tous »", () => {
  const cas: [string, string, boolean][] = [
    [KIND_PHYSICAL, "physiques", true], [KIND_PHYSICAL, "services", false], [KIND_PHYSICAL, "numeriques", false],
    [KIND_SERVICE, "services", true], [KIND_SERVICE, "physiques", false], [KIND_SERVICE, "numeriques", false],
    [KIND_FILE, "numeriques", true], [KIND_FILE, "services", false], [KIND_FILE, "physiques", false],
  ];
  for (const [kind, filtre, attendu] of cas) assert.equal(dansLeFiltre(kind, filtre as never), attendu, `${kind} sous ${filtre}`);
  for (const kind of [KIND_PHYSICAL, KIND_SERVICE, KIND_FILE, "inconnu"]) assert.ok(dansLeFiltre(kind, "tous"), kind);
  assert.ok(!dansLeFiltre("inconnu", "numeriques"));
  assert.deepEqual(compterParFiltre([KIND_PHYSICAL, KIND_SERVICE, KIND_SERVICE, KIND_FILE, "inconnu"]),
    { tous: 5, physiques: 1, services: 2, numeriques: 1 });
});

test("P3 — « Nouveau produit » : le formulaire ne s'ouvre que pour un type choisi", () => {
  assert.equal(lireNouveau(NOUVEAU_FICHIER), KIND_FILE);
  assert.equal(lireNouveau(NOUVEAU_PRESTATION), KIND_SERVICE);
  for (const autre of [undefined, "", "physique", "service", "fichier", 1]) assert.equal(lireNouveau(autre), null, String(autre));
  assert.equal(hrefNouveau(NOUVEAU_PRESTATION), "/vendre?nouveau=prestation#nouveau");
  assert.equal(hrefFiltre("tous"), "/vendre#mes-produits");
  assert.equal(hrefFiltre("services"), "/vendre?type=services#mes-produits");
});

test("P4 — la page vit dans le menu du tableau vendeur, et l'ancien menu a disparu", () => {
  assert.match(PAGE, /<VendeurShell lang=\{lang\} actif="produits">/);
  assert.doesNotMatch(PAGE, /seller\.workspace|"\/mes-ventes", "seller\.orders"/, "plus d'ancienne rangée de liens");
  const menu = readFileSync("components/vendeur-shell.tsx", "utf8");
  assert.match(menu, /cle: "produits", href: "\/vendre#mes-produits"/);
  assert.match(menu, /export type RubriqueVendeur = [^;]*"produits"/);
});

test("P5 — le type d'abord : physique vers sa page, fichier et service vers le formulaire déjà réglé", () => {
  const iChoix = PAGE.indexOf('id="nouveau"');
  const iForm = PAGE.indexOf("<PublishForm");
  assert.ok(iChoix > 0 && iForm > iChoix, "le choix du type précède le formulaire");
  assert.match(PAGE, /\["\/vendre\/physique", "sell\.new\.physical"/);
  assert.match(PAGE, /\[hrefNouveau\(NOUVEAU_FICHIER\), "sell\.new\.file"/);
  assert.match(PAGE, /\[hrefNouveau\(NOUVEAU_PRESTATION\), "sell\.new\.service"/);
  // Le formulaire n'est rendu que si un type est choisi, et il le reçoit.
  assert.match(PAGE, /\{nouveau && \([\s\S]{0,120}<PublishForm\s+key=\{nouveau\}\s+kindInitial=\{nouveau\}/);
  // Replié, l'en-tête fait 108 px à 360 px : une marge de 96 px laissait le titre dessous.
  assert.match(PAGE, /<section id="nouveau"[^>]*\bscroll-mt-32\b/);
  assert.match(PAGE, /<div id="mes-produits" className="scroll-mt-32">/);
});

test("P6 — la liste filtre l'affichage, pas les données ; un onglet vide le dit", () => {
  assert.match(PAGE, /\{mine\.map\(\(p, i\) => dansLeFiltre\(p\.kind, filtre\) && \(/, "l'index i suit toujours la liste complète (galeries)");
  assert.match(PAGE, /FILTRES_PRODUITS\.map\(\(f\) =>[\s\S]{0,200}aria-current=\{f === filtre \? "page" : undefined\}/);
  assert.match(PAGE, /comptes\[filtre\] === 0 && <p role="status"[^>]*>\{t\(lang, "sell\.filter\.empty"\)\}/);
  // Les liens d'entrée mènent au bon endroit.
  assert.match(readFileSync("app/tableau-de-bord/page.tsx", "utf8"), /cle: "numerique", href: "\/vendre#nouveau"/);
  assert.match(readFileSync("components/authoring-soumission.tsx", "utf8"), /href="\/vendre\?type=numeriques#mes-produits"/);
});

test("P7 — les libellés neufs existent dans les quatre langues", () => {
  const src = readFileSync("lib/i18n.ts", "utf8");
  const cles = ["sell.new.title", "sell.new.hint", "sell.new.physical", "sell.new.physical.hint", "sell.new.file", "sell.new.file.hint",
    "sell.new.service", "sell.new.service.hint", "sell.new.studio", "sell.filter.aria", "sell.filter.all", "sell.filter.physical",
    "sell.filter.service", "sell.filter.file", "sell.filter.empty"];
  for (const cle of cles) assert.equal(src.split(`"${cle}":`).length - 1, 4, cle);
});
