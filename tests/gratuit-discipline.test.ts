import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * DISCIPLINE DU RAIL GRATUIT (`0087`).
 *
 * Ce rail marque une commande « payée » sans qu'aucun argent ne circule. C'est,
 * en soi, l'objet le plus dangereux qu'on puisse ajouter à ce dépôt — et sa
 * sûreté ne tient à AUCUNE ligne de la route : elle tient à trois propriétés
 * que ce fichier existe pour empêcher de perdre en silence.
 *
 * ⚠️ POURQUOI LES ASSERTIONS PORTENT SUR LA CONDITION, JAMAIS SUR UN LIBELLÉ.
 * `CLAUDE.md` : un garde SUPPRIMÉ et un garde rendu INATTEIGNABLE laissent
 * exactement le même texte dans le fichier. Chercher `"gratis"` ou
 * `"p_amount"` resterait vert avec `if (false)` au-dessus. Chaque motif ci-
 * dessous lie donc ce qui COMMANDE à ce qui est commandé.
 *
 * MUTATIONS ÉPROUVÉES le 2026-08-21 — chacune a été appliquée, la ligne mutée
 * affichée, la suite relancée, puis la mutation retirée :
 *
 *   G1  `order.amount_htg === 0` → `true` .................... rouge ✓
 *   G2  `p_amount: 0` → `p_amount: order.amount_htg` ......... rouge ✓
 *   G3  retrait du retour anticipé de `buildBuyOptions` ...... rouge ✓
 *   G4  `!isDigitalKind(product.kind)` → `false` ............. rouge ✓
 */

const CHECKOUT = readFileSync("app/api/checkout/route.ts", "utf8");
const FICHE = readFileSync("app/produit/[slug]/page.tsx", "utf8");

/** Retire les commentaires : un motif ne doit jamais matcher de la prose. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const CHECKOUT_CODE = code(CHECKOUT);
const FICHE_CODE = code(FICHE);

test("G0 — les fichiers lus ne sont pas vides (l'instrument a lu quelque chose)", () => {
  // « aucun cas » et « aucun cas possible » ne doivent pas se ressembler.
  assert.ok(CHECKOUT_CODE.length > 2000, `checkout : ${CHECKOUT_CODE.length} car.`);
  assert.ok(FICHE_CODE.length > 2000, `fiche : ${FICHE_CODE.length} car.`);
});

test("G1 — le rail gratuit est commandé par le MONTANT RELU EN BASE, pas par le client", () => {
  // La liaison est à l'extrémité gauche : `order.amount_htg` est la valeur
  // ressortie de l'insertion (`.select("id, amount_htg")`), donc la vérité de
  // la base. Rebrancher cette extrémité sur `railInput` ou sur `finalPriceHtg`
  // fait rougir — c'est précisément la mutation qui sépare un garde réel d'une
  // adjacence de texte.
  assert.match(
    CHECKOUT_CODE,
    /const\s+railEffectif\s*=\s*order\.amount_htg\s*===\s*0\s*\?\s*RAIL_GRATIS/,
    "le rail doit être DÉDUIT de order.amount_htg, jamais reçu de l'appelant"
  );
  assert.match(
    CHECKOUT_CODE,
    /if\s*\(\s*order\.amount_htg\s*===\s*0\s*\)[\s\S]{0,600}confirm_payment/,
    "la branche de confirmation gratuite doit être gardée par order.amount_htg === 0"
  );
  // Et `gratis` ne doit PAS être un rail demandable.
  assert.doesNotMatch(
    CHECKOUT_CODE,
    /const\s+RAILS\s*=\s*\[[^\]]*gratis/,
    "« gratis » ne doit jamais figurer dans RAILS : personne ne doit pouvoir le réclamer"
  );
});

test("G2 — la confirmation gratuite passe p_amount: 0, le garde fail-closed de la base", () => {
  // `confirm_payment` lève si p_amount <> orders.amount_htg. Passer le montant
  // de la commande au lieu de 0 littéral marcherait AUSSI aujourd'hui — mais
  // supprimerait la seule assertion indépendante que cette branche ne traite
  // que du zéro. Le littéral est le contrôle.
  assert.match(
    CHECKOUT_CODE,
    /confirm_payment[\s\S]{0,400}p_amount:\s*0\s*[,}]/,
    "la branche gratuite doit passer p_amount: 0 — littéral, pas order.amount_htg"
  );
});

test("G3 — un produit à 0 n'affiche AUCUN rail de paiement", () => {
  // Le retour anticipé doit précéder toute construction d'option payante.
  // Le motif lie la condition de prix au rail rendu.
  assert.match(
    FICHE_CODE,
    /if\s*\(\s*priceHTG\s*===\s*0\s*\)\s*\{\s*return\s*\[\s*\{\s*rail:\s*"gratis"/,
    "buildBuyOptions doit rendre le seul rail « gratis » quand le prix est nul"
  );
  // Et ce retour doit venir AVANT la construction de l'option MonCash, sinon
  // il ne protège rien.
  const iGratis = FICHE_CODE.indexOf('rail: "gratis"');
  const iMoncash = FICHE_CODE.indexOf('rail: "moncash"');
  assert.ok(iGratis > -1 && iMoncash > -1, "les deux rails doivent exister dans la fiche");
  assert.ok(
    iGratis < iMoncash,
    "le retour anticipé « gratis » doit précéder l'option MonCash — sinon « Payer 0 HTG » reste atteignable"
  );
});

test("G4 — un article LIVRABLE ne peut pas être offert à 0", () => {
  // La base l'interdit déjà pour les variantes (`zabelie_product_variants
  // .price_htg > 0`, 0036) ; ce garde étend la règle au physique sans variante.
  // Motif lié : la condition de gratuité ET le refus de kind non numérique.
  assert.match(
    CHECKOUT_CODE,
    /const\s+estGratuit\s*=\s*product\.price_htg\s*===\s*0[\s\S]{0,200}if\s*\(\s*estGratuit\s*&&\s*!isDigitalKind\(\s*product\.kind\s*\)\s*\)/,
    "un produit physique à 0 doit être refusé, et la condition doit lire product.kind"
  );
  assert.match(
    CHECKOUT_CODE,
    /gratuit_physique_refuse/,
    "le refus doit porter un code lisible côté client"
  );
});

test("G5 — la comparaison de kind passe par lib/product-kind (règle du dépôt)", () => {
  // `CLAUDE.md` : comparer un type de produit hors de ce module est interdit.
  // Ajouter une valeur à l'union ne casse aucune compilation — la garantie
  // vient des switch exhaustifs du module, pas du type.
  assert.match(
    CHECKOUT,
    /import\s*\{[^}]*isDigitalKind[^}]*\}\s*from\s*"@\/lib\/product-kind"/,
    "isDigitalKind doit venir du module, jamais être réécrit sur place"
  );
  assert.doesNotMatch(
    CHECKOUT_CODE,
    /product\.kind\s*===\s*"(physical|fichier|service)"/,
    "aucune comparaison littérale de kind dans la route"
  );
});

test("G7 — la PUBLICATION d'un numérique accepte 0 et refuse le négatif", () => {
  // ⚠️ LE SECOND MUR, trouvé sur une capture d'écran du porteur le 2026-08-21.
  // Le premier (checkout → MonCash à 0) est tombé avec 0087 ; celui-ci
  // refusait la CRÉATION, donc le rail serait resté vide faute de produit.
  //
  // Ma recherche initiale l'avait manqué : je grepais `price_htg`, la colonne,
  // alors que la validation porte sur `price`, la variable locale. Un motif ne
  // prouve rien sur ce qu'il n'a pas cherché — d'où ce garde.
  const PRODUITS = code(readFileSync("app/api/products/route.ts", "utf8"));
  assert.ok(PRODUITS.length > 1000, "le fichier doit avoir été lu");

  // La condition ELLE-MÊME, pas le message : un libellé corrigé sans la
  // condition laisserait le mur debout en affichant le contraire.
  assert.match(
    PRODUITS,
    /!Number\.isFinite\(price\)\s*\|\|\s*price\s*<\s*0\s*\)/,
    "la publication numérique doit refuser price < 0, jamais price < 1"
  );
  assert.doesNotMatch(
    PRODUITS,
    /price\s*<\s*1\b/,
    "aucun plancher à 1 HTG ne doit subsister sur la route numérique"
  );
});

test("G8 — le plancher à 1 HTG reste ENTIER pour les articles livrables", () => {
  // Le pendant du précédent : ouvrir le gratuit au numérique ne doit pas
  // l'ouvrir au physique par effet de bord. `zabelie_product_variants
  // .price_htg > 0` (0036) le dit déjà en base ; ici on garde la route alignée.
  const PHYS = code(readFileSync("app/api/products/physical/route.ts", "utf8"));
  assert.ok(PHYS.length > 1000, "le fichier doit avoir été lu");
  assert.match(
    PHYS,
    /!Number\.isInteger\(price\)\s*\|\|\s*price\s*<\s*1\b/,
    "la route physique doit conserver son plancher à 1 HTG"
  );
});

test("G6 — le suivi de remise s'ouvre APRÈS la confirmation, jamais avant", () => {
  // 0043 §6 bis : avant confirm_payment, l'escrow n'existe pas et le gel ne
  // toucherait aucune ligne. L'ordre est le contrôle, pas la présence.
  const iConfirm = CHECKOUT_CODE.indexOf("confirm_payment");
  const iSuivi = CHECKOUT_CODE.indexOf("ouvrirSuiviLivraison");
  assert.ok(iConfirm > -1, "la route doit confirmer");
  assert.ok(iSuivi > -1, "la route doit ouvrir le suivi");
  assert.ok(
    iConfirm < iSuivi,
    "ouvrirSuiviLivraison doit venir APRÈS confirm_payment (0043 §6 bis)"
  );
});
