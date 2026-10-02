import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LES CIBLES TACTILES — 44 px, et le garde porte sur ce qui COMMANDE la taille.
 *
 * ⚠️ MESURÉ, PAS SUPPOSÉ, le 2026-08-22 sur demande du porteur (« optimise la
 * vue mobile »). `scripts/zabelie-audit-mobile.mjs` a parcouru neuf écrans à
 * 360 et 320 px dans un vrai Chromium, et rendu, AVANT correction :
 *
 *   /            12 cibles < 44 px       /catalogue    10
 *   /vendre      12                      /connexion     4
 *   /produit      4                      /aide          2
 *
 * La barre du haut à elle seule en portait huit, donc sur TOUTES les pages :
 * bascule de thème 29×44, quatre boutons de langue 39×44 côte à côte, logo
 * 87×32, champ et bouton de recherche 42 px de haut. Le dépôt avait la bonne
 * convention — `min-h-11` — et l'appliquait à la HAUTEUR seulement.
 *
 * ─── POURQUOI CE TEST EST STATIQUE, ET POURQUOI C'EST LÉGITIME ──────────────
 * La mesure réelle exige un navigateur et un serveur : elle vit dans le script,
 * pas dans `npm test`. Ce qui est vérifiable ici est ce qui PRODUIT la taille —
 * la classe Tailwind. `min-h-11` dans le `className` n'est pas le libellé d'un
 * bouton ni un message : c'est la déclaration qui commande les 44 px. Retirer
 * la classe fait rougir ; renommer le bouton, non.
 *
 * ⚠️ CE QU'IL NE PROUVE PAS, et il faut le dire : qu'un parent n'écrase pas la
 * hauteur, qu'un `absolute` ne recouvre pas la zone, qu'un nouvel écran ne
 * réintroduit pas de petites cibles ailleurs. Seul le script le voit. Les deux
 * sont nécessaires — c'est la même paire que « croisement d'appelants » et
 * « preuve d'exécution » ailleurs dans ce dépôt.
 */

const T = 'min-h-11';

/** Chaque entrée : fichier → fragments qui doivent porter la classe. */
const CONTROLES: Array<[string, string[]]> = [
  // La barre du haut, présente sur chaque page — c'est elle qui portait huit
  // des douze défauts de l'accueil.
  ["components/theme-toggle.tsx", ["min-w-11"]],
  ["components/lang-toggle.tsx", ["min-w-11"]],
  // À 320 px le nom est masqué (marketplace-header.css) : le lien se réduisait
  // au monogramme, 32 × 44 px — mesuré le 2026-09-29. D'où la largeur aussi.
  ["components/brand-logo.tsx", [T, "min-w-11"]],
  ["components/search-box.tsx", [T]],
  ["components/site-nav.tsx", ["min-w-11"]],
  // L'écran de connexion : onglets et sortie de secours.
  ["components/connexion-form.tsx", [T]],
  // Les surfaces d'achat.
  ["components/share-buttons.tsx", [T]],
  ["components/buy-button.tsx", [T]],
  ["app/catalogue/page.tsx", [T]],
];

for (const [fichier, fragments] of CONTROLES) {
  test(`cibles tactiles — ${fichier} déclare la taille minimale`, () => {
    const src = readFileSync(fichier, "utf8");
    for (const f of fragments) {
      assert.ok(
        src.includes(f),
        `${fichier} : « ${f} » a disparu. Une cible sous 44 px redevient ` +
          "difficile à atteindre sur le parc visé (Android d'entrée de gamme). " +
          "Re-mesurer avec `node scripts/zabelie-audit-mobile.mjs` avant de " +
          "conclure que ce garde est périmé."
      );
    }
  });
}

test("l'en-tête n'est collant qu'à partir de md — il fait 250 px sur mobile", () => {
  /* ⚠️ LA CONDITION, PAS LE SYMPTÔME. Mesuré : 250 px de haut à 360 px de
   * large, `position: sticky` — soit 34 % d'un écran de 740 px occupés en
   * permanence, et davantage sur les téléphones plus courts. Sur la fiche
   * produit, le TITRE passait sous la ligne de flottaison.
   *
   * Ce que ce garde tient : que `sticky` reste conditionné à `md`. Un `sticky`
   * nu qui reviendrait rendrait l'en-tête collant sur mobile de nouveau, et
   * rien à l'écran ne le dirait — c'est exactement le genre de régression
   * qu'une relecture ne voit pas.
   *
   * ⚠️ Arbitrage assumé, pas amélioration gratuite : la recherche n'est plus
   * atteignable en permanence sur mobile. Il se défait en un mot. */
  /* RETOURNÉ le 2026-09-04 (accueil premium, Phase 2), et c'est une mesure
   * qui le retourne : l'en-tête ne fait plus 250 px mais une ligne et une
   * rangée de chips (~100 px), et il se REPLIE au défilement (HeaderShell,
   * `data-compact`) jusqu'à la seule barre de recherche. Collant partout, il
   * rend à mobile la recherche permanente que l'arbitrage du 2026-08-22 avait
   * dû sacrifier. Ce qu'on vérifie désormais : collant à toutes les largeurs,
   * ET le mécanisme de pli présent — un `sticky` sans pli remettrait un
   * en-tête entier au-dessus de chaque écran. */
  const src = readFileSync("components/site-nav.tsx", "utf8");
  assert.match(
    src,
    /<HeaderShell className="[^"]*\bsticky top-0\b[^"]*">/,
    "l'en-tête doit être collant (sticky top-0) via HeaderShell"
  );
  assert.doesNotMatch(src, /\bmd:sticky\b/, "`md:sticky` est revenu : la recherche disparaît au défilement sur mobile");
  const shell = readFileSync("components/header-shell.tsx", "utf8");
  assert.match(shell, /el\.toggleAttribute\("data-compact", compact\)/, "le pli doit poser data-compact");
  assert.match(src, /className="header-fold[^"]*"/, "le logo doit porter header-fold pour se plier");
  assert.match(readFileSync("components/category-chips.tsx", "utf8"), /className="header-fold/, "les chips doivent porter header-fold");
  assert.match(readFileSync("app/globals.css", "utf8"), /header\[data-compact\] \.header-fold \{\s*display: none;/, "la règle CSS du pli manque");
});

/** Les classes de chaque ouverture `<balise …className="…">` du fragment, en ordre. */
function classesDe(fragment: string, balise: string): string[][] {
  return [...fragment.matchAll(new RegExp(`<${balise}\\b[^>]*?className="([^"]*)"`, "g"))].map((m) => m[1].split(/\s+/));
}

test("fil d'Ariane — chaque lien porte ses 44 px, compensés pour ne pas déplacer la page", () => {
  /* MESURÉ sur zabelie.com le 2026-09-29, 390 px : « Accueil » du fil
   * d'Ariane du catalogue faisait 49 × 20 px. Le même motif vit sur cinq
   * pages. `min-h-11` donne la cible ; `-my-3` rend les 24 px ajoutés, pour que
   * la ligne garde sa hauteur de texte et que le titre ne descende pas. Les
   * deux ensemble, sur CHAQUE lien : l'un sans l'autre est soit une petite
   * cible, soit une page qui bouge. */
  const pages = ["app/catalogue/page.tsx", "app/categories/page.tsx", "app/recharges/page.tsx", "app/guides/[lang]/page.tsx", "app/guides/[lang]/[slug]/page.tsx"];
  let liens = 0;
  for (const fichier of pages) {
    const src = readFileSync(fichier, "utf8");
    const nav = src.match(/<nav aria-label=\{t\(lang, "nav\.breadcrumb"\)\}[\s\S]*?<\/nav>/);
    assert.ok(nav, `${fichier} : le fil d'Ariane est introuvable`);
    const classes = classesDe(nav[0], "Link");
    assert.ok(classes.length > 0, `${fichier} : aucun lien lu dans le fil d'Ariane`);
    for (const c of classes) {
      assert.ok(c.includes(T) && c.includes("-my-3") && c.includes("inline-flex"), `${fichier} : lien du fil d'Ariane « ${c.join(" ")} » — il faut inline-flex, ${T} et -my-3`);
      liens++;
    }
  }
  assert.equal(liens, 7, "sept liens de fil d'Ariane attendus sur les cinq pages");
});

test("filtre de zone du catalogue — trois listes et le bouton à 44 px, listes en 16 px", () => {
  /* MESURÉ le 2026-09-29, 390 px : liste Département 125 × 37 px, bouton
   * « Filtrer » 74 × 38 px — à côté du tri et du bouton voisins, déjà en
   * `min-h-11`. Les listes passent aussi en `text-base` : sous 16 px, Safari
   * sur iPhone zoome la page à l'ouverture d'une liste — le tri voisin était
   * déjà en 16 px. */
  const src = readFileSync("app/catalogue/page.tsx", "utf8");
  const form = src.match(/<form\b[^>]*>(?:(?!<\/form>)[\s\S])*?name="zd"[\s\S]*?<\/form>/);
  assert.ok(form, "le formulaire du filtre de zone est introuvable");
  const listes = [...form[0].matchAll(/<select\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  assert.equal(listes.length, 3, "département, commune, quartier : trois listes");
  for (const c of listes) {
    assert.ok(c.includes(T), `liste de zone sans ${T} : « ${c.join(" ")} »`);
    assert.ok(c.includes("text-base") && !c.includes("text-sm"), `liste de zone sous 16 px : « ${c.join(" ")} »`);
  }
  const boutons = [...form[0].matchAll(/<button\b[\s\S]*?className="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  assert.equal(boutons.length, 1, "un seul bouton dans le filtre de zone");
  assert.ok(boutons[0].includes(T), `bouton « Filtrer » sans ${T} : « ${boutons[0].join(" ")} »`);
});
