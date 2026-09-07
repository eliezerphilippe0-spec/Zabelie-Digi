import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * L'INTERRUPTEUR « COMPTE D'ESSAI » DANS `/admin`.
 *
 * `0101` a posé la marque en base ; elle ne se posait qu'en SQL. Cet
 * interrupteur la rend utilisable — et trois propriétés font la différence
 * entre un bouton et un bouton sûr :
 *
 *   • il atteint TOUS les comptes, pas seulement les vendeurs. Ruby, le compte
 *     acheteur des essais, a le rôle `buyer` : une section filtrée sur
 *     `creator` ne l'aurait jamais montrée, et la moitié du sujet serait restée
 *     hors de portée ;
 *   • chaque bascule est TRACÉE au journal d'audit append-only — « pourquoi mes
 *     fiches ont-elles disparu ? » doit avoir une réponse datée ;
 *   • le compte est vérifié en base AVANT d'écrire, et un rejeu est un succès.
 *
 * Mutations éprouvées (toutes passées, journal dans la PR) :
 *   AC1  la requête des comptes refiltrée sur `role = 'creator'`   → rouge
 *   AC2  le journal d'audit retiré de la route                     → rouge
 *   AC3  `typeof isTest === "boolean"` remplacé par une conversion → rouge
 *   AC4  le comptage des fiches publiées fait par une JOINTURE     → rouge
 */

const ROUTE = readFileSync("app/api/admin/account-test/route.ts", "utf8");
const PAGE = readFileSync("app/admin/page.tsx", "utf8");
const LIGNE = readFileSync("components/admin-test-account-row.tsx", "utf8");

/** Le code exécutable seul : une interdiction ne doit pas porter sur la prose. */
const sansCommentaires = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

test("AC1 — l'interrupteur atteint TOUS les rôles, pas seulement les vendeurs", () => {
  const code = sansCommentaires(PAGE);

  /* Ce qui COMMANDE : la requête qui alimente la section ne doit porter AUCUN
     filtre de rôle. Un motif qui vérifierait seulement « la section existe »
     resterait vert si elle était filtrée sur `creator` — et Ruby, avec son
     rôle `buyer`, serait invisible sans qu'aucune erreur ne le dise. */
  const i = code.indexOf('.select("id, display_name, role, is_test")');
  assert.ok(i > 0, "la requête des comptes d'essai n'existe pas");

  // La fenêtre entre le `select` et la fin de la requête ne contient pas de
  // filtre de rôle. Bornée à la requête : la LIGNE au-dessus, elle, filtre
  // légitimement sur `creator` — c'est celle de la modération vendeur.
  const requete = code.slice(i, i + 320);
  assert.doesNotMatch(
    requete,
    /\.eq\("role"/,
    "la liste des comptes d'essai ne doit filtrer aucun rôle — le compte acheteur d'essai serait hors de portée",
  );

  // Et la section rend bien une ligne par compte.
  assert.match(code, /comptes\.map\(\(c\) => \(\s*<AdminTestAccountRow/);
  assert.match(code, /isTest=\{c\.is_test\}/);
});

test("AC2 — chaque bascule est écrite au journal d'audit, dans les deux sens", () => {
  const code = sansCommentaires(ROUTE);

  /* La liaison : l'action journalisée doit DÉPENDRE du sens de la bascule.
     Un `action: "user.mark_test"` en dur passerait un motif qui ne cherche que
     la présence de `journaliserActeAdmin`, tout en écrivant « marqué » quand
     on démarque. */
  assert.match(
    code,
    /journaliserActeAdmin\(admin, \{[\s\S]{0,200}action: isTest \? "user\.mark_test" : "user\.unmark_test"/,
    "l'action journalisée doit suivre le sens de la bascule",
  );
  // La forme `domaine.verbe` est une contrainte SQL de 0055 : une action qui
  // ne la respecte pas est refusée en base, et la trace est perdue.
  for (const acte of ["user.mark_test", "user.unmark_test"]) {
    assert.match(acte, /^[a-z_]+\.[a-z_]+$/, `${acte} viole la forme domaine.verbe de 0055`);
  }
  // Réservé à l'admin.
  assert.match(code, /me\.role !== "admin"[\s\S]{0,120}api\.access\.denied/);
});

test("AC3 — le booléen est STRICT : « false » et 0 sont des appels malformés", () => {
  const code = sansCommentaires(ROUTE);

  /* Une conversion (`Boolean(body.isTest)`, `!!body.isTest`) transformerait la
     chaîne « false » en `true` et le nombre 0 en `false` : un client fautif
     démarquerait un compte en croyant le marquer, sans erreur. Le refus doit
     porter sur le TYPE. */
  assert.match(
    code,
    /typeof body\.isTest !== "boolean"[\s\S]{0,120}api\.params\.invalid/,
    "le type doit être vérifié, pas converti",
  );
  assert.doesNotMatch(code, /Boolean\(body\.isTest\)|!!body\.isTest/);

  // Le rejeu est un SUCCÈS : un double clic sur une connexion qui coupe est le
  // cas normal, pas une faute.
  assert.match(code, /cible\.is_test === isTest[\s\S]{0,120}duplicate: true/);

  // Et le client envoie bien un booléen, pas une chaîne.
  assert.match(sansCommentaires(LIGNE), /isTest: versEssai/);
});

test("AC4 — le compte de fiches publiées ne passe par AUCUNE jointure", () => {
  const code = sansCommentaires(PAGE);

  /* C'est le défaut que `docs/48` décrit dans son « Comment lire ce document »,
     et que j'ai commis hier EN LE DÉCRIVANT : une jointure profils×produits
     multiplie les lignes et gonfle le total. Ici la requête est plate et le
     comptage se fait en mémoire. */
  const i = code.indexOf('.from("products")\n        .select("seller_id")');
  assert.ok(i > 0, "la requête plate des fiches publiées n'existe pas");
  assert.match(
    code.slice(i, i + 220),
    /\.eq\("status", "published"\)/,
    "seules les fiches PUBLIÉES comptent — ce sont elles qui disparaissent",
  );
  // Le comptage additionne des lignes plates, il ne lit pas un agrégat SQL.
  assert.match(
    code,
    /publieesParVendeur\.set\(r\.seller_id, \(publieesParVendeur\.get\(r\.seller_id\) \?\? 0\) \+ 1\)/,
  );
  // Et le chiffre atteint l'écran : sans lui, « marquer Bebeto » ne dit pas ce
  // que ça coûte.
  assert.match(code, /publiees=\{publieesParVendeur\.get\(c\.id\) \?\? 0\}/);
});

test("AC5 — la confirmation dit ce qui va se passer, et nomme votre propre compte", () => {
  const code = sansCommentaires(LIGNE);
  // Le nombre de fiches est DANS la question posée, pas seulement à l'écran.
  assert.match(code, /publiees > 0[\s\S]{0,160}quitteront le catalogue public/);
  assert.match(code, /publiees > 0[\s\S]{0,160}réapparaîtront dans le catalogue public/);
  // Marquer son propre compte est permis — mais jamais silencieux.
  assert.match(code, /cestVous \?[\s\S]{0,60}C'est VOTRE compte/);
  assert.match(code, /window\.confirm\(question\)/);
});
