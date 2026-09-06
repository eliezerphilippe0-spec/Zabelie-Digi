import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  normaliserNumeroHaiti,
  operateurDouteux,
  operateurDuRayon,
  afficherNumero,
  exigeNumero,
  RECHAJ_SLUGS,
} from "../lib/rechaj";

/**
 * LE NUMÉRO À RECHARGER — le maillon qui manquait au rayon ouvert par `0098`.
 *
 * Deux familles d'assertions, et elles ne se remplacent pas :
 *   • RN1–RN5 éprouvent les fonctions PURES sur des cas connus-positifs ET
 *     connus-négatifs — un normaliseur qui accepterait tout passerait
 *     n'importe quelle assertion qui ne lui donne que du valide ;
 *   • RN6–RN9 croisent le CODE avec ce qui le commande : la route refuse
 *     avant de créer la commande, le bouton est bloqué tant que les deux
 *     saisies ne concordent pas, le vendeur lit le numéro, la base le garde.
 *
 * Mutations éprouvées (toutes passées, journal dans la PR) :
 *   M1  `^[34]\d{7}$` → `^\d{7,8}$` (le fixe passe)          → RN2 rouge
 *   M2  `operateurDouteux` rend `true` sur le bloc 44        → RN4 rouge
 *   M3  la route valide APRÈS l'insertion de la commande     → RN6 rouge
 *   M4  `rechajBloque` n'entre plus dans `disabled`          → RN7 rouge
 *   M5  la policy vendeur perd `o.status = 'paid'`           → RN9 rouge
 */

const ROUTE = readFileSync("app/api/checkout/route.ts", "utf8");
const BOUTON = readFileSync("components/buy-button.tsx", "utf8");
const VENTES = readFileSync("app/mes-ventes/page.tsx", "utf8");
const SQL = readFileSync("supabase/migrations/0099_rechaj_cible_numero.sql", "utf8");

/** Le code exécutable seul : une interdiction ne doit jamais porter sur la prose. */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

test("RN1 — la saisie humaine est acceptée sous toutes ses formes courantes", () => {
  // Ce que les gens tapent vraiment, ou collent depuis leurs contacts.
  for (const brut of [
    "34123456",
    "3412 3456",
    "3412-3456",
    "+509 34123456",
    "+50934123456",
    "00509 3412 3456",
    "(509) 3412-3456",
    " 34123456 ",
  ]) {
    assert.equal(normaliserNumeroHaiti(brut), "34123456", `refusé : « ${brut} »`);
  }
  // Natcom aussi — le module ne connaît pas d'opérateur, seulement des chiffres.
  assert.equal(normaliserNumeroHaiti("+509 40 12 34 56"), "40123456");
});

test("RN2 — et REFUSE ce qui n'est pas un portable haïtien", () => {
  const refus: [unknown, string][] = [
    ["22345678", "un fixe (préfixe 2) — la faute de frappe la plus banale"],
    ["3412345", "sept chiffres"],
    ["341234567", "neuf chiffres"],
    ["", "vide"],
    ["   ", "espaces"],
    ["abcdefgh", "des lettres"],
    ["+1 305 555 0134", "un numéro étranger"],
    [null, "null"],
    [undefined, "undefined"],
    [34123456, "un nombre, pas une chaîne"],
    [{ msisdn: "34123456" }, "un objet"],
  ];
  for (const [brut, pourquoi] of refus) {
    assert.equal(normaliserNumeroHaiti(brut), null, `accepté à tort : ${pourquoi}`);
  }
  // Le garde de l'indicatif : `509` ne se retire que s'il reste huit chiffres.
  // Sans lui, un jour où un bloc en 5 existerait, le numéro serait amputé.
  assert.equal(normaliserNumeroHaiti("50934123"), null);
});

test("RN3 — l'affichage groupe sans jamais servir à comparer", () => {
  assert.equal(afficherNumero("34123456"), "3412 3456");
  // Une valeur hors forme ressort telle quelle : l'affichage ne corrige rien.
  assert.equal(afficherNumero("abc"), "abc");
  // Et il ne survit pas à un aller-retour : c'est bien de la présentation.
  assert.equal(normaliserNumeroHaiti(afficherNumero("34123456")), "34123456");
});

test("RN4 — l'avertissement se tait sur ce que les sources contredisent", () => {
  // Accord franc des deux relevés : `3x` = Digicel.
  assert.equal(operateurDouteux("34123456", "natcom"), true);
  assert.equal(operateurDouteux("34123456", "digicel"), false);

  // Blocs donnés à Natcom sans contestation.
  for (const bloc of ["40", "41", "42", "43", "47"]) {
    assert.equal(operateurDouteux(`${bloc}123456`, "digicel"), true, `bloc ${bloc}`);
    assert.equal(operateurDouteux(`${bloc}123456`, "natcom"), false, `bloc ${bloc}`);
  }

  /* LE CŒUR DE CE TEST. `44` et `46` sont attribués à Digicel par une source et
     couverts par « 4 = Natcom » dans l'autre. Un avertissement qui se
     déclencherait là serait un FAUX POSITIF sur des numéros légitimes — et
     personne ne le mesurerait jamais, puisque l'acheteur qu'on effraie ne se
     plaint pas, il s'en va. Le silence est donc la bonne réponse, dans les
     DEUX sens. */
  for (const bloc of ["44", "45", "46", "48", "49"]) {
    assert.equal(operateurDouteux(`${bloc}123456`, "digicel"), false, `bloc ${bloc} contesté`);
    assert.equal(operateurDouteux(`${bloc}123456`, "natcom"), false, `bloc ${bloc} contesté`);
  }

  // Sans rayon d'opérateur (fiche rangée au niveau 2), aucun avertissement.
  assert.equal(operateurDouteux("34123456", null), false);
  // Et jamais sur une valeur qui n'a pas passé la normalisation.
  assert.equal(operateurDouteux("22345678", "digicel"), false);
});

test("RN5 — le rayon décide de l'opérateur et de l'existence du champ", () => {
  assert.equal(operateurDuRayon("rechaj-digicel"), "digicel");
  assert.equal(operateurDuRayon("rechaj-natcom"), "natcom");
  // Le niveau 2 exige un numéro mais ne nomme aucun opérateur.
  assert.equal(operateurDuRayon("rechaj-telefon"), null);
  assert.equal(exigeNumero("rechaj-telefon"), true);
  // Et rien d'autre n'ouvre le champ.
  for (const autre of ["ebooks", "otomobil-moto", "dijital-sevis", null, undefined, ""]) {
    assert.equal(exigeNumero(autre), false, `${autre} ne doit pas exiger de numéro`);
    assert.equal(operateurDuRayon(autre), null);
  }
  // Les trois slugs du module sont ceux que la migration ouvre.
  for (const slug of RECHAJ_SLUGS) {
    assert.ok(SQL.includes(`'${slug}'`), `${slug} absent de 0099`);
  }
});

test("RN6 — la route refuse AVANT de créer la commande, et le refus est distinct", () => {
  const code = sansCommentaires(ROUTE);
  const iRefus = code.indexOf("rechaj_numero_invalide");
  const iCommande = code.indexOf('.from("orders")');
  assert.ok(iRefus > 0, "le refus de numéro n'existe pas");
  assert.ok(
    iRefus < iCommande,
    "le refus doit précéder l'insertion de la commande — sinon chaque saisie fautive laisse une commande pending orpheline"
  );

  /* Ce qui COMMANDE, pas ce qui est produit : la valeur normalisée doit venir
     du normaliseur ET conditionner le refus. Un motif qui ne verrait que le
     code d'erreur resterait vert si la validation devenait `if (false)`. */
  assert.match(
    code,
    /rechajNumero = normaliserNumeroHaiti\(rechajInput\)[\s\S]{0,120}if \(!rechajNumero\)[\s\S]{0,200}rechaj_numero_invalide/,
    "le refus doit être lié au résultat de la normalisation"
  );
  // La question est posée à l'ASCENDANCE, jamais au libellé du rayon.
  assert.match(code, /rpc\("zabelie_est_rechaj"/);

  // L'écriture de la cible retire la commande si elle échoue — pas de
  // best-effort ici : une commande payable sans cible est indélivrable.
  assert.match(
    code,
    /from\("zabelie_rechaj_cible"\)[\s\S]{0,200}insert\(\{ order_id: order\.id, msisdn: rechajNumero \}\)[\s\S]{0,240}delete\(\)\.eq\("id", order\.id\)/,
    "l'échec d'écriture de la cible doit retirer la commande"
  );
  // Et elle a lieu AVANT le paiement : rien ne doit être encaissé sans cible.
  assert.ok(
    code.indexOf('from("zabelie_rechaj_cible")') < code.indexOf('from("payments")'),
    "la cible s'écrit avant le paiement"
  );
});

test("RN7 — le bouton reste bloqué tant que les deux saisies ne concordent pas", () => {
  const code = sansCommentaires(BOUTON);
  // La condition, avec sa source : `numeroConcorde` doit venir de la
  // comparaison des DEUX normalisations, pas d'un champ rempli.
  assert.match(
    code,
    /const numeroConcorde = Boolean\(numeroOk && bisOk && numeroOk === bisOk\)/,
    "la concordance doit comparer les deux formes normalisées"
  );
  assert.match(code, /const rechajBloque = Boolean\(rechaj\) && !numeroConcorde/);
  // Les DEUX boutons (rail principal et rails secondaires) sont gardés : un
  // seul des deux laisserait la diaspora payer sans numéro.
  const gardes = code.match(/disabled=\{busy \|\| soldOut \|\| selectedOut \|\| rechajBloque\}/g) ?? [];
  assert.equal(gardes.length, 2, `${gardes.length} bouton(s) gardé(s), 2 attendus`);
  // C'est la forme normalisée qui part au serveur, jamais la saisie brute.
  assert.match(code, /rechajNumero: numeroOk \?\? undefined/);
  // La confirmation ne doit pas être auto-remplie : le navigateur remplirait
  // les deux champs d'un coup et la double saisie ne vérifierait plus rien.
  assert.match(code, /autoComplete="off"/);
});

test("RN8 — le vendeur lit le numéro, avec le client de SESSION", () => {
  const code = sansCommentaires(VENTES);
  assert.match(
    code,
    /supabase\s*\n?\s*\.from\("zabelie_rechaj_cible"\)/,
    "la lecture doit passer par le client de session — un service-role rendrait la policy décorative"
  );
  assert.doesNotMatch(code, /createAdminClient/);
  // Et il est RENDU : une lecture sans affichage serait une commande
  // indélivrable avec la donnée en base.
  assert.match(code, /afficherNumero\(cible\)/);
});

test("RN9 — la base garde le numéro : deux lectures, aucune écriture directe", () => {
  const sql = SQL.replace(/--[^\n]*/g, " ");
  // La fenêtre du vendeur est la commande PAYÉE — pas « une commande ».
  assert.match(
    sql,
    /zabelie_rechaj_cible_seller_read[\s\S]{0,400}p\.seller_id = auth\.uid\(\)[\s\S]{0,80}and o\.status = 'paid'/,
    "le vendeur ne doit lire qu'une commande payée"
  );
  // L'acheteur relit la sienne.
  assert.match(sql, /zabelie_rechaj_cible_buyer_read[\s\S]{0,240}o\.buyer_id = auth\.uid\(\)/);
  // Aucune écriture directe, `update` compris : un numéro modifiable après
  // paiement serait un numéro sur lequel le vendeur ne peut pas s'appuyer.
  assert.match(
    sql,
    /revoke insert, update, delete on zabelie_rechaj_cible from anon, authenticated;/
  );
  // La contrainte de forme est en base aussi, pas seulement en TypeScript.
  assert.match(sql, /msisdn\s+text not null check \(msisdn ~ '\^\[34\]\[0-9\]\{7\}\$'\)/);
  // Et la post-condition vérifie que le `revoke` a PORTÉ — un grant survivant
  // rendrait les deux policies de lecture décoratives.
  assert.match(sql, /role_table_grants[\s\S]{0,400}if v_ecritures <> 0 then/);
});
