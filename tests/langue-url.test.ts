import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANG_COOKIE } from "../lib/i18n";
import { cheminLocalise, cheminPourLangue, estCheminLocalisable, langueDeLUrl, metaLangue } from "../lib/langue-url";

/**
 * LA LANGUE DANS L'URL (`/ht/…`, `/fr/…` — docs/47 §3). Ce qui doit rester
 * vrai pour qu'une page kreyòl existe aux yeux d'un moteur de recherche.
 */

test("LU1 — /ht/ et /fr/ seulement, et seulement sur les pages publiques de la liste", () => {
  assert.deepEqual(langueDeLUrl("/ht/produit/kasav"), { lang: "ht", base: "/produit/kasav" });
  assert.deepEqual(langueDeLUrl("/fr"), { lang: "fr", base: "/" });
  assert.deepEqual(langueDeLUrl("/fr/"), { lang: "fr", base: "/" });
  assert.deepEqual(langueDeLUrl("/ht/catalogue/"), { lang: "ht", base: "/catalogue" });
  for (const chemin of [
    "/en/catalogue", "/es/produit/x", // en et es restent en cookie
    "/ht/tableau-de-bord", "/fr/mes-achats", "/ht/api/checkout", "/fr/panier", // privé ou API
    "/ht/produit/x/y", "/htx/catalogue", "/ht-catalogue", "/catalogue", // formes voisines
    "/ht/aide", // éditorial : a déjà ses propres routes (app/[lang]/aide)
  ]) {
    assert.equal(langueDeLUrl(chemin), null, chemin);
  }
  assert.equal(estCheminLocalisable("/boutik/atelye-lakay"), true);
  assert.equal(estCheminLocalisable("/createur/0000"), false, "l'adresse non canonique d'un vendeur n'a pas de version par langue");
});

test("LU2 — canonique et hreflang selon la langue SERVIE ; en et es hors de l'index", () => {
  const ht = metaLangue("/produit/kasav", "ht");
  assert.equal(ht.alternates.canonical, "/ht/produit/kasav");
  assert.deepEqual(ht.alternates.languages, { ht: "/ht/produit/kasav", fr: "/fr/produit/kasav", "x-default": "/fr/produit/kasav" });
  assert.equal(ht.robots, undefined);
  assert.equal(metaLangue("/", "fr").alternates.canonical, "/fr");
  for (const lang of ["en", "es"] as const) {
    const m = metaLangue("/catalogue", lang);
    assert.deepEqual(m.robots, { index: false, follow: true }, lang);
    assert.equal(m.alternates.canonical, "/fr/catalogue", `${lang} renvoie à la langue par défaut`);
  }
  assert.equal(cheminLocalise("/catalogue?cat=Mode&sous=sak", "ht"), "/ht/catalogue?cat=Mode&sous=sak");
});

test("LU3 — le sélecteur change de préfixe, ou le retire pour en et es", () => {
  assert.equal(cheminPourLangue("/ht/produit/kasav", "fr"), "/fr/produit/kasav");
  assert.equal(cheminPourLangue("/fr", "ht"), "/ht");
  assert.equal(cheminPourLangue("/ht/catalogue", "en"), "/catalogue");
  assert.equal(cheminPourLangue("/catalogue", "ht"), null, "hors adresse localisée : le cookie suffit");
  const toggle = readFileSync("components/lang-toggle.tsx", "utf8");
  assert.match(toggle, /\?\? cheminPourLangue\(pathname, lang\);/);
});

test("LU4 — le proxy réécrit, porte la langue, garde la session et la CSP de la page servie", () => {
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.match(proxy, /const localise = langueDeLUrl\(request\.nextUrl\.pathname\);/);
  assert.match(proxy, /cheminPublicitaire\(localise\?\.base \?\? request\.nextUrl\.pathname\)/, "les pixels d'une fiche /ht/produit restent permis");
  assert.match(proxy, /const guideLang = localise\?\.lang \?\? /);
  assert.match(proxy, /updateSession\(request, localise \? new URL\(localise\.base \+ request\.nextUrl\.search, request\.url\) : undefined\)/);
  assert.ok(proxy.indexOf("const localise = langueDeLUrl") < proxy.lastIndexOf("contentSecurityPolicy(nonce, process.env.NODE_ENV"), "la langue est lue avant la CSP");
  const session = readFileSync("lib/supabase/middleware.ts", "utf8");
  assert.match(session, /reecriture \? NextResponse\.rewrite\(reecriture, \{ request \}\) : NextResponse\.next\(\{ request \}\)/);
  // Les DEUX réponses — initiale et après rafraîchissement des jetons — réécrivent.
  assert.equal((session.match(/response = suite\(\);/g) ?? []).length, 2, "le rafraîchissement de session réécrit aussi");
  // Constante recopiée pour garder le dictionnaire hors du bundle Edge.
  assert.equal(/const LANG_COOKIE_NOM = "([^"]+)"/.exec(proxy)?.[1], LANG_COOKIE);
  assert.match(proxy, /if \(localise && request\.cookies\.get\(LANG_COOKIE_NOM\)\?\.value !== localise\.lang\) \{\s*response\.cookies\.set\(LANG_COOKIE_NOM, localise\.lang,/);
});

test("LU5 — chaque page localisable déclare SA canonique par metaLangue, et le sitemap annonce les deux langues", () => {
  const pages: [string, string][] = [
    ["app/page.tsx", 'metaLangue("/", await getLang())'],
    ["app/vendre/page.tsx", 'metaLangue("/vendre", await getLang())'],
    ["app/vendre/physique/page.tsx", 'metaLangue("/vendre/physique", await getLang())'],
    ["app/produits-interdits/page.tsx", 'metaLangue("/produits-interdits", await getLang())'],
    ["app/developpeurs/page.tsx", 'metaLangue("/developpeurs", await getLang())'],
    ["app/conditions/page.tsx", 'metaLangue("/conditions", await getLang())'],
    ["app/confidentialite/page.tsx", 'metaLangue("/confidentialite", await getLang())'],
    ["app/categories/page.tsx", 'metaLangue("/categories", lang)'],
    ["app/catalogue/page.tsx", "metaLangue(catalogueCanonical(raw), lang)"],
    ["app/produit/[slug]/page.tsx", "metaLangue(`/produit/${product.slug}`, lang)"],
    ["app/boutik/[slug]/page.tsx", "metaLangue(`/boutik/${slug}`, await getLang())"],
  ];
  for (const [fichier, appel] of pages) {
    // Une page qui annonce /ht/<base> sans que le proxy la serve publierait
    // un hreflang vers un 404. La base annoncée doit être dans la liste.
    const base = /metaLangue\("([^"]+)"/.exec(appel)?.[1] ?? /metaLangue\(`([^$`]+)\$\{/.exec(appel)?.[1]?.concat("x") ?? "/catalogue";
    assert.ok(estCheminLocalisable(base), `${fichier} annonce ${base}, que le proxy ne sert pas sous /ht/`);
    const src = readFileSync(fichier, "utf8");
    assert.ok(src.includes(appel), `${fichier} : ${appel}`);
    assert.doesNotMatch(src, /alternates: \{ canonical: "\//, `${fichier} garde une canonique sans langue`);
  }
  const sitemap = readFileSync("app/sitemap.ts", "utf8");
  assert.match(sitemap, /return LANGS_INDEXEES\.map\(\(lang\) => \(\{ url: `\$\{base\}\$\{cheminLocalise\(chemin, lang\)\}`/);
  for (const appel of ["declinaisons(path,", "declinaisons(`/produit/${p.slug}`", "declinaisons(hrefBoutique(c),", "declinaisons(r.href,"]) {
    assert.ok(sitemap.includes(appel), appel);
  }
  // Chaque route statique du sitemap a bien une adresse par langue.
  const statiques = /const staticRoutes[^[]*\[([\s\S]*?)\]\.filter/.exec(sitemap)![1].match(/"([^"]+)"/g)!.map((s) => s.slice(1, -1));
  for (const r of statiques) assert.ok(estCheminLocalisable(r.split("?")[0]), r);
});
