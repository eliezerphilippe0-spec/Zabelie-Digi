import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  construireMenu,
  getLibellesRayons,
  libelleRayon,
  libellesParValeur,
  pucesRayons,
} from "../lib/taxonomy";
import { catalogueHref } from "../lib/catalogue-query";
import { DICT } from "../lib/i18n";

/**
 * AUDIT M6 (2026-10-27) — LES RAYONS S'AFFICHENT DANS LA LANGUE DU VISITEUR,
 * ET LE FILTRE NE BOUGE PAS.
 *
 * `products.category` porte le label_fr du département : c'est la clé de
 * jointure du catalogue (`?cat=<label_fr>`). La barre de rayons du catalogue,
 * les liens d'exploration de l'accueil et la pastille de la fiche affichaient
 * cette valeur brute : un acheteur kreyòl filtrait en français sous un
 * en-tête traduit, et « Tout » restait « Tout » en anglais.
 *
 * Deux moitiés, et le test les tient ENSEMBLE parce que c'est leur séparation
 * qui compte :
 *   • le TEXTE suit la langue, depuis la source de l'en-tête (`getMenuRayons`
 *     → `construireMenu` → `labelFor`), sans seconde table de traduction ;
 *   • la VALEUR et l'URL restent le label_fr — liens partagés, SEO, jointure.
 * Traduire la valeur rendrait le filtre muet (zéro résultat, aucune erreur) ;
 * garder le texte brut laisse le défaut. Seule la paire est correcte.
 */

type Cat = Parameters<typeof construireMenu>[0][number];

const cat = (o: Partial<Cat> & { id: string; slug: string; label_fr: string }): Cat =>
  ({
    label_kr: "",
    label_en: "",
    label_es: null,
    level: 1,
    parent_id: null,
    active: true,
    position: 0,
    ...o,
  }) as Cat;

/* Libellés de `docs/16`. « Santé » porte son accent EN FIN de mot, et
 * « Machandè » aussi : les deux positions qui trompent un instrument
 * (CLAUDE.md, `\b` ne connaît pas le kreyòl). Ils passent ici par l'URL
 * (encodage %C3%A9 / %C3%A8 en bout de valeur) et par l'égalité stricte. */
const CATS: Cat[] = [
  cat({ id: "d1", slug: "otomobil-moto", label_fr: "Auto & Moto", label_kr: "Otomobil & Moto", label_en: "Automotive", label_es: "Autos y motos", position: 10 }),
  cat({ id: "d2", slug: "elektwonik", label_fr: "Électronique", label_kr: "Elektwonik", label_en: "Electronics", position: 20 }),
  cat({ id: "d3", slug: "bote-swen", label_fr: "Beauté & soins", label_kr: "Bote & Swen", label_en: "Beauty & care", position: 30 }),
  cat({ id: "d4", slug: "sante", label_fr: "Santé", label_kr: "Machandè", label_en: "Health", position: 40 }),
  // Un sous-rayon : son lien porte `cat=<département>&sous=…`, il ne doit
  // pas devenir une entrée de la table (products.category est un département).
  cat({ id: "s1", slug: "luil-likid", label_fr: "Huiles & liquides", label_kr: "Luil & likid", level: 2, parent_id: "d1", position: 10 }),
];

const valeurCat = (href: string) => new URL(href, "https://zabelie.com").searchParams.get("cat");

// ── Le comportement, sans base ──────────────────────────────────────────────

test("M6 — un rayon kreyòl s'affiche TRADUIT et son lien garde la valeur label_fr", () => {
  const libelles = libellesParValeur(construireMenu(CATS, new Map(), "ht"));
  const puces = pucesRayons(["Auto & Moto", "Santé"], libelles, "ht");

  const auto = puces.find((p) => p.valeur === "Auto & Moto");
  assert.ok(auto, "la puce « Auto & Moto » a disparu");
  assert.equal(auto.libelle, "Otomobil & Moto", "le texte doit être le libellé kreyòl de la base");

  // Le lien : EXACTEMENT celui d'avant le correctif (valeur inchangée), donc
  // les liens partagés et l'URL indexée restent valides.
  const href = catalogueHref({}, { cat: auto.valeur, sous: null, page: 1 });
  assert.equal(href, "/catalogue?cat=Auto+%26+Moto");
  assert.equal(valeurCat(href), "Auto & Moto", "le filtre doit rester le label_fr");
  assert.ok(!href.includes("Otomobil"), `le libellé traduit a fui dans l'URL : ${href}`);

  // Accent final, des deux côtés : valeur « Santé », libellé « Machandè ».
  const sante = puces.find((p) => p.valeur === "Santé");
  assert.equal(sante?.libelle, "Machandè");
  assert.equal(valeurCat(catalogueHref({}, { cat: "Santé" })), "Santé");
});

test("M6 — la table est indexée par la valeur EXACTE du lien de l'en-tête", () => {
  /* La clé n'est pas recopiée : c'est le `cat` du lien que construit le menu.
   * L'en-tête et le catalogue filtrent donc sur la même valeur, par
   * construction — si le lien du menu change, ce test le dit. */
  const menu = construireMenu(CATS, new Map(), "en");
  const libelles = libellesParValeur(menu);
  for (const r of menu) {
    assert.equal(libelles.get(valeurCat(r.href) ?? ""), r.label, `rayon ${r.slug}`);
  }
  assert.deepEqual(
    [...libelles.keys()],
    ["Auto & Moto", "Électronique", "Beauté & soins", "Santé"],
    "seuls les départements entrent dans la table — un sous-rayon partage le `cat` de son parent"
  );
  assert.equal(libelles.get("Auto & Moto"), "Automotive");
});

test("M6 — repli : valeur inconnue → la valeur brute, jamais une chaîne vide", () => {
  const libelles = libellesParValeur(construireMenu(CATS, new Map(), "ht"));
  // Libellé orphelin d'avant l'unification (`lib/product-categories.ts`).
  assert.equal(libelleRayon("Marketing", libelles), "Marketing");
  // Base injoignable ou démo : table vide, le texte reste lisible.
  assert.equal(libelleRayon("Auto & Moto", new Map()), "Auto & Moto");
  // Un libellé vide dans la table ne doit pas effacer le rayon.
  assert.equal(libelleRayon("Auto & Moto", new Map([["Auto & Moto", ""]])), "Auto & Moto");
  // Sans libellé kreyòl en base, `labelFor` replie sur le français.
  const sansKr = CATS.map((c) => (c.id === "d2" ? { ...c, label_kr: "" } : c));
  assert.equal(libelleRayon("Électronique", libellesParValeur(construireMenu(sansKr, new Map(), "ht"))), "Électronique");
});

test("M6 — la barre se trie sur le libellé AFFICHÉ, pas sur le label_fr", () => {
  /* Trié en français puis affiché en kreyòl : « Otomobil » avant « Bote ».
   * Une barre visiblement en désordre se lit mal sur un téléphone. */
  const libelles = libellesParValeur(construireMenu(CATS, new Map(), "ht"));
  const puces = pucesRayons(["Auto & Moto", "Beauté & soins", "Électronique"], libelles, "ht");
  assert.deepEqual(puces.map((p) => p.libelle), ["Bote & Swen", "Elektwonik", "Otomobil & Moto"]);
  assert.deepEqual(puces.map((p) => p.valeur), ["Beauté & soins", "Électronique", "Auto & Moto"]);
});

test("M6 — sans base (démo, CI), les libellés se dégradent en table vide, sans rejet", async () => {
  /* Le catalogue lance cette promesse tôt et l'attend plus loin : un rejet
   * entre-temps serait une promesse orpheline. Hors Supabase, le menu est
   * vide, donc la table aussi — et les valeurs brutes s'affichent. */
  const avant = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, cle: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    const libelles = await getLibellesRayons("ht");
    assert.equal(libelles.size, 0);
  } finally {
    if (avant.url !== undefined) process.env.NEXT_PUBLIC_SUPABASE_URL = avant.url;
    if (avant.cle !== undefined) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = avant.cle;
  }
});

test("M6 — une lecture du menu qui LÈVE se dégrade aussi en table vide", async () => {
  /* Le chemin d'échec réel, pas un simulacre : base « configurée », mais hors
   * requête Next, `cookies()` lève dans `createClient()`. Sans le `try` de
   * `getLibellesRayons`, la promesse lancée tôt par le catalogue rejetterait. */
  const avant = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, cle: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://exemple.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "cle-de-test";
  const erreur = console.error;
  const journal: string[] = [];
  console.error = (...a: unknown[]) => void journal.push(a.map(String).join(" "));
  try {
    const libelles = await getLibellesRayons("ht");
    assert.equal(libelles.size, 0);
    // L'absence de signal doit être un signal : l'échec est journalisé.
    assert.ok(journal.some((l) => l.includes("[taxonomie] libellés des rayons indisponibles")), journal.join("\n"));
  } finally {
    console.error = erreur;
    if (avant.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = avant.url;
    if (avant.cle === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = avant.cle;
  }
});

test("M6 — « Tout » est une clé i18n, et son lien reste /catalogue", () => {
  const vues = (["fr", "ht", "en", "es"] as const).map((l) => (DICT[l] as Record<string, string>)["catalog.cat.all"]);
  for (const v of vues) assert.ok(typeof v === "string" && v.trim(), "catalog.cat.all vide dans une langue");
  // Le défaut d'origine : « Tout » en dur, y compris pour un acheteur anglais.
  assert.notEqual(DICT.en["catalog.cat.all"], "Tout");
  assert.notEqual(DICT.es["catalog.cat.all"], "Tout");
  // La VALEUR « Tout » est une sentinelle que l'URL omet : inchangé.
  assert.equal(catalogueHref({ cat: "Électronique" }, { cat: "Tout", sous: null, page: 1 }), "/catalogue");
});

// ── Ce qui COMMANDE dans les pages ──────────────────────────────────────────

const sansCommentaires = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CATALOGUE = sansCommentaires(readFileSync("app/catalogue/page.tsx", "utf8"));

/** Le lien rendu par `PUCES.map(...)`, jusqu'à sa fermeture. */
function barreRayons(): string {
  const m = CATALOGUE.match(/\{PUCES\.map\(\(\{ valeur, libelle \}\) => \([\s\S]*?<\/Link>/);
  assert.ok(m, "la barre des rayons (PUCES.map) est introuvable");
  return m[0];
}

test("catalogue — les puces viennent de la source de l'en-tête, « Tout » en tête", () => {
  /* La LIAISON, extrémité par extrémité : la table vient de
   * `getLibellesRayons(lang)` (le menu de l'en-tête), elle est attendue, puis
   * elle alimente `pucesRayons`. Changer la source — une `new Map()`, une
   * autre table — doit rougir, pas seulement supprimer l'appel. */
  assert.match(CATALOGUE, /const libellesRayons = getLibellesRayons\(lang\);/);
  assert.match(CATALOGUE, /const libelles = await libellesRayons;/);
  assert.match(
    CATALOGUE,
    /const PUCES = \[\s*\{ valeur: "Tout", libelle: t\(lang, "catalog\.cat\.all"\) \},\s*\.\.\.pucesRayons\(categories, libelles, lang\),\s*\];/,
    "« Tout » doit venir de la clé i18n et passer en tête, les rayons de pucesRayons(…, libelles, …)"
  );
  assert.doesNotMatch(CATALOGUE, /\["Tout", \.\.\.categories\]/, "l'ancienne barre brute est revenue");
  // Anti-doublon : aucune table de traduction locale à la page.
  assert.doesNotMatch(CATALOGUE, /label_kr|label_en|label_es/);
});

test("catalogue — le LIEN filtre par la valeur, le TEXTE est le libellé, l'état suit la valeur", () => {
  const barre = barreRayons();
  assert.match(barre, /<Link\b[^>]*?\shref=\{catHref\(valeur\)\}/, "le lien doit porter la VALEUR (label_fr), jamais le libellé");
  assert.match(barre, /aria-current=\{valeur === activeCat \? "true" : undefined\}/, "aria-current doit suivre la valeur active");
  assert.match(barre, /\$\{\s*valeur === activeCat\s*\?\s*"border-transparent bg-cloud text-ink"/, "l'état rempli en encre doit suivre la même condition");
  assert.match(barre, />\s*\{libelle\}\s*<\/Link>/, "le texte de la puce doit être le libellé traduit");
  assert.doesNotMatch(barre, />\s*\{valeur\}\s*<\/Link>/, "la valeur brute est de nouveau affichée");
});

test("catalogue — le rayon actif s'affiche traduit hors de la barre aussi", () => {
  assert.match(CATALOGUE, /const libelleActif = activeCat === "Tout" \? t\(lang, "catalog\.cat\.all"\) : libelleRayon\(activeCat, libelles\);/);
  assert.match(CATALOGUE, /\{activeCat !== "Tout" \? ` · \$\{libelleActif\}` : ""\}/, "ligne de résultats");
  assert.doesNotMatch(CATALOGUE, /` · \$\{activeCat\}`/, "la ligne de résultats affiche de nouveau la valeur brute");
  assert.match(CATALOGUE, /libelleRayon\(cat, await getLibellesRayons\(lang\)\)/, "titre de la page");
  // Le champ caché du filtre de zone transporte la VALEUR, pas le libellé.
  assert.match(CATALOGUE, /<input type="hidden" name="cat" value=\{activeCat\} \/>/);
});

test("accueil — le lien garde la valeur stockée, le texte est traduit", () => {
  const src = sansCommentaires(readFileSync("app/page.tsx", "utf8"));
  assert.match(src, /const libellesRayons = await getLibellesRayons\(lang\);/);
  assert.match(
    src,
    /<Link key=\{category\} href=\{`\/catalogue\?cat=\$\{encodeURIComponent\(category\)\}`\}>\{libelleRayon\(category, libellesRayons\)\}/,
    "le lien filtre par la valeur, le texte passe par libelleRayon"
  );
});

test("fiche produit — la pastille du rayon est traduite, la valeur reste en base", () => {
  const src = sansCommentaires(readFileSync("app/produit/[slug]/page.tsx", "utf8"));
  assert.match(src, /const rayonAffiche = libelleRayon\(product\.category, await getLibellesRayons\(lang\)\);/);
  assert.match(src, /\{rayonAffiche && \(\s*<span className="rounded-full border border-line px-3 py-1 text-xs text-mist">\s*\{rayonAffiche\}\s*<\/span>/);
  assert.doesNotMatch(src, />\s*\{product\.category\}\s*</, "la valeur brute est de nouveau affichée");
});
