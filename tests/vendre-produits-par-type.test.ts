import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  FILTRES_PRODUITS,
  NOUVEAU_FICHIER,
  NOUVEAU_PRESTATION,
  compterParFiltre,
  dansLeFiltre,
  estArchivee,
  hrefCreer,
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
 *
 * Audit du 2026-10-19 (UX-01, UX-03, UX-06, UX-07) : fiches archivées,
 * formulaire hors de l'écran, sélecteur de type contradictoire, onglet vide
 * sans action.
 */

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");
const PAGE = sansCommentaires(readFileSync("app/vendre/page.tsx", "utf8"));
const FORMULAIRE = sansCommentaires(readFileSync("components/publish-form.tsx", "utf8"));
const fiche = (kind: string, status = "draft") => ({ kind, status });

test("P1 — le filtre : cinq onglets, et tout le reste vaut « tous »", () => {
  assert.deepEqual([...FILTRES_PRODUITS], ["tous", "physiques", "services", "numeriques", "archivees"]);
  for (const f of FILTRES_PRODUITS) assert.equal(lireFiltre(f), f);
  for (const autre of [undefined, null, "", "physical", "service", "fichier", "archived", "TOUS", 3]) assert.equal(lireFiltre(autre), "tous", String(autre));
  assert.equal(lireFiltre(["services", "physiques"]), "services", "un paramètre répété : le premier compte");
});

test("P2 — chaque onglet ne montre que son type ; un type inconnu n'apparaît que sous « tous »", () => {
  const cas: [string, string, boolean][] = [
    [KIND_PHYSICAL, "physiques", true], [KIND_PHYSICAL, "services", false], [KIND_PHYSICAL, "numeriques", false],
    [KIND_SERVICE, "services", true], [KIND_SERVICE, "physiques", false], [KIND_SERVICE, "numeriques", false],
    [KIND_FILE, "numeriques", true], [KIND_FILE, "services", false], [KIND_FILE, "physiques", false],
  ];
  for (const [kind, filtre, attendu] of cas) {
    for (const status of ["draft", "published"]) assert.equal(dansLeFiltre(fiche(kind, status), filtre as never), attendu, `${kind} ${status} sous ${filtre}`);
    assert.ok(!dansLeFiltre(fiche(kind), "archivees"), `${kind} actif hors de « archivees »`);
  }
  for (const kind of [KIND_PHYSICAL, KIND_SERVICE, KIND_FILE, "inconnu"]) assert.ok(dansLeFiltre(fiche(kind), "tous"), kind);
  assert.ok(!dansLeFiltre(fiche("inconnu"), "numeriques"));
});

test("P2b — UX-01 : une fiche archivée n'est que sous « archivees », et ne compte pas ailleurs", () => {
  assert.ok(estArchivee("archived"));
  for (const s of ["draft", "published", "", "archive"]) assert.ok(!estArchivee(s), s);
  for (const kind of [KIND_PHYSICAL, KIND_SERVICE, KIND_FILE]) {
    assert.ok(dansLeFiltre(fiche(kind, "archived"), "archivees"), kind);
    for (const f of ["tous", "physiques", "services", "numeriques"] as const) assert.ok(!dansLeFiltre(fiche(kind, "archived"), f), `${kind} archivé sous ${f}`);
  }
  assert.deepEqual(
    compterParFiltre([fiche(KIND_PHYSICAL), fiche(KIND_SERVICE, "published"), fiche(KIND_SERVICE), fiche(KIND_FILE), fiche("inconnu"), fiche(KIND_SERVICE, "archived"), fiche(KIND_FILE, "archived")]),
    { tous: 5, physiques: 1, services: 2, numeriques: 1, archivees: 2 },
  );
});

test("P3 — « Nouveau produit » : le formulaire ne s'ouvre que pour un type choisi, et on arrive dessus", () => {
  assert.equal(lireNouveau(NOUVEAU_FICHIER), KIND_FILE);
  assert.equal(lireNouveau(NOUVEAU_PRESTATION), KIND_SERVICE);
  for (const autre of [undefined, "", "physique", "service", "fichier", 1]) assert.equal(lireNouveau(autre), null, String(autre));
  // UX-03 : l'ancre est le formulaire, pas le choix du type.
  assert.equal(hrefNouveau(NOUVEAU_PRESTATION), "/vendre?nouveau=prestation#formulaire");
  assert.equal(hrefNouveau(NOUVEAU_FICHIER), "/vendre?nouveau=numerique#formulaire");
  assert.equal(hrefFiltre("tous"), "/vendre#mes-produits");
  assert.equal(hrefFiltre("services"), "/vendre?type=services#mes-produits");
  assert.equal(hrefFiltre("archivees"), "/vendre?type=archivees#mes-produits");
});

test("P3b — UX-07 : un onglet vide mène au formulaire de son type", () => {
  assert.equal(hrefCreer("physiques"), "/vendre/physique");
  assert.equal(hrefCreer("services"), hrefNouveau(NOUVEAU_PRESTATION));
  assert.equal(hrefCreer("numeriques"), hrefNouveau(NOUVEAU_FICHIER));
  assert.equal(hrefCreer("tous"), "/vendre#nouveau");
  assert.equal(hrefCreer("archivees"), null, "on ne crée pas une fiche archivée");
  assert.match(PAGE, /comptes\[filtre\] === 0 && \([\s\S]{0,200}t\(lang, "sell\.filter\.empty"\)[\s\S]{0,120}\{creer && <Link href=\{creer\}[^>]*>\{t\(lang, "sell\.filter\.empty\.cta"\)\}/);
  assert.match(PAGE, /const creer = hrefCreer\(filtre\);/);
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
  // Le formulaire n'est rendu que si un type est choisi, sous l'ancre des cartes (UX-03).
  assert.match(PAGE, /\{nouveau && \(\s*<div id="formulaire" className="[^"]*\bscroll-mt-32\b[^"]*">/);
  assert.match(PAGE, /<PublishForm\s+key=\{`\$\{user.id\}:\$\{nouveau\}`\}\s+actorId=\{user.id\}\s+kind=\{nouveau\}/);
  // Replié, l'en-tête fait 108 px à 360 px : une marge de 96 px laissait le titre dessous.
  assert.match(PAGE, /<section id="nouveau"[^>]*\bscroll-mt-32\b/);
  assert.match(PAGE, /<div id="mes-produits" className="scroll-mt-32">/);
});

test("P5b — UX-06 : le type se lit en titre du formulaire, et se change en revenant au choix", () => {
  assert.match(PAGE, /<h3[^>]*>\{t\(lang, nouveau === COMMITMENT_SERVICE \? "sell\.form\.service" : "sell\.form\.file"\)\}<\/h3>/);
  assert.match(PAGE, /<a href="\/vendre#nouveau"[^>]*>\{t\(lang, "sell\.form\.change"\)\}<\/a>/);
  // Plus de sélecteur de type dans le formulaire : il contredisait la carte surlignée.
  assert.doesNotMatch(FORMULAIRE, /kindAria|kindFile|kindService|set\("kind"/);
  assert.doesNotMatch(PAGE, /kindAria|kindInitial|publish\.kind\.aria/);
  assert.match(FORMULAIRE, /^\s*kind: DigitalKind;/m, "le type est obligatoire");
  // Les modèles de service ne s'affichent que sur le formulaire d'un service.
  assert.match(FORMULAIRE, /\{starterLabels && isService\(form\.kind\) && serviceStarters\.length > 0 && \(/);
});

test("P6 — la liste filtre l'affichage, pas les données ; un onglet vide le dit", () => {
  assert.match(PAGE, /\{mine\.map\(\(p, i\) => dansLeFiltre\(p, filtre\) && \(/, "l'index i suit toujours la liste complète (galeries)");
  assert.match(PAGE, /onglets\.map\(\(f\) =>[\s\S]{0,200}aria-current=\{f === filtre \? "page" : undefined\}/);
  // « Archivés » seulement s'il y a des fiches retirées, ou si l'URL le demande.
  assert.match(PAGE, /const onglets = FILTRES_PRODUITS\.filter\(\(f\) => f !== "archivees" \|\| comptes\.archivees > 0 \|\| filtre === "archivees"\);/);
  assert.match(PAGE, /const comptes = compterParFiltre\(mine\);/);
  // Les liens d'entrée mènent au bon endroit.
  assert.match(readFileSync("app/tableau-de-bord/page.tsx", "utf8"), /cle: "numerique", href: "\/vendre#nouveau"/);
  assert.match(readFileSync("components/authoring-soumission.tsx", "utf8"), /href="\/vendre\?type=numeriques#mes-produits"/);
});

test("P6b — UX-01 : une fiche archivée dit qu'elle est retirée, pas qu'elle attend une revue", () => {
  assert.match(PAGE, /estArchivee\(s\) \? t\(lang, "status\.archived"\) : t\(lang, "status\.review"\)/);
  assert.match(PAGE, /\{estArchivee\(p\.status\) && \(\s*<p[^>]*>\s*\{t\(lang, "sell\.archived\.hint"\)\}\{" "\}\s*<Link href="\/aide"/);
  // Le message « Inutile de la soumettre à nouveau » ne vaut que pour les fiches en revue.
  assert.match(PAGE, /mine\.some\(\(p\) => p\.status !== "published" && !estArchivee\(p\.status\)\) && \(\s*<p[^>]*>\{t\(lang, "status\.review\.hint"\)\}/);
});

test("P7 — les libellés neufs existent dans les quatre langues", () => {
  const src = readFileSync("lib/i18n.ts", "utf8");
  const cles = ["sell.new.title", "sell.new.hint", "sell.new.physical", "sell.new.physical.hint", "sell.new.file", "sell.new.file.hint",
    "sell.new.service", "sell.new.service.hint", "sell.new.studio", "sell.filter.aria", "sell.filter.all", "sell.filter.physical",
    "sell.filter.service", "sell.filter.file", "sell.filter.empty", "sell.filter.empty.cta", "sell.filter.archived",
    "sell.archived.hint", "sell.form.file", "sell.form.service", "sell.form.change", "status.archived", "nav.help"];
  for (const cle of cles) assert.equal(src.split(`"${cle}":`).length - 1, 4, cle);
  assert.equal(src.split('"publish.kind.aria":').length - 1, 0, "clé morte avec le sélecteur de type");
});
