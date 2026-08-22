import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { V1_ENDPOINTS } from "../lib/api/v1/schemas";
import { V1_HANDLERS, V1_AUTHENTIFIES } from "../lib/api/v1/handlers";
import { encoderCurseur, decoderCurseur } from "../lib/api/v1/cursor";

/**
 * L'API v1 EST SERVIE — le croisement qui l'a rendue nécessaire, et ceux qui
 * empêchent qu'elle redevienne un décor.
 *
 * ⚠️ CE FICHIER NAÎT D'UN DÉFAUT MESURÉ, pas d'une bonne pratique. Le
 * 2026-08-22, l'inventaire `docs/44` a trouvé neuf endpoints déclarés dans
 * `V1_ENDPOINTS`, 28 tests verts sur leurs contrats… et **aucune route HTTP**.
 * `grep -rn "V1_ENDPOINTS" app/ lib/` ne rendait que la ligne de sa propre
 * déclaration.
 *
 * C'est « le code sans appelant » de `CLAUDE.md` à l'échelle d'une API : un
 * artefact jamais invoqué ne lève rien, ne journalise rien, ne ralentit rien.
 * Les tests de FORME étaient verts et prouvaient une chose vraie et inutile —
 * que des schémas valident ce qu'on leur donne.
 *
 * `tests/api-v1-schemas.test.ts` garde les CONTRATS. Ce fichier-ci garde le
 * CÂBLAGE : que chaque contrat ait un handler, que chaque handler ait un
 * contrat, et que la route soit pilotée par le registre plutôt que par une
 * liste écrite à côté.
 */

const ROUTE = "app/api/v1/[endpoint]/route.ts";

test("V0 — la route existe (c'est très exactement ce qui manquait)", () => {
  assert.ok(
    existsSync(ROUTE),
    "`app/api/v1/[endpoint]/route.ts` a disparu : les neuf contrats redeviennent " +
      "des types que rien ne sert, l'état exact du 2026-08-22."
  );
});

test("V1 — chaque contrat a son handler, ET chaque handler a son contrat", () => {
  const contrats = Object.keys(V1_ENDPOINTS).sort();
  const handlers = Object.keys(V1_HANDLERS).sort();

  /* ⚠️ LES DEUX DIRECTIONS, et la seconde est celle qui coûte.
   *
   * « contrat sans handler » est le défaut qu'on répare aujourd'hui. « handler
   * sans contrat » est le symétrique : un endpoint servi dont ni l'entrée ni
   * la sortie ne seraient validées — c'est-à-dire la seule chose que cette
   * couche existe pour empêcher, réintroduite par la porte de service.
   *
   * Une liste qui ne saurait que grandir deviendrait une conformité par usure
   * (`CLAUDE.md`) : les exemptions se périment dans les DEUX sens. */
  assert.deepEqual(
    handlers,
    contrats,
    "Le registre des contrats et celui des handlers ont divergé.\n" +
      `  contrats sans handler : ${contrats.filter((c) => !handlers.includes(c)).join(", ") || "aucun"}\n` +
      `  handlers sans contrat : ${handlers.filter((h) => !contrats.includes(h)).join(", ") || "aucun"}`
  );
});

test("V2 — la route est pilotée par le REGISTRE, pas par une liste parallèle", () => {
  const src = readFileSync(ROUTE, "utf8");

  /* La condition, pas le symptôme. Ce qui rend le registre efficace est que la
   * route CONSULTE `V1_ENDPOINTS` pour décider si un nom est servable. Une
   * route qui listerait les endpoints à côté rouvrirait le trou que le
   * registre existe pour fermer — et rien à l'écran ne le dirait. */
  assert.match(
    src,
    /hasOwnProperty\.call\(V1_ENDPOINTS,\s*endpoint\)[\s\S]{0,200}not_found/,
    "la route ne consulte plus V1_ENDPOINTS pour filtrer les noms servables : " +
      "un endpoint hors registre pourrait être servi sans validation"
  );
  assert.match(
    src,
    /V1_ENDPOINTS\[nom\]/,
    "les schémas ne sont plus tirés du registre"
  );
});

test("V3 — la SORTIE est validée, et son échec RETIENT la réponse", () => {
  const src = readFileSync(ROUTE, "utf8");

  /* ⚠️ C'EST LA PROMESSE ENTIÈRE DE CETTE COUCHE. L'en-tête de `schemas.ts` la
   * formule : « un `select` qui renvoie une colonne en moins, une migration non
   * appliquée […] le type reste vrai sur le papier et la réponse part quand
   * même ».
   *
   * L'assertion porte donc sur la LIAISON — le parse de sortie ÉCHOUE et cela
   * commande un refus — et non sur la présence de `safeParse`, qui pourrait
   * rester dans le fichier avec son résultat ignoré. Un garde supprimé et un
   * garde dont on jette le résultat laissent le même texte. */
  assert.match(
    src,
    /const sortie = schemaSortie\.safeParse\(resultat\)[\s\S]{0,120}if \(!sortie\.success\)[\s\S]{0,400}return erreur\("internal"/,
    "la sortie n'est plus validée, ou son échec ne retient plus la réponse — " +
      "une forme non conforme partirait comme un fait"
  );
});

test("V4 — les endpoints authentifiés sont un sous-ensemble RÉEL des handlers", () => {
  for (const nom of V1_AUTHENTIFIES) {
    assert.ok(
      nom in V1_HANDLERS,
      `« ${nom} » est déclaré authentifié mais n'existe pas : la liste est périmée`
    );
  }
  // Et les deux qu'on attend y sont : une liste vide passerait le test ci-dessus
  // sans rien garder — c'est le « aucun cas » indiscernable de « aucun cas
  // possible » (`CLAUDE.md`).
  assert.ok(V1_AUTHENTIFIES.has("get_order"));
  assert.ok(V1_AUTHENTIFIES.has("get_user_orders"));
  assert.equal(V1_AUTHENTIFIES.size, 2, "la liste des endpoints authentifiés a changé");
});

test("V5 — les deux endpoints de commande filtrent sur buyer_id, PAS seulement la RLS", () => {
  /* ⚠️ MESURÉ AVANT D'ÉCRIRE LE CODE, et c'est le piège de ce chantier :
   * `orders_seller_read` (`0002_rls.sql:55`) autorise un VENDEUR à lire les
   * commandes portant sur ses produits. Un `select` sans filtre explicite
   * rendrait donc, pour un vendeur, les commandes de ses acheteurs — sous un
   * schéma documenté « sortie acheteur ».
   *
   * La RLS empêche de lire ce qui ne nous regarde pas ; elle ne dit pas ce
   * qu'on a demandé. */
  const src = readFileSync("lib/api/v1/handlers.ts", "utf8");
  const occurrences = src.match(/\.eq\("buyer_id",\s*userId\)/g) ?? [];
  assert.equal(
    occurrences.length,
    2,
    `filtre \`buyer_id\` attendu deux fois (get_order et get_user_orders), vu ${occurrences.length}. ` +
      "Sans lui, la RLS vendeur laisse passer les commandes des acheteurs."
  );
});

test("V6 — l'auteur d'un avis n'est jamais lu", () => {
  /* Ne pas le SÉLECTIONNER vaut mieux que le sélectionner puis penser à ne pas
   * le rendre. `product_reviews` porte un `order_id` unique : exposer l'auteur
   * reviendrait à publier qui a acheté quoi. */
  const src = readFileSync("lib/api/v1/handlers.ts", "utf8");
  const i = src.indexOf('.from("product_reviews")');
  assert.ok(i > -1, "la lecture des avis a disparu");
  const bloc = src.slice(i, i + 400);
  assert.ok(
    !/buyer_id/.test(bloc),
    "`buyer_id` est demandé dans la lecture des avis — publier l'auteur d'un " +
      "avis revient à publier qui a acheté quoi"
  );
});

// ── Le curseur, éprouvé sur ses deux faces ──────────────────────────────────

test("V7 — le curseur fait l'aller-retour (connu-positif)", () => {
  const cle = { t: "2026-08-22T02:38:08.869Z", i: "c797080d-396a-415c-ae83-86a052f069c1" };
  assert.deepEqual(decoderCurseur(encoderCurseur(cle)), cle);
});

test("V8 — un curseur corrompu rend null, il ne repart PAS du début", () => {
  /* ⚠️ LE CAS QUI COMPTE. Un curseur illisible qu'on ignorerait silencieusement
   * renverrait la PREMIÈRE page : l'appelant croit avancer, reçoit
   * indéfiniment le même début, et rien dans la réponse ne le lui dit. C'est
   * la boucle infinie silencieuse — l'échec qui se présente comme une
   * réussite, classe dominante de ce dépôt. */
  for (const mauvais of [
    "pas-du-base64!!",
    Buffer.from("null", "utf8").toString("base64url"),
    Buffer.from('{"t":"pas-une-date","i":"c797080d-396a-415c-ae83-86a052f069c1"}').toString("base64url"),
    Buffer.from('{"t":"2026-08-22T00:00:00.000Z","i":"pas-un-uuid"}').toString("base64url"),
    Buffer.from('{"t":"2026-08-22T00:00:00.000Z"}').toString("base64url"),
  ]) {
    assert.equal(decoderCurseur(mauvais), null, `accepté à tort : ${mauvais}`);
  }
});

test("V9 — le handler REFUSE un curseur corrompu au lieu de l'ignorer", () => {
  const src = readFileSync("lib/api/v1/handlers.ts", "utf8");
  /* La liaison : c'est l'échec du décodage qui commande le refus. Chercher
   * `invalid_input` seul serait vert même si le garde devenait inatteignable. */
  assert.match(
    src,
    /const cle = decoderCurseur\(curseur\);[\s\S]{0,80}if \(!cle\)[\s\S]{0,200}invalid_input/,
    "un curseur illisible n'est plus refusé — il repartirait de la première page"
  );
});
