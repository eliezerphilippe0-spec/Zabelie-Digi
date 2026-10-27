import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { loadRoute } from "./helpers/route-harness";
import { DICT, LANGS, t, type I18nKey, type Lang } from "../lib/i18n";
import type {
  FitmentLabels,
  PhysicalListingLabels,
  PhysicalProductForm as FormType,
  VariantLabels,
} from "../components/physical-product-form";

/**
 * LE FORMULAIRE PRODUIT PHYSIQUE — audit du 2026-10-27 (M3, m1, m7, M10).
 *
 * Constaté au commit acc72c9, rendu à 360 px avec le stub Supabase :
 *   • M3 — au moins quinze libellés en dur (français, et UN en kreyòl) :
 *     « Titre », « Prix (HTG) », « Catégorie », « Choisir… », « Libellé »,
 *     « + Ajouter une variante », « Marque… », « Retirer la variante »… Le
 *     cliquet `i18n-chaines-en-dur` n'en voyait que cinq : il ne lit que les
 *     nœuds de texte ACCENTUÉS. Le champ fichier natif disait « Choose File /
 *     No file chosen » dans la langue du navigateur.
 *   • m1 — la ligne de variante `grid-cols-[1fr_90px_80px_36px]` laissait
 *     56 px au nom ; « Ex. 250 ml / Rouge / M » était coupé ; « retirer »
 *     faisait 36 px.
 *   • m7 — quatre étapes écrites en commentaires JSX, aucune à l'écran.
 *   • M10 — champs 37-38 px, listes 37 px, `summary` de 20 à 40 px.
 *
 * ─── CE QUE CE TEST REND, ET CE QU'IL NE REND PAS ──────────────────────────
 * Le composant est RENDU (`renderToStaticMarkup`, via le harnais du dépôt qui
 * simule `useRouter`) : les gardes portent sur le HTML produit, donc sur ce
 * que le code COMMANDE réellement — pas sur la présence d'un libellé dans le
 * fichier. Les effets ne tournent pas au rendu serveur : les branches
 * ouvertes par un `useEffect` ou un envoi (erreur de chargement, brouillon
 * créé) sont gardées par la structure, et le dit.
 *
 * Ce qu'il ne prouve PAS : une mise en page à 360 px. La classe qui commande
 * la taille est vérifiée ; le pixel, seul un navigateur le mesure
 * (`scripts/zabelie-audit-mobile.mjs`), et ce lot n'en lance pas.
 */

const FORM_SRC = readFileSync("components/physical-product-form.tsx", "utf8");
const PAGE_SRC = readFileSync("app/vendre/physique/page.tsx", "utf8");

// ── Les libellés, champ par champ — la MÊME table que la page ───────────────

type SpecsLabels = Parameters<typeof FormType>[0]["specsLabels"];
type ChampsPlats = Exclude<keyof PhysicalListingLabels, "steps" | "variants" | "fitment">;

const LISTING: Record<ChampsPlats, I18nKey> = {
  description: "sell.physical.description",
  descriptionHint: "sell.physical.description.hint",
  draft: "sell.physical.draft",
  creating: "sell.physical.creating",
  draftNote: "sell.physical.draft.note",
  saved: "sell.physical.saved",
  photoFailed: "sell.physical.photo.failed",
  photoRetry: "sell.physical.photo.retry",
  photoChoose: "sell.physical.photo.choose",
  photoPrepareError: "sell.physical.photo.prepareError",
  manage: "sell.physical.manage",
  error: "publish.error.generic",
  network: "error.network",
  photoAdd: "sell.cover.add",
  photoReplace: "sell.cover.replace",
  photoPreparing: "sell.galerie.preparing",
  photoAlt: "publish.physical.photo.alt",
  photoReduced: "publish.physical.photo.reduced",
  photoLight: "publish.physical.photo.light",
  titleLabel: "publish.physical.titleLabel",
  titlePh: "publish.physical.title.ph",
  price: "publish.price.ph",
  quantity: "publish.physical.quantity",
  category: "publish.category.aria",
  choose: "publish.physical.choose",
  loadError: "publish.physical.loadError",
  reload: "publish.physical.reload",
  required: "publish.physical.required",
  recommended: "publish.physical.recommended",
  optional: "publish.physical.optional",
};
const ETAPES_CLES: Record<keyof PhysicalListingLabels["steps"], I18nKey> = {
  nav: "publish.physical.steps.nav",
  count: "publish.physical.step.count",
  photo: "publish.physical.step.photo",
  basics: "publish.physical.step.basics",
  details: "publish.physical.step.details",
  save: "publish.physical.step.save",
};
const VARIANTES: Record<keyof VariantLabels, I18nKey> = {
  title: "publish.physical.variants.title",
  hint: "publish.physical.variants.hint",
  group: "publish.physical.variant.group",
  name: "publish.physical.variant.name",
  namePh: "publish.physical.variant.name.ph",
  price: "publish.price.ph",
  stock: "publish.physical.variant.stock",
  remove: "publish.physical.variant.remove",
  removeNamed: "publish.physical.variant.removeNamed",
  add: "publish.physical.variant.add",
};
const COMPAT: Record<keyof FitmentLabels, I18nKey> = {
  title: "publish.physical.fitment.title",
  hint: "publish.physical.fitment.hint",
  make: "publish.physical.fitment.make",
  makeAria: "publish.physical.fitment.make.aria",
  model: "publish.physical.fitment.model",
  modelAria: "publish.physical.fitment.model.aria",
  from: "publish.physical.fitment.from",
  until: "publish.physical.fitment.until",
  untilNow: "publish.physical.fitment.untilNow",
  fromAria: "publish.physical.fitment.from.aria",
  untilAria: "publish.physical.fitment.until.aria",
  remove: "publish.physical.fitment.remove",
};
const SPECS: Record<keyof SpecsLabels, I18nKey> = {
  title: "sell.specs.title",
  weight: "sell.specs.weight",
  dims: "sell.specs.dims",
  length: "publish.physical.dims.length",
  width: "publish.physical.dims.width",
  height: "publish.physical.dims.height",
  brand: "sell.specs.brand",
  material: "sell.specs.material",
  condition: "sell.specs.condition",
  conditionNef: "specs.condition.nef",
  conditionDezyem: "specs.condition.dezyem",
};

/** Marqueurs autour de chaque libellé reçu : ce qui reste hors marqueurs est écrit en dur. */
const OUVRE = "⟦";
const FERME = "⟧";

function table<K extends string>(cles: Record<K, I18nKey>, lang: Lang, marque: boolean): Record<K, string> {
  return Object.fromEntries(
    Object.entries(cles).map(([champ, cle]) => {
      const v = t(lang, cle as I18nKey);
      return [champ, marque ? `${OUVRE}${v}${FERME}` : v];
    }),
  ) as Record<K, string>;
}

function libelles(lang: Lang, marque = false) {
  const listing: PhysicalListingLabels = {
    ...table(LISTING, lang, marque),
    steps: table(ETAPES_CLES, lang, marque),
    variants: table(VARIANTES, lang, marque),
    fitment: table(COMPAT, lang, marque),
  };
  return { listing, specs: table(SPECS, lang, marque) as SpecsLabels };
}

// ── Le rendu ────────────────────────────────────────────────────────────────

const lien = ({ href, className, children }: { href: string; className?: string; children?: React.ReactNode }) =>
  React.createElement("a", { href, className }, children);

function charger(revue = false) {
  return loadRoute("components/physical-product-form.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "next/link": { __esModule: true, default: lien },
    "@/components/net-estimate": { NetEstimate: () => null },
    "@/components/ai-description-help": { AiDescriptionHelp: () => null },
    "@/lib/policy": { POLICY_PATH: "/politique-produits" },
    // Poids en chiffres seuls : une unité écrite ici passerait pour du texte en dur.
    "@/lib/image-compress": { compresserImage: async () => { throw new Error("jamais au rendu"); }, poidsLisible: (n: number) => String(n) },
    "@/lib/collections": { UUID_RE: /^[0-9a-f-]{36}$/i },
    "@/lib/product-kind": { KIND_PHYSICAL: "physical" },
    "@/lib/publish-draft": { publishReviewKey: () => "cle" },
    "@/lib/publish-draft-copy": {
      publishDraftCopy: () => ({ physicalUnavailable: "⟦u⟧", uncertain: "⟦u⟧", checkProducts: "⟦c⟧", resume: "⟦r⟧" }),
    },
    "@/lib/use-session-draft": { useSessionDraft: () => [revue, () => {}, () => {}, true, "available"] },
  }) as unknown as Record<string, React.FC<Record<string, unknown>>>;
}

const rendre = (el: React.ReactElement) => renderToStaticMarkup(el);

function formulaire(lang: Lang, marque = false): string {
  const mod = charger();
  const { listing, specs } = libelles(lang, marque);
  const m = (s: string) => (marque ? `${OUVRE}${s}${FERME}` : s);
  return rendre(
    React.createElement(mod.PhysicalProductForm, {
      actorId: "00000000-0000-4000-8000-000000000001",
      listingLabels: listing,
      lang,
      netLabels: { youReceive: "x", fee: "x", rounding: "x", caveat: "x" },
      policyAccept: m(t(lang, "policy.accept")),
      policyRead: m(t(lang, "policy.accept.read")),
      aiLabels: {},
      specsEtendues: true,
      specsLabels: specs,
    }),
  );
}

const MODELES = [{ id: "m1", kind: "auto", make: "Toyota", model: "Corolla" }];

function compatibilite(lang: Lang, marque = false): string {
  const mod = charger();
  return rendre(
    React.createElement(mod.FitmentPicker, {
      models: MODELES,
      fitment: [{ modelId: "m1", yearStart: "2000", yearEnd: "" }],
      onChange: () => {},
      labels: libelles(lang, marque).listing.fitment,
      mention: marque ? `${OUVRE}${t(lang, "publish.physical.recommended")}${FERME}` : t(lang, "publish.physical.recommended"),
    }),
  );
}

function variante(lang: Lang, label: string, marque = false): string {
  const mod = charger();
  return rendre(
    React.createElement(mod.LigneVariante, {
      index: 1,
      variante: { label, priceHTG: "1500", quantity: "2" },
      labels: libelles(lang, marque).listing.variants,
      onChange: () => {},
      onRemove: () => {},
    }),
  );
}

function etatsPhoto(lang: Lang, marque = false): string[] {
  const mod = charger();
  const labels = libelles(lang, marque).listing;
  const fichier = {} as File;
  return [
    { compressing: true, compression: null },
    { compressing: false, compression: { fichier, avant: 2294775, apres: 151552 } },
    { compressing: false, compression: { fichier, avant: 90000, apres: 90000 } },
  ].map((etat) => rendre(React.createElement(mod.EtatPhoto, { ...etat, labels })));
}

// ── L'analyseur de texte en dur, éprouvé AVANT qu'on lui fasse confiance ─────

function decoder(s: string): string {
  return s
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/**
 * Tout ce qu'un utilisateur lit ou entend : nœuds de texte, et les attributs
 * qui s'affichent ou se prononcent. Les libellés reçus (entre marqueurs) et
 * les DONNÉES (modèles, saisies) sont retirés ; ce qui reste ne doit porter
 * aucune lettre, dans aucune langue — `\p{L}`, pas `[a-z]` (`CLAUDE.md` :
 * une classe ASCII ne voit ni `è` ni `ò`).
 */
function horsLibelles(html: string, donnees: string[] = []): { restes: string[]; vus: number } {
  const ATTR = /\s(?:placeholder|aria-label|alt|title|label)="([^"]*)"/g;
  const morceaux = [
    ...[...html.matchAll(ATTR)].map((m) => decoder(m[1])),
    decoder(html.replace(/<[^>]*>/g, " ")),
  ];
  const vus = morceaux.join(" ").split(OUVRE).length - 1;
  const restes: string[] = [];
  for (let m of morceaux) {
    m = m.replace(/⟦[^⟦⟧]*⟧/g, " ");
    for (const d of donnees) m = m.replaceAll(d, " ");
    const r = m.replace(/\s+/g, " ").trim();
    if (/\p{L}/u.test(r)) restes.push(r);
  }
  return { restes, vus };
}

test("analyseur — connu-POSITIF : un mot en dur, en texte ou en attribut, est vu", () => {
  assert.deepEqual(horsLibelles(`<label>Titre<input placeholder="⟦x⟧"/></label>`).restes, ["Titre"]);
  assert.deepEqual(horsLibelles(`<input placeholder="Choisir…"/>`).restes, ["Choisir…"]);
  assert.deepEqual(horsLibelles(`<button aria-label="Retirer la variante">×</button>`).restes, ["Retirer la variante"]);
  // Kreyòl, et accent EN FRONTIÈRE de mot : ce que `\b` et `[a-z]` ratent.
  assert.deepEqual(horsLibelles(`<p>N ap prepare foto a…</p>`).restes, ["N ap prepare foto a…"]);
  assert.deepEqual(horsLibelles(`<p>⟦ok⟧ lè</p>`).restes, ["lè"]);
  assert.deepEqual(horsLibelles(`<optgroup label="Machandiz · Machandiz"></optgroup>`).restes, ["Machandiz · Machandiz"]);
});

test("analyseur — connu-NÉGATIF : libellés reçus, données, chiffres et pictos sont tus", () => {
  const html = `<label>⟦Titre⟧<input placeholder="⟦Ex. X⟧"/></label><span aria-hidden="true">📷 · × + 2500 →</span><p>Toyota Corolla</p>`;
  assert.deepEqual(horsLibelles(html, ["Toyota Corolla"]), { restes: [], vus: 2 });
});

// ── M3 : aucun texte en dur, dans les quatre langues ────────────────────────

for (const lang of LANGS) {
  test(`M3 — aucun texte visible en dur (${lang}) : formulaire, variante, compatibilité, photo`, () => {
    const rendus: Array<[string, string, string[]]> = [
      ["formulaire", formulaire(lang, true), []],
      ["variante nommée", variante(lang, "250 ml", true), ["250 ml"]],
      ["variante vide", variante(lang, "", true), []],
      ["compatibilité", compatibilite(lang, true), ["Toyota Corolla", "Toyota"]],
      ...etatsPhoto(lang, true).map((h, i): [string, string, string[]] => [`état photo ${i}`, h, []]),
    ];
    let vus = 0;
    for (const [nom, html, donnees] of rendus) {
      const r = horsLibelles(html, donnees);
      assert.deepEqual(r.restes, [], `${nom} : texte écrit dans le composant au lieu d'arriver traduit`);
      vus += r.vus;
    }
    // Le vert doit venir d'une vérification, pas d'un vide (docs/25 §2.4).
    assert.ok(vus >= 60, `libellés rencontrés : ${vus} — le rendu a-t-il eu lieu ?`);
  });
}

test("M3 — la page lie chaque champ à SA clé, et chaque clé existe dans les quatre langues", () => {
  const tables: Array<Record<string, I18nKey>> = [LISTING, ETAPES_CLES, VARIANTES, COMPAT, SPECS];
  let lies = 0;
  for (const tab of tables) {
    for (const [champ, cle] of Object.entries(tab)) {
      const motif = new RegExp(`\\b${champ}: t\\(lang, "${cle.replaceAll(".", "\\.")}"\\)`);
      assert.match(PAGE_SRC, motif, `page : ${champ} n'est pas lié à ${cle}`);
      for (const lang of LANGS) assert.ok(DICT[lang][cle]?.trim(), `${lang} : ${cle} vide`);
      lies++;
    }
  }
  assert.equal(lies, 69, "nombre de libellés liés");
});

test("M3 — les libellés à trous gardent leurs trous dans les quatre langues", () => {
  const TROUS: Array<[I18nKey, string[]]> = [
    ["publish.physical.step.count", ["{n}", "{total}"]],
    ["publish.physical.photo.reduced", ["{avant}", "{apres}"]],
    ["publish.physical.photo.light", ["{poids}"]],
    ["publish.physical.variant.group", ["{n}"]],
    ["publish.physical.variant.remove", ["{n}"]],
    ["publish.physical.variant.removeNamed", ["{libelle}"]],
    ["publish.physical.fitment.from", ["{annee}"]],
    ["publish.physical.fitment.until", ["{annee}"]],
    ["publish.physical.fitment.from.aria", ["{vehicule}"]],
    ["publish.physical.fitment.until.aria", ["{vehicule}"]],
    ["publish.physical.fitment.remove", ["{vehicule}"]],
  ];
  for (const lang of LANGS) {
    for (const [cle, trous] of TROUS) {
      for (const trou of trous) assert.ok(DICT[lang][cle].includes(trou), `${lang} ${cle} : ${trou} manquant`);
    }
  }
  // « {apres} » vient APRÈS « {avant} » : le gras se pose sur le second poids.
  for (const lang of LANGS) {
    const v = DICT[lang]["publish.physical.photo.reduced"];
    assert.ok(v.indexOf("{avant}") < v.indexOf("{apres}"), lang);
  }
});

test("M3 — le rayon s'affiche dans la langue de l'écran, kreyòl compris", () => {
  // Les catégories arrivent par un effet (non joué au rendu serveur) : la
  // liaison est gardée dans le code — optgroup ET option passent par elle.
  assert.match(FORM_SRC, /function libelleCategorie\(c: Category, lang: Lang\): string \{\s*return \(lang === "ht" \? c\.label_kr : null\) \|\| c\.label_fr;/);
  assert.match(FORM_SRC, /<optgroup key=\{dep\.slug\} label=\{libelleCategorie\(dep, lang\)\}>/);
  assert.match(FORM_SRC, /\{libelleCategorie\(c, lang\)\}\s*<\/option>/);
  assert.doesNotMatch(FORM_SRC, /label_fr\} · \$\{dep\.label_kr/);
});

test("M3 — l'erreur de chargement passe par un libellé reçu, annoncée", () => {
  // Branche ouverte par un effet : gardée par sa CONDITION et ce qu'elle rend.
  assert.match(
    FORM_SRC,
    /if \(loadError\) \{\s*return \([\s\S]{0,120}<p role="alert"[^>]*>\{listingLabels\.loadError\}<\/p>/,
  );
});

// ── Le champ fichier : jamais « Choose File / No file chosen » ──────────────

test("le champ fichier natif est masqué derrière un libellé-bouton traduit (photo-principale)", () => {
  for (const lang of LANGS) {
    const html = formulaire(lang);
    const fichiers = [...html.matchAll(/<label\b([^>]*)>([^<]*)<input\b([^>]*type="file"[^>]*)\/?>/g)];
    assert.equal(fichiers.length, 1, `${lang} : un seul champ fichier, dans son libellé`);
    const [, attrsLabel, texte, attrsInput] = fichiers[0];
    assert.match(attrsInput, /class="sr-only"/, `${lang} : l'input doit être visuellement masqué, pas retiré`);
    assert.doesNotMatch(attrsInput, /\bhidden\b/, `${lang} : hidden le rendrait injoignable au clavier`);
    assert.match(attrsLabel, /\bmin-h-11\b/);
    assert.match(attrsLabel, /has-\[:focus-visible\]:outline\b/, `${lang} : le focus doit se voir sur le libellé`);
    assert.equal(decoder(texte).trim(), t(lang, "sell.cover.add"), `${lang} : le bouton dit l'action, traduite`);
  }
  // La reprise de photo (branche ouverte après envoi, hors rendu serveur)
  // réutilise le MÊME composant ; aucun autre champ fichier n'existe.
  assert.match(FORM_SRC, /if \(createdProductId\) \{[\s\S]{0,900}<ChoixPhoto\b/);
  assert.equal(FORM_SRC.match(/type="file"/g)?.length, 1);
});

// ── M10 : chaque contrôle rendu fait 44 px ──────────────────────────────────

test("M10 — chaque champ, liste, résumé, bouton et lien d'étape porte min-h-11", () => {
  const html = [formulaire("fr"), compatibilite("fr"), variante("fr", "250 ml")].join("\n");
  const controles = [...html.matchAll(/<(input|select|button|summary|a)\b([^>]*)>/g)];
  const fautifs: string[] = [];
  let vus = 0;
  for (const [balise, nom, attrs] of controles) {
    if (nom === "input" && /type="checkbox"/.test(attrs)) continue; // cible = son <label> (p-4)
    if (nom === "input" && /type="file"/.test(attrs)) continue; // cible = son <label>, vérifié ci-dessus
    if (nom === "a" && !/href="#etape-/.test(attrs)) continue; // lien de texte dans l'attestation
    vus++;
    if (!/\bmin-h-11\b/.test(attrs)) fautifs.push(balise.slice(0, 90));
  }
  assert.deepEqual(fautifs, [], "contrôle sous 44 px de haut");
  // formulaire : 9 champs, 2 listes, 2 résumés, 2 boutons, 4 liens d'étape ;
  // compatibilité : 4 listes, 1 bouton ; variante : 3 champs, 1 bouton.
  assert.equal(vus, 28, "nombre de contrôles examinés");
  // L'attestation : la case est petite, son libellé est la cible.
  assert.match(formulaire("fr"), /<label class="flex items-start gap-3 rounded-xl[^"]*\bp-4\b[^"]*"><input type="checkbox"/);
});

// ── m1 : la variante en carte sous sm ───────────────────────────────────────

test("m1 — sous sm, une variante est une carte : nom en pleine largeur, prix et stock côte à côte", () => {
  const html = variante("fr", "250 ml");
  const racine = html.match(/^<div role="group" aria-label="([^"]*)" class="([^"]*)">/);
  assert.ok(racine, "la variante est un groupe nommé");
  assert.equal(racine[1], "Variante 2");
  const classes = racine[2].split(/\s+/);
  // Mobile : PAS de grille sur une ligne — c'est elle qui laissait 56 px au nom.
  assert.ok(!classes.some((c) => /^grid(-cols-.*)?$/.test(c)), `grille dès 360 px : ${racine[2]}`);
  assert.ok(classes.includes("sm:grid") && classes.some((c) => c.startsWith("sm:grid-cols-[")), "la rangée revient à partir de sm");
  // Premier enfant : le nom, champ pleine largeur.
  assert.match(html, /^<div[^>]*><label class="block min-w-0[^"]*">Nom de la variante<input placeholder="Ex\. 250 ml \/ Rouge \/ M" class="[^"]*\bw-full\b/);
  // Puis prix, stock et « retirer » sur une rangée à trois colonnes, dissoute à sm.
  const rangee = html.match(/<div class="([^"]*)"><label[^>]*>Prix \(HTG\)<input[\s\S]*?<label[^>]*>Stock<input[\s\S]*?<button\b([^>]*)>/);
  assert.ok(rangee, "prix, stock puis bouton dans la même rangée");
  assert.match(rangee[1], /\bgrid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)_2\.75rem\]/);
  assert.match(rangee[1], /\bsm:contents\b/);
  assert.match(rangee[2], /\bmin-h-11\b/);
  assert.match(rangee[2], /\bmin-w-11\b/);
});

test("m1 — « retirer » porte le nom de la variante, ou son numéro si elle n'en a pas", () => {
  for (const lang of LANGS) {
    const nomme = variante(lang, "250 ml").match(/<button[^>]*aria-label="([^"]*)"/)?.[1];
    assert.equal(decoder(nomme ?? ""), t(lang, "publish.physical.variant.removeNamed").replace("{libelle}", "250 ml"), lang);
    const vide = variante(lang, "  ").match(/<button[^>]*aria-label="([^"]*)"/)?.[1];
    assert.equal(decoder(vide ?? ""), t(lang, "publish.physical.variant.remove").replace("{n}", "2"), lang);
  }
});

// ── m7 : quatre étapes visibles, et où l'on se trouve ───────────────────────

test("m7 — quatre cartes numérotées, un indicateur en tête qui y mène, l'étape courante annoncée", () => {
  const html = formulaire("fr");
  const nav = html.match(/<nav aria-label="Étapes de la fiche"><ol\b[^>]*>([\s\S]*?)<\/ol><\/nav>/);
  assert.ok(nav, "l'indicateur est une liste ORDONNÉE dans une navigation nommée");
  const liens = [...nav[1].matchAll(/<li\b[^>]*><a href="#(etape-[a-z]+)"([^>]*)>([\s\S]*?)<\/a><\/li>/g)];
  assert.equal(liens.length, 4);
  const sections = [...html.matchAll(/<section id="(etape-[a-z]+)" aria-labelledby="(etape-[a-z]+-titre)"[^>]*><h2 id="([^"]*)"[^>]*>([\s\S]*?)<\/h2>/g)];
  assert.deepEqual(sections.map((s) => s[1]), liens.map((l) => l[1]), "chaque lien mène à sa carte, dans l'ordre");
  for (const s of sections) assert.equal(s[2], s[3], "la carte est nommée par son titre");

  const titres = sections.map((s) => decoder(s[4].replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim());
  assert.deepEqual(titres, [
    "1 sur 4 · Photo recommandée",
    "2 sur 4 · Titre et prix obligatoire",
    "3 sur 4 · Détails obligatoire",
    "4 sur 4 · Enregistrer obligatoire",
  ]);
  // Le lien dit aussi « n sur 4 » au lecteur d'écran, et l'étape courante est
  // la première au chargement — une seule à la fois.
  assert.match(liens[0][3], /<span class="sr-only">1 sur 4 <\/span>/);
  assert.deepEqual(liens.map((l) => /aria-current="step"/.test(l[2])), [true, false, false, false]);
  assert.equal(html.match(/aria-current=/g)?.length, 1);

  // Kreyòl : le compte se lit « 1 sou 4 ».
  assert.match(formulaire("ht"), /<span class="text-sm font-semibold text-mist">1 sou 4<\/span>/);
});

test("m7 — aria-current suit le focus : chaque carte rapporte SON indice", () => {
  // Le focus n'existe pas au rendu serveur : la liaison est gardée dans le
  // code, ancrée sur l'id de la carte — c'est lui qui la désigne.
  assert.match(FORM_SRC, /aria-current=\{etapeActive === i \? "step" : undefined\}/);
  for (let i = 0; i < 4; i++) {
    assert.match(
      FORM_SRC,
      new RegExp(`id=\\{\`etape-\\$\\{ETAPES\\[${i}\\]\\}\`\\}\\s*aria-labelledby=\\{\`etape-\\$\\{ETAPES\\[${i}\\]\\}-titre\`\\}\\s*onFocusCapture=\\{\\(\\) => setEtapeActive\\(${i}\\)\\}`),
      `la carte ${i + 1} doit rapporter l'indice ${i}`,
    );
  }
  assert.match(FORM_SRC, /const ETAPES = \["photo", "infos", "details", "enregistrer"\] as const;/);
});

test("m7 — mentions cohérentes : optionnel hors du nom accessible, sur la description et les variantes", () => {
  const html = formulaire("fr");
  // Description : la mention est une DESCRIPTION du champ, son nom reste exact.
  assert.match(html, /<label for="product-description"[^>]*>Description du produit<\/label> <span id="description-optional"[^>]*>\(optionnel\)<\/span>/);
  assert.match(html, /<textarea id="product-description" aria-describedby="description-optional description-hint"/);
  assert.match(html, /<summary[^>]*>Variantes : tailles, couleurs, contenances <span[^>]*>\(optionnel\)<\/span><\/summary>/);
  assert.match(compatibilite("fr"), /Compatibilité véhicule <span[^>]*>\(recommandée\)<\/span>/);
});

// ── Ce que la présentation ne doit PAS toucher : champ → état → corps envoyé ─

/**
 * Relecture indépendante du 2026-10-27 (t1) : la première version cherchait
 * `required={!showVariants}` dans tout le fichier — le motif y est DEUX fois
 * (prix et quantité), et retirer `required` du seul prix laissait le test
 * vert. Chaque garde est désormais ancrée sur SON champ : l'élément `<input>`
 * qui affiche l'état, l'unique écrivain de cet état, puis le corps du POST.
 */
const INPUTS = [...FORM_SRC.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]);

/** L'unique `<input>` dont la valeur affichée est `etat`. */
function champ(etat: string): string {
  const trouves = INPUTS.filter((s) => new RegExp(`\\bvalue=\\{${etat}\\}`).test(s));
  assert.equal(trouves.length, 1, `un seul champ affiche ${etat}`);
  return trouves[0];
}

/** Le corps du POST de création, et lui seul. */
function corpsCreation(): string {
  const m = FORM_SRC.match(
    /fetch\("\/api\/products\/physical", \{\s*method: "POST",[\s\S]{0,120}?body: JSON\.stringify\(\{([\s\S]*?)\}\),\s*\}\);\s*const data = await res\.json\(\);/,
  );
  assert.ok(m, "corps du POST de création introuvable");
  return m[1];
}

for (const [etat, ecrivain, cleCorps] of [
  ["price", "setPrice", "priceHTG"],
  ["quantity", "setQuantity", "quantity"],
] as const) {
  test(`${etat} : le champ est SA seule source, exigé hors variantes, et part tel quel au serveur`, () => {
    const el = champ(etat);
    // Le champ écrit l'état qu'il affiche…
    assert.match(el, new RegExp(`onChange=\\{\\(e\\) => ${ecrivain}\\(e\\.target\\.value\\)\\}`));
    // …et il est le SEUL à l'écrire (hors déclaration).
    assert.match(FORM_SRC, new RegExp(`const \\[${etat}, ${ecrivain}\\] = useState\\(""\\);`));
    assert.equal(FORM_SRC.split(`${ecrivain}(`).length - 1, 1, `${ecrivain} n'a qu'un appelant : le champ ${etat}`);
    // Validation inchangée, sur CE champ.
    assert.match(el, /\brequired=\{!showVariants\}/);
    assert.match(el, /\bdisabled=\{showVariants\}/);
    assert.match(el, /\btype="number"/);
    assert.match(el, /\bstep=\{1\}/);
    // Le corps envoie cet état, converti en nombre — rien d'autre.
    assert.match(corpsCreation(), new RegExp(`\\n\\s*${cleCorps}: Number\\(${etat}\\),\\n`));
  });
}

test("prix et quantité sont exigés AU RENDU, chacun sur son champ nommé", () => {
  for (const lang of LANGS) {
    const html = formulaire(lang);
    for (const cle of ["publish.price.ph", "publish.physical.quantity"] as const) {
      const nom = t(lang, cle).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const m = html.match(new RegExp(`<label[^>]*><span[^>]*>${nom}</span><input\\b([^>]*)/?>`));
      assert.ok(m, `${lang} : champ « ${t(lang, cle)} » introuvable`);
      assert.match(m[1], /\brequired=""/, `${lang} : « ${t(lang, cle)} » n'est plus exigé`);
      assert.match(m[1], /\btype="number"/);
    }
  }
});

test("le reste de la porte d'envoi est intact", () => {
  assert.match(corpsCreation(), /\n\s*categorySlug,\n\s*policyAccepted: policyOk,\n/);
  assert.match(FORM_SRC, /disabled=\{busy \|\| compressing \|\| !categorySlug\}/);
  assert.match(FORM_SRC, /rateBpsEnVigueur=\{rateBpsEnVigueur\}/);
});
