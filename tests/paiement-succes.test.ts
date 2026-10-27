import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICT, LANGS, t, type Lang } from "@/lib/i18n";
import { loadRoute } from "./helpers/route-harness";

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

/**
 * ─────────── CE QUE L'ÉTOILE VEUT DIRE ───────────
 *
 * Regardé le 2026-08-27 chez Mercado Libre, Jumia et Amazon : les trois
 * exposent le COMPORTEMENT du vendeur, jamais son identité. Le KYC y est une
 * condition d'entrée, pas un badge.
 *
 * Zabelie tient déjà le mécanisme d'Amazon, en plus strict et EN BASE :
 * `0008` pose `order_id not null unique` — un avis exige une commande PAYÉE,
 * un seul par commande. Ce n'est pas une politique de modération, c'est une
 * contrainte Postgres. Elle n'était dite nulle part dans le catalogue.
 */

const CATALOGUE = "app/catalogue/page.tsx";
const MIG_AVIS = "supabase/migrations/0008_reviews.sql";

test("S8 — la phrase du catalogue est ADOSSÉE à la contrainte de 0008", () => {
  /* ⚠️ LE CROISEMENT QUI COMPTE, et il est du même genre que
   * `tests/crons-appelants` : la phrase promet quelque chose au visiteur, et
   * ce quelque chose vit dans une MIGRATION. Si la contrainte disparaît, la
   * phrase devient une promesse non tenue — et rien, sans ce test, ne
   * relierait les deux. */
  const sql = readFileSync(MIG_AVIS, "utf8");
  assert.match(
    sql,
    /order_id\s+uuid not null unique references orders/,
    "0008 ne garantit plus « un avis par commande payée » : la phrase du " +
      "catalogue devient une promesse que la base ne tient pas"
  );

  const src = readFileSync(CATALOGUE, "utf8");
  /* La liaison : la présence d'AU MOINS UNE note doit commander l'affichage.
   * Expliquer une étoile absente de l'écran n'informe personne — c'est « un
   * filet sur un chemin impraticable », transposé à une phrase. */
  assert.match(
    src,
    /\{products\.some\(\(p\) => p\.ratingAvg !== null\) && \(/,
    "la phrase n'est plus conditionnée à la présence d'une note affichée"
  );
  assert.match(
    src,
    /t\(lang, "catalog\.reviews\.proof"\)/,
    "la phrase n'est plus rendue dans le catalogue"
  );
});

test("S9 — la phrase dit la garantie, et RIEN de plus, en quatre langues", () => {
  /* Elle ne doit pas glisser vers « vendeur vérifié » : le KYC de `0079` n'est
   * lisible que par le vendeur lui-même (aucune policy publique), et les trois
   * géants n'exposent de toute façon pas l'identité. Une phrase qui
   * l'affirmerait serait invérifiable ET hors sujet. */
  const INTERDIT =
    /(?<![\p{L}])(vérifiés?|verifye|verified|verificados?|identité|idantite|identity|identidad|KYC)(?![\p{L}])/iu;
  for (const lang of LANGS) {
    const p = (DICT[lang] as Record<string, string>)["catalog.reviews.proof"];
    assert.ok(p && p.trim().length > 0, `catalog.reviews.proof manquante en ${lang}`);
    assert.ok(
      !INTERDIT.test(p),
      `catalog.reviews.proof (${lang}) parle de vérification d'identité : ` +
        `« ${p} ». La garantie de 0008 porte sur le PAIEMENT, pas sur le vendeur.`
    );
  }
  // Connu-positif du détecteur : il verrait la dérive s'il elle arrivait.
  assert.ok(INTERDIT.test("Vandè verifye toupre w"));
  assert.ok(INTERDIT.test("Vendeurs vérifiés"));
});

/**
 * ─────────── LA COCHE NE SE DONNE PAS ───────────
 *
 * ⚠️ SEC-01, audit du 2026-10-17 : `/paiement/succes` affichait « ✓ Paiement
 * confirmé » à n'importe qui, avec ou sans session, avec un numéro de commande
 * inventé. Vérifié en ligne, en visiteur. Le faux acheteur envoie la capture
 * ou le lien au vendeur, et la page officielle lui sert de preuve.
 *
 * Seul le pixel était gardé par le statut lu en base (`tests/pixels`, X6) :
 * le garde existait, il protégeait la publicité et pas le texte.
 */

/* Les commentaires citent « ✓ Paiement confirmé » : on les retire avant de
 * mesurer des positions, sinon le garde serait jugé sur sa propre explication. */
const sansCommentaires = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("S10 — la coche et « Paiement confirmé » n'existent qu'APRÈS le garde `payee`", () => {
  const src = sansCommentaires(readFileSync(PAGE, "utf8"));
  assert.match(
    src,
    /const payee = !!ligne && \["paid", "delivered"\]\.includes\(ligne\.status\);/,
    "« payée » ne vient plus du statut lu en base sous la session"
  );
  const debut = src.indexOf("export default async function");
  const garde = src.indexOf("if (!payee) {", debut);
  assert.ok(garde > -1, "le garde a disparu : la page confirme de nouveau un paiement qu'elle n'a pas vérifié");
  const fin = src.indexOf("\n  }\n", garde);
  const neutre = src.slice(garde, fin);
  assert.match(neutre, /return \(/, "le garde ne rend plus de page neutre");
  for (const interdit of ["✓", "bg-success", "pay.ok.", "commande.slice", "{ref"]) {
    assert.ok(!neutre.includes(interdit), `la page neutre rend « ${interdit} » : elle confirme ou recopie l'URL`);
  }
  /* Tout ce qui confirme ou récompense un achat vient APRÈS le garde. La coche
   * n'est plus le glyphe ✓ mais un tracé SVG dans la pastille verte (audit du
   * système de design, m10, 2026-10-27) : c'est la pastille `bg-success` qui
   * porte le sens « confirmé », c'est donc elle qu'on situe. */
  for (const marque of ["bg-success", '"pay.ok.title"', "cleCorps(kind)", "<SellerPixels", "<ProductOffers"]) {
    const i = src.indexOf(marque, debut);
    assert.ok(i > fin, `« ${marque} » est rendu avant le garde \`payee\``);
  }
});

test("S11 — la page neutre ne confirme rien, et renvoie là où l'état fait foi", () => {
  /* Le kreyòl n'est pas dans le motif : « konfime » y sert de verbe ET de
   * participe (« pa ka konfime » = ne peut pas confirmer). Il reste couvert
   * par la comparaison au titre de succès et par le renvoi vers ses achats. */
  const CONFIRME =
    /(?<![\p{L}])(confirmée?|validée?|réussie?|confirmed|successful|confirmad[oa]|exitos[oa])(?![\p{L}])/iu;
  for (const s of ["Paiement confirmé", "Payment confirmed", "Pago confirmado"]) {
    assert.ok(CONFIRME.test(s), `le motif ne voit pas « ${s} »`);
  }
  const ACHATS: Record<string, string> = { fr: "Mes achats", ht: "Acha mwen yo", en: "My purchases", es: "Mis compras" };
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    const titre = d["pay.check.title"];
    const corps = d["pay.check.body"];
    assert.ok(titre?.trim() && corps?.trim(), `pay.check.* manquante en ${lang}`);
    assert.notEqual(titre, d["pay.ok.title"], `pay.check.title (${lang}) redit le titre de succès`);
    assert.ok(
      !CONFIRME.test(titre) && !CONFIRME.test(corps),
      `pay.check.* (${lang}) affirme un paiement : « ${titre} » / « ${corps} »`
    );
    assert.ok(corps.includes(ACHATS[lang]), `pay.check.body (${lang}) ne renvoie plus vers « ${ACHATS[lang]} »`);
  }
});

test("S12 — les pages de paiement restent hors index, et l'onglet n'affirme rien", async () => {
  /* Les titres d'onglet passent par `generateMetadata` et la langue de session
   * (m10, 2026-10-27) : ils étaient en français fixe. On n'inspecte donc plus
   * un littéral, on EXÉCUTE la fonction des trois pages, dans les quatre
   * langues — c'est son résultat que Next pose dans <head>. */
  const CONFIRME =
    /(?<![\p{L}])(confirmée?|validée?|réussie?|confirmed|successful|confirmad[oa]|exitos[oa])(?![\p{L}])/iu;
  assert.ok(CONFIRME.test("Paiement confirmé — Zabelie"), "le motif ne voit plus une affirmation");
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  for (const f of [PAGE, "app/paiement/en-attente/page.tsx", "app/paiement/echec/page.tsx"]) {
    for (const lang of LANGS) {
      const mod = loadRoute(f, {
        "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
        "@/lib/i18n": { t },
        "@/lib/i18n-server": { getLang: async () => lang },
      }) as unknown as { generateMetadata?: () => Promise<{ title?: string; robots?: unknown }> };
      assert.equal(typeof mod.generateMetadata, "function", `${f} n'exporte plus generateMetadata`);
      const meta = await mod.generateMetadata!();
      // Recopié dans ce domaine : l'objet vient du bac à sable `vm`, dont le
      // prototype n'est pas celui d'ici (deepEqual strict compare les deux).
      assert.deepEqual({ ...(meta.robots as object) }, { index: false, follow: false }, `${f} (${lang}) peut être indexée`);
      assert.ok(meta.title?.endsWith(" — Zabelie"), `${f} (${lang}) : titre « ${meta.title} »`);
      if (f === PAGE) {
        /* Rendu AVANT la vérification : il doit être neutre, dans chaque langue. */
        const d = DICT[lang as Lang] as Record<string, string>;
        assert.ok(!meta.title!.includes(d["pay.ok.title"]), `l'onglet (${lang}) redit « ${d["pay.ok.title"]} »`);
        assert.ok(!CONFIRME.test(meta.title!), `l'onglet (${lang}) affirme un paiement : « ${meta.title} »`);
      }
    }
  }
});
