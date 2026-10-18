import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DICT, LANGS } from "../lib/i18n";

/**
 * LE TABLEAU VENDEUR FAÇON CHARIOW (docs/73). Ce qui est gardé : le menu ne
 * mène qu'à des pages qui existent ; les pages filles ont la même garde et ne
 * s'indexent pas ; l'accueil ne parle plus français en dur ; l'alerte « À
 * traiter » compte ce qui attend vraiment le vendeur et se tait si elle ne
 * sait pas ; la performance numérique ne s'adresse qu'à qui vend du numérique ;
 * aucun lien ne pointe vers une ancre disparue.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const ACCUEIL = lire("app/tableau-de-bord/page.tsx");
const MENU = lire("components/vendeur-shell.tsx");
const FILLES = {
  boutique: "app/tableau-de-bord/boutique/page.tsx",
  compte: "app/tableau-de-bord/compte/page.tsx",
  "codes-promo": "app/tableau-de-bord/codes-promo/page.tsx",
} as const;

test("C1 — chaque entrée du menu mène à une page qui existe (et l'ancre aussi)", () => {
  const liens = [...MENU.matchAll(/href: "([^"]+)"/g)].map((m) => m[1]);
  assert.ok(liens.length >= 10, `entrées lues : ${liens.length}`);
  for (const lien of liens) {
    const [chemin, ancre] = lien.split("#");
    const page = `app${chemin}/page.tsx`;
    assert.ok(lire(page).includes("export default"), `${lien} : ${page} absente`);
    if (ancre) assert.ok(lire(page).includes(`id="${ancre}"`), `${lien} : ancre #${ancre} absente de ${page}`);
  }
});

test("C2 — les pages filles : même garde, pas d'indexation, rubrique active", () => {
  for (const [nom, f] of Object.entries(FILLES)) {
    const src = lire(f);
    assert.match(src, new RegExp(`await vendeurOuRedirection\\("/tableau-de-bord/${nom}"\\)`), `${f} : garde absente ou chemin faux`);
    assert.match(src, /robots: \{ index: false, follow: false \}/, `${f} : indexable`);
    assert.match(src, /export const dynamic = "force-dynamic";/, f);
    assert.match(src, new RegExp(`<VendeurShell lang=\\{lang\\} actif="${nom === "codes-promo" ? "promo" : nom}">`), `${f} : rubrique active`);
  }
  const garde = lire("lib/vendeur-acces.ts");
  // Un compte suspendu est renvoyé vers l'accueil, qui seul en donne le motif.
  assert.match(garde, /if \(await getSuspension\(user\.id\)\) redirect\("\/tableau-de-bord"\);/);
  assert.match(garde, /if \(!user\) redirect\(`\/connexion\?next=\$\{encodeURIComponent\(chemin\)\}`\);/);
});

test("C3 — l'accueil ne parle plus français en dur : salutation à l'heure d'Haïti, quatre langues", () => {
  assert.doesNotMatch(ACCUEIL, /`Bonjour, \$\{/, "« Bonjour, » restait en français dans les quatre langues");
  assert.doesNotMatch(ACCUEIL, /Connecte-toi|connecte Supabase/, "le tutoiement et la phrase technique sont partis");
  assert.match(ACCUEIL, /t\(lang, `vendeur\.salut\.\$\{momentDeLaJournee\(new Date\(\)\)\}` as I18nKey\)/);
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    for (const m of ["matin", "apresMidi", "soir"]) assert.ok(d[`vendeur.salut.${m}`]?.includes("{nom}"), `${lang} vendeur.salut.${m}`);
    for (const [cle, motif] of [
      ["vendeur.atraiter.n", "{n}"],
      ["vendeur.retrait.intro", "{montant}"],
      ["vendeur.suspendu.texte", "{date}"],
      ["vendeur.suspendu.motif", "{motif}"],
      ["vendeur.donnees.texte", "{lien}"],
      ["vendeur.promo.texte", "{code}"],
    ] as const) {
      assert.ok(d[cle]?.includes(motif), `${lang} ${cle} sans ${motif}`);
    }
  }
  assert.match((DICT.ht as Record<string, string>)["vendeur.salut.apresMidi"], /^Bonswa/, "en Haïti, on dit « bonswa » dès midi");
});

test("C4 — « À traiter » compte les remises en attente du vendeur, et se tait s'il ne sait pas", () => {
  assert.match(
    ACCUEIL,
    /\.from\("zabelie_fulfillment"\)\s*\.select\("order_id, order:orders!inner\(products!orders_product_id_fkey!inner\(seller_id\)\)", \{ count: "exact", head: true \}\)\s*\.eq\("status", "awaiting_shipment"\)\s*\.eq\("order\.products\.seller_id", user\.id\);/,
    "le compte doit porter sur les remises EN ATTENTE des produits de CE vendeur",
  );
  assert.match(ACCUEIL, /aTraiter = errATraiter \? null : \(nbATraiter \?\? 0\);/, "une lecture ratée ne devient pas « rien à faire »");
  assert.match(ACCUEIL, /\{aTraiter !== null && aTraiter > 0 && \(/);
});

test("C5 — la performance numérique ne s'adresse qu'à qui vend du numérique", () => {
  assert.match(ACCUEIL, /const vendNumerique = products\.some\(\(p\) => \(DIGITAL_KINDS as readonly string\[\]\)\.includes\(p\.kind\)\);/);
  assert.match(ACCUEIL, /\{vendNumerique && <DigitalSellerMetrics /);
  assert.equal((ACCUEIL.match(/<DigitalSellerMetrics /g) ?? []).length, 1, "un seul montage, gardé");
});

test("C6 — les montants se masquent sans perdre leur place ni leur accent", () => {
  // Chaque valeur d'argent a son double « ••••• », affiché seulement zone masquée.
  const valeurs = ACCUEIL.match(/group-data-\[masque\]\/montants:hidden">\s*\{(metriquePrincipale\.value|m\.value)\}/g) ?? [];
  assert.equal(valeurs.length, 2, "la principale et les secondaires");
  assert.equal((ACCUEIL.match(/hidden [^"]*group-data-\[masque\]\/montants:block">\s*<span aria-hidden="true">•••••<\/span>/g) ?? []).length, 2);
  assert.match(ACCUEIL, /<MontantsMasquables titre=\{t\(lang, "vendeur\.argent"\)\}/);
});

test("C7 — l'action « code promo » n'existe qu'avec un produit, et la page le dit sans produit", () => {
  assert.match(ACCUEIL, /\.\.\.\(products\.length > 0\s*\? \[\{ cle: "promo", href: "\/tableau-de-bord\/codes-promo"/);
  const promo = lire(FILLES["codes-promo"]);
  assert.match(promo, /\{nbProduits \? \(/);
  assert.match(promo, /t\(lang, "vendeur\.promo\.sansProduit"\)/);
});

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.(ts|tsx)$/.test(nom) ? [chemin] : [];
  });
}

test("C8 — aucun lien ne vise une ancre partie avec son bloc", () => {
  const anciennes = /\/tableau-de-bord#(ma-boutique|profil-public|codes-promo)\b/;
  const fautes = ["app", "components", "lib"].flatMap(fichiers).filter((f) => anciennes.test(lire(f)));
  assert.deepEqual(fautes, [], "liens vers une ancre déplacée : viser /tableau-de-bord/boutique, /compte ou /codes-promo");
  assert.match(lire("components/site-nav.tsx"), /href="\/tableau-de-bord\/boutique"/);
  assert.match(lire("app/tableau-de-bord/api/page.tsx"), /href="\/tableau-de-bord\/compte#verification"/);
  assert.match(lire(FILLES.compte), /<section id="verification"/);
});
