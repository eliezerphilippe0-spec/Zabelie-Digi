import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS } from "@/lib/i18n";

/**
 * LA PAGE DE SUCCÈS NE PROMET PAS UN FICHIER À TOUT LE MONDE.
 *
 * ⚠️ NÉ D'UN DÉFAUT MESURÉ le 2026-08-27, en analysant les pages une par une.
 * `app/paiement/succes/page.tsx` rendait `pay.ok.body` SANS CONDITION :
 *
 *     « Merci ! Votre achat est validé. Votre fichier est disponible dans vos
 *       téléchargements. »   — dans les QUATRE langues
 *
 * Zabelie vend trois types. Un acheteur de prestation ou de bien physique
 * arrivait donc, **juste après avoir payé**, sur l'ordre d'aller chercher un
 * fichier qui n'existerait jamais.
 *
 * Ce n'était pas théorique : les deux seuls produits publiés ce jour-là sont
 * des PRESTATIONS, et la première commande réelle de `docs/22` porte sur l'une
 * d'elles. Le premier acheteur de Zabelie serait tombé dessus.
 *
 * ⚠️ POURQUOI `tests/promesse-vendeur.test.ts` NE L'A PAS VU : il inspecte le
 * DICTIONNAIRE i18n, pas les pages. Le garde existait, son périmètre
 * s'arrêtait avant. C'est le motif « un filet sur un chemin impraticable » de
 * `CLAUDE.md`, vu par l'autre bout : un filet posé à côté du chemin.
 */

const PAGE = "app/paiement/succes/page.tsx";
const FICHE = "app/produit/[slug]/page.tsx";
const CSS = "app/globals.css";

/* ⚠️ FRONTIÈRES `(?<![\p{L}])…(?![\p{L}])`, JAMAIS `\b` — règle dure de
 * `CLAUDE.md` : en JavaScript `\w` vaut `[A-Za-z0-9_]`, et une frontière posée
 * contre une lettre accentuée tombe du mauvais côté. « téléchargement » finit
 * par un `t` et passerait ; « fichye » finit par un `e` et passerait aussi —
 * mais la règle vaut pour la CLASSE, pas pour les cas qui s'en tirent. */
const PROMET_UN_FICHIER =
  /(?<![\p{L}])(fichier|fichye|téléchargement|téléchargements|telechajman|file|download|downloads|archivo|descarga|descargas)(?![\p{L}])/iu;

test("S0 — le détecteur voit la promesse, dans les quatre langues", () => {
  /* L'instrument avant la mesure. Chaque langue a sa forme, et l'accent en
   * milieu de mot (« téléchargements ») comme la finale nue (« fichye »)
   * doivent être vus. */
  for (const s of [
    "Votre fichier est disponible dans vos téléchargements.",
    "Fichye ou disponib nan telechajman ou yo.",
    "Your file is available in your downloads.",
    "Tu archivo está disponible en tus descargas.",
  ]) {
    assert.ok(PROMET_UN_FICHIER.test(s), `le motif ne voit pas « ${s} »`);
  }
  // Connu-négatif : les trois replis honnêtes ne doivent PAS être attrapés.
  for (const s of [
    "Mèsi! Acha ou valide. Detay yo nan « Acha mwen yo ».",
    "Merci ! Votre achat est validé. Les détails sont dans « Mes achats ».",
    "El vendedor debe entregarte el pedido.",
    "Vandè a gen pou l remèt ou li",
  ]) {
    assert.ok(!PROMET_UN_FICHIER.test(s), `faux positif sur « ${s} »`);
  }
});

test("S1 — le REPLI ne promet rien : c'est lui qui a causé le défaut", () => {
  /* ⚠️ LA CLÉ DE TOUT LE FICHIER. Quand le type est inconnu — Supabase non
   * configuré, paramètre `commande` absent, jointure en échec — la page
   * retombe sur `pay.ok.body`. Si CE repli promet un fichier, le défaut
   * revient intégralement par la porte de l'échec, qui est justement le
   * chemin qu'on emprunte le moins et qu'on teste le moins. */
  for (const lang of LANGS) {
    const repli = (DICT[lang] as Record<string, string>)["pay.ok.body"];
    assert.ok(repli && repli.trim().length > 0, `pay.ok.body vide en ${lang}`);
    assert.ok(
      !PROMET_UN_FICHIER.test(repli),
      `pay.ok.body (${lang}) promet un fichier : « ${repli} ». ` +
        "C'est le REPLI — il est servi quand le type est INCONNU. Un repli qui " +
        "promet quelque chose est pire qu'un repli qui ne promet rien."
    );
  }
});

test("S2 — les trois variantes existent dans les quatre langues", () => {
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    for (const k of ["pay.ok.body.file", "pay.ok.body.service", "pay.ok.body.physical"]) {
      assert.ok(d[k] && d[k].trim().length > 0, `${k} manquante en ${lang}`);
    }
    /* La variante FICHIER est la seule autorisée à parler de téléchargement —
     * et elle DOIT en parler, sinon l'acheteur d'un fichier ne sait plus où
     * aller. Les deux autres ne doivent jamais le faire. */
    assert.ok(
      PROMET_UN_FICHIER.test(d["pay.ok.body.file"]),
      `pay.ok.body.file (${lang}) ne dit plus où trouver le fichier`
    );
    for (const k of ["pay.ok.body.service", "pay.ok.body.physical"]) {
      assert.ok(
        !PROMET_UN_FICHIER.test(d[k]),
        `${k} (${lang}) promet un fichier : « ${d[k]} ». Une prestation et un ` +
          "bien physique n'en produisent aucun."
      );
    }
  }
});

test("S3 — la page BRANCHE sur le type, et par le module obligatoire", () => {
  /* ⚠️ ASSERTION SUR CE QUI COMMANDE. Chercher la présence de
   * `pay.ok.body.file` resterait vert si la clé était calculée puis jamais
   * servie ; chercher `pickByKind` resterait vert si son résultat était
   * ignoré. On ancre donc la LIAISON : le résultat de `cleCorps(kind)` doit
   * atteindre le `t(lang, …)` qui rend le paragraphe. */
  const src = readFileSync(PAGE, "utf8");
  assert.match(
    src,
    /\{t\(lang,\s*cleCorps\(kind\)\)\}/,
    "le corps de la page n'est plus accordé au type : il redevient une phrase " +
      "unique pour les trois kinds, ce qui EST le défaut du 2026-08-27"
  );
  assert.match(
    src,
    /pickByKind<I18nKey>\([\s\S]{0,200}file: "pay\.ok\.body\.file"[\s\S]{0,160}physical: "pay\.ok\.body\.physical"/,
    "la sélection ne passe plus par `pickByKind` : une quatrième valeur " +
      "ajoutée à l'énumération ne serait plus signalée (CLAUDE.md, " +
      "tests/product-kind-discipline)"
  );
  /* Et le repli reste explicite dans le code : sans lui, un `kind` illisible
   * rendrait `undefined` au lieu d'une phrase. */
  assert.match(
    src,
    /if \(!isProductKind\(kind\)\) return "pay\.ok\.body";/,
    "le repli neutre a disparu du code : un type illisible ne rendrait plus rien"
  );
});

test("S4 — l'animation par DÉFAUT laisse la page VISIBLE", () => {
  /* ⚠️ LE GARDE QUI COMPTE LE PLUS DANS CE FICHIER, et il porte sur un sens.
   *
   * Une révélation s'écrit naturellement « opacity: 0 au repos, 1 par
   * l'animation ». Écrite ainsi, un utilisateur en mouvement réduit, un
   * navigateur sans support, ou une feuille de style qui n'arrive pas sur 3G
   * verraient une PAGE VIDE — après avoir payé.
   *
   * Le sens correct est l'inverse : visible au repos, l'animation ne
   * s'AJOUTE que sous `prefers-reduced-motion: no-preference`. Le défaut tombe
   * alors du côté « tout est là, rien ne bouge ».
   *
   * On assert donc que les règles `.reveal` vivent DANS le bloc
   * `no-preference`, et qu'aucune n'est déclarée en dehors. */
  const css = readFileSync(CSS, "utf8");
  const i = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(i > -1, "le bloc `no-preference` a disparu : l'animation n'est plus conditionnée");

  const bloc = css.slice(i, css.indexOf("\n  }\n", css.indexOf(".reveal-mark", i)));
  assert.match(bloc, /\.reveal\s*\{[^}]*animation:/, "`.reveal` n'est plus animée dans le bloc");
  assert.match(bloc, /\.reveal-mark\s*\{[^}]*animation:/, "`.reveal-mark` n'est plus animée dans le bloc");

  /* Connu-négatif structurel : hors du bloc, aucune règle `.reveal` ne doit
   * poser d'opacité de repos. C'est ce qui rendrait la page vide. */
  const dehors = css.slice(0, i) + css.slice(i + bloc.length);
  assert.ok(
    !/\.reveal[^{]*\{[^}]*opacity:\s*0/.test(dehors),
    "une règle pose `opacity: 0` sur `.reveal` HORS du bloc `no-preference` : " +
      "en mouvement réduit, ou si la CSS n'arrive pas, la page de succès " +
      "s'affiche VIDE après un paiement"
  );
});

test("S5 — l'escrow est dit sur la fiche produit, et PAS sur un fichier", () => {
  /* `trust.2.b` n'était rendu que sur l'accueil (app/page.tsx:412) — absent de
   * la fiche produit, du panier et de la page de succès, c'est-à-dire de
   * toutes les pages où quelqu'un hésite à payer. C'est le seul
   * différenciateur qu'aucun concurrent du relevé n'annonce (docs/45 §4.6). */
  const fiche = readFileSync(FICHE, "utf8");
  assert.match(
    fiche,
    /!isDownloadable\(product\.kind, product\.id\)[\s\S]{0,700}t\(lang, "trust\.2\.b"\)/,
    "la fiche produit ne dit plus que le vendeur n'est payé qu'après la " +
      "remise, ou ne le conditionne plus au type"
  );

  const succes = readFileSync(PAGE, "utf8");
  assert.match(
    succes,
    /const montrerEscrow = isProductKind\(kind\) && !isDownloadable\(/,
    "la page de succès n'affiche plus l'escrow, ou ne l'exclut plus sur un " +
      "fichier — où la livraison est immédiate et où la phrase sèmerait un doute"
  );
});

/**
 * ─────────── LE PANIER MIXTE ───────────
 *
 * Question laissée OUVERTE le 2026-08-27, et refermée par un précédent plutôt
 * que par une invention : où dire « le vendeur n'est payé qu'après la remise »
 * sur un panier qui mélange les types ? Par ligne, c'est du bruit ; en bas de
 * page, c'est FAUX pour les fichiers.
 *
 * La convention des places de marché qui vendent physique ET numérique —
 * Amazon sépare les envois des articles numériques, Etsy groupe par boutique —
 * est : **grouper par mode de remise, et énoncer la garantie UNE fois, au
 * niveau où elle est vraie.**
 */

const PANIER = "app/panier/page.tsx";
const ACHATS = "app/mes-achats/page.tsx";

test("S6 — le panier GROUPE par mode de remise, et l'escrow suit le groupe", () => {
  const src = readFileSync(PANIER, "utf8");
  /* La liaison, pas la présence : le drapeau `escrow` du groupe doit COMMANDER
   * le rendu de `trust.2.b`. Chercher `trust.2.b` seul resterait vert si la
   * phrase était rendue pour tout le panier — c'est-à-dire le défaut. */
  assert.match(
    src,
    /\{g\.escrow && \([\s\S]{0,600}t\(lang, "trust\.2\.b"\)/,
    "l'escrow n'est plus conditionné au groupe : il redevient soit absent, " +
      "soit affirmé sur des fichiers dont la livraison est immédiate"
  );
  assert.match(
    src,
    /cle: "cart\.group\.download"[\s\S]{0,90}escrow: false[\s\S]{0,200}cle: "cart\.group\.handover"[\s\S]{0,90}escrow: true/,
    "les deux groupes ne portent plus leur drapeau d'escrow : à télécharger " +
      "sans, à remettre avec"
  );
  /* Un en-tête au-dessus d'un groupe unique est du bruit — personne n'écrit
   * « Envoi 1 sur 1 ». */
  /* ⚠️ CETTE ASSERTION A ÉTÉ RÉÉCRITE APRÈS AVOIR ÉCHOUÉ, et le motif compte
   * plus que le correctif. Sa première version reliait la DÉCLARATION à
   * l'USAGE par un intervalle de 900 caractères ; la distance réelle est de
   * 1 059. C'est mot pour mot la « régression de proximité » de `CLAUDE.md` —
   * un contrôle qui tient par la MISE EN PAGE, et que deux lignes de
   * commentaire suffisent à faire basculer.
   *
   * ⚠️ ET LA RÈGLE DIT DE NE PAS ÉLARGIR LA FENÊTRE. Passer à 1 200 marcherait
   * aujourd'hui et casserait au prochain commentaire. On ancre donc sur une
   * adjacence RÉELLE : le garde et le `<h2>` qu'il commande se touchent. */
  assert.match(
    src,
    /const montrerEntetes = groupes\.length > 1;/,
    "le calcul `montrerEntetes` a disparu"
  );
  assert.match(
    src,
    /\{montrerEntetes && \(\s*<h2[^>]*>\s*\{t\(lang, g\.cle\)\}/,
    "l'en-tête de groupe n'est plus commandé par `montrerEntetes` : un titre " +
      "de section s'afficherait au-dessus d'un groupe unique — personne " +
      "n'écrit « Envoi 1 sur 1 »"
  );
});

test("S7 — plus AUCUN libellé de remise en dur : quatre langues, deux écrans", () => {
  /* ⚠️ DÉFAUT MESURÉ le 2026-08-27 : `remiseLabel` rendait « Service · mise en
   * relation » et « Remise à convenir avec le vendeur » EN FRANÇAIS EN DUR,
   * dans une application kreyòl-first. Un acheteur kreyòl lisait du français
   * sur SA page d'achats. */
  const src = readFileSync(ACHATS, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  assert.ok(
    !/"(Service · mise en relation|Remise à convenir avec le vendeur)"/.test(src),
    "un libellé de remise est revenu en dur dans mes-achats"
  );
  assert.match(
    src,
    /service: "purchases\.mode\.service"[\s\S]{0,120}physical: "purchases\.mode\.physical"/,
    "`remiseLabel` ne passe plus par les clés i18n"
  );
  /* Et le vocabulaire est PARTAGÉ : les quatre clés existent partout. */
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    for (const k of [
      "cart.group.download",
      "cart.group.handover",
      "purchases.mode.service",
      "purchases.mode.physical",
    ]) {
      assert.ok(d[k] && d[k].trim().length > 0, `${k} manquante en ${lang}`);
    }
  }
});
