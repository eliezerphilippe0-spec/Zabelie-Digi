import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { MESSAGE_MAX } from "../lib/messagerie";

/**
 * MESSAGERIE (0090) — les croisements, pas la relecture.
 *
 * Ce fichier garde ce qu'un test SQL ne peut pas voir et ce qu'une relecture
 * ne rattrape jamais : que la borne applicative SUIVE la contrainte de base,
 * et que le chemin d'entrée EXISTE.
 *
 * Les policies elles-mêmes sont éprouvées sous vrais rôles dans
 * `supabase/tests/messagerie.test.sql` — onze cas, dont sept connus-négatifs.
 */

const MIG = "supabase/migrations/0090_messagerie.sql";
const ROUTE = "app/api/messages/route.ts";

test("M1 — la borne applicative SUIT la contrainte SQL", () => {
  /* ⚠️ DEUX BORNES EXISTENT, ET C'EST VOULU : celle de `lib/messagerie.ts`
   * rend une phrase lisible, celle de la base tient face à n'importe quel
   * appelant. Les laisser diverger reproduirait le défaut du 2026-08-22 — une
   * contrainte Postgres brute à l'écran d'un vendeur.
   *
   * Le croisement porte sur le NOMBRE écrit dans le SQL, pas sur une constante
   * partagée : le SQL ne peut pas importer TypeScript, donc c'est ici que le
   * lien se vérifie ou nulle part. */
  const sql = readFileSync(MIG, "utf8");
  const m = sql.match(/length\(btrim\(body\)\)\s+between\s+1\s+and\s+(\d+)/);
  assert.ok(m, "la contrainte de longueur du corps a disparu de 0090");
  assert.equal(
    Number(m![1]),
    MESSAGE_MAX,
    `0090 borne le corps à ${m![1]}, MESSAGE_MAX vaut ${MESSAGE_MAX} — ` +
      "un message accepté à l'écran serait refusé par la base, ou l'inverse"
  );
});

test("M2 — le point d'entrée EXISTE sur la fiche produit", () => {
  /* LE croisement qui compte, et il naît d'un défaut mesuré : `docs/44` a
   * trouvé neuf endpoints v1 prouvés par 28 tests et servis par AUCUNE route.
   * Une messagerie sans point d'entrée serait le même artefact, une couche
   * plus haut — des tables, une route, deux écrans, et personne pour y entrer.
   *
   * L'assertion porte sur le MONTAGE du composant, pas sur un libellé : une
   * frontière explicite (`<MessageForm` suivi d'un espace ou d'un `>`), sinon
   * un renommage en `MessageFormOff` la laisserait verte — le piège de
   * sous-chaîne de `CLAUDE.md`. */
  const fiche = readFileSync("app/produit/[slug]/page.tsx", "utf8");
  assert.match(
    fiche,
    /<MessageForm[\s>]/,
    "la fiche produit ne monte plus MessageForm : la messagerie devient " +
      "inatteignable depuis le seul écran où la question se pose"
  );
  assert.match(
    fiche,
    /productId=\{product\.id\}/,
    "MessageForm ne reçoit plus l'identifiant du produit"
  );
});

test("M3 — la boîte et le fil existent, et la navigation y mène", () => {
  assert.ok(existsSync("app/messages/page.tsx"), "la boîte a disparu");
  assert.ok(existsSync("app/messages/[id]/page.tsx"), "l'écran de fil a disparu");
  const nav = readFileSync("components/site-nav.tsx", "utf8");
  assert.match(
    nav,
    /href="\/messages"/,
    "aucun lien vers /messages dans la navigation — un écran sans porte n'existe pas"
  );
});

test("M4 — la route ne réimplémente AUCUN garde d'autorisation", () => {
  /* ⚠️ ASSERTION INVERSÉE, et c'est délibéré : on vérifie une ABSENCE.
   *
   * Les invariants de `0090` vivent dans les policies. Les recopier dans la
   * route créerait deux versions d'une même règle, et c'est toujours la copie
   * applicative qui reste en arrière. Le jour où quelqu'un « renforce » la
   * route en y ajoutant un contrôle de participation, ce test le lui dira —
   * non pas que le contrôle soit faux, mais qu'il appartient à la base.
   *
   * On tolère `seller_id === user.id` : ce n'est pas une autorisation mais un
   * MESSAGE lisible, doublé par `check (buyer_id <> seller_id)`. */
  const src = readFileSync(ROUTE, "utf8");
  assert.ok(
    !/buyer_id.*===.*user\.id|user\.id.*===.*buyer_id/.test(src),
    "la route compare buyer_id à l'appelant : cette règle appartient à la " +
      "policy `zabelie_messages_send`, pas au code"
  );
  // Et le client de SESSION est bien celui qui écrit — c'est lui qui déclenche
  // la RLS. Un `createAdminClient()` sur l'insertion la contournerait
  // entièrement, en silence.
  assert.match(
    src,
    /supabase\s*\n?\s*\.from\("zabelie_messages"\)\s*\n?\s*\.insert/,
    "l'insertion ne passe plus par le client de session : la RLS serait " +
      "contournée et les policies de 0090 ne protégeraient plus rien"
  );
});

test("M5 — le rappel anti-désintermédiation est TOUJOURS rendu", () => {
  /* La seule mesure prise contre la désintermédiation (`0090` §5) est
   * informative. Si elle disparaît, il ne reste rien — et le risque, lui,
   * touche l'argent : un règlement de la main à la main fait perdre l'escrow à
   * l'acheteur et la commission à la plateforme.
   *
   * L'assertion porte sur le rendu INCONDITIONNEL : un `{premierMessage && …}`
   * ne préviendrait que ceux qui n'en ont pas encore besoin. */
  const form = readFileSync("components/message-form.tsx", "utf8");
  const i = form.indexOf("{labels.warn}");
  assert.ok(i > -1, "le rappel `labels.warn` n'est plus rendu du tout");

  /* ⚠️ CETTE ASSERTION A ÉTÉ RÉÉCRITE APRÈS AVOIR ÉCHOUÉ À SA PROPRE MUTATION,
   * le 2026-08-22. La première version cherchait la balise complète :
   *
   *     assert.match(form, /<p className="…">\{labels\.warn\}<\/p>/)
   *
   * Elle est restée VERTE quand le rappel a été enveloppé dans
   * `{envoye && …}` — la sous-chaîne survit intacte à l'ajout d'une
   * condition. C'est le piège que `CLAUDE.md` décrit, commis en écrivant le
   * test censé s'en prémunir : un garde SUPPRIMÉ et un garde rendu
   * CONDITIONNEL laissent le même texte dans le fichier.
   *
   * ⚠️ ET LA SECONDE VERSION A ÉCHOUÉ AUSSI. Elle regardait les quarante
   * caractères précédents ; `{envoye && <p className="mt-3 text-xs text-mist">`
   * en fait quarante-huit. Trop court de huit caractères, et rien ne le
   * disait — le test restait vert.
   *
   * Deux essais ratés sur le même garde, tous deux RAISONNÉS puis démentis par
   * la mutation. On ne devine donc plus une distance : on prend la LIGNE qui
   * porte le rendu, plus la précédente. Une condition JSX vit dans l'une des
   * deux.
   *
   * ⚠️ Limite assumée, écrite plutôt que découverte : une condition étalée sur
   * TROIS lignes y échapperait. C'est un garde, pas une preuve. */
  const zone = form.slice(0, i).split("\n").slice(-2).join("\n");
  assert.ok(
    !/&&|\?/.test(zone),
    "le rappel `labels.warn` est devenu CONDITIONNEL — il ne préviendrait " +
      "plus que ceux qui n'en ont pas encore besoin. C'est la seule mesure " +
      "prise contre la désintermédiation (0090 §5) ; sans elle il ne reste rien."
  );
});

test("M6 — le corps du message n'entre PAS dans le courriel", () => {
  /* Un texte écrit par un inconnu, relayé tel quel dans un e-mail signé
   * Zabelie, est une surface d'hameçonnage offerte. Le courriel dit qu'il se
   * passe quelque chose ; le fil dit quoi. */
  const notify = readFileSync("lib/messagerie-notify.ts", "utf8");
  assert.ok(
    !/\bbody\b/.test(notify.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ")),
    "le corps du message est lu dans la notification — il ne doit jamais " +
      "voyager dans un e-mail au nom de Zabelie"
  );
  // Le titre du produit, lui, y entre — donc il est échappé.
  assert.match(
    notify,
    /echapper\(input\.productTitle\)/,
    "le titre du produit n'est plus échappé : il est écrit par un vendeur"
  );
});

test("M7 — 0090 porte son préambule de garde", () => {
  /* ⚠️ CE TEST A ÉTÉ RÉÉCRIT LE 2026-08-22, DANS L'HEURE QUI A SUIVI SON
   * ÉCRITURE, et le motif vaut plus que le correctif.
   *
   * Il assertait `ÉTAT : RÉDIGÉE, NON APPLIQUÉE`. `0090` a été appliquée en
   * production à 19:33:46 UTC — et l'assertion est restée VERTE, parce que le
   * fichier ne peut PAS changer : son empreinte est au registre, et une
   * migration appliquée ne se réécrit jamais.
   *
   * Le test attestait donc une affirmation devenue fausse, sans aucun moyen de
   * s'en apercevoir. C'est la forme la plus pure du défaut de ce dépôt : un
   * vert qui décrit le passé.
   *
   * La règle est déjà écrite dans `CLAUDE.md` et je l'avais sous les yeux :
   * « L'état ne se raconte plus, il s'interroge. » L'en-tête d'une migration
   * est une NOTE HISTORIQUE — `0087` porte la même mention et tourne en
   * production depuis dix-sept heures. Le seul état qui fasse foi est celui
   * du registre :
   *
   *     select statut, preuve from zabelie_schema_migrations
   *      where filename = '0090_messagerie.sql';
   *
   * Ce qui reste vérifiable ICI, et qui compte : le préambule de garde. Sans
   * lui, la migration serait rejouable en silence — et un rejeu de `0090`
   * échouerait sur `create table`, ce qui est le bon comportement mais pour la
   * mauvaise raison. */
  const sql = readFileSync(MIG, "utf8");
  assert.match(
    sql,
    /^select zabelie_migration_garde\('0090_messagerie\.sql'\);/,
    "le préambule de garde manque, ou n'est plus en PREMIÈRE ligne : la " +
      "migration serait rejouable, et le garde ne verrait rien"
  );
});
