import test from "node:test";
import assert from "node:assert/strict";
import { MIGRATIONS_REQUISES, verifierSchemaRequis } from "../lib/schema-requis";
import { isMissingFunction } from "../lib/pg-errors";

const AUTRES = [
  { filename: "0042_order_ref.sql" },
  { filename: "0045_profile_on_signup.sql" },
];
const AVEC_0046 = [...AUTRES, { filename: "0046_policy_acceptance.sql" }];

test("journal complet → ok", () => {
  const v = verifierSchemaRequis({ lignes: AVEC_0046 });
  assert.equal(v.statut, "ok");
});

/**
 * Le cas qui justifie tout le contrôle : `0046` absente, donc AUCUNE fiche
 * ne peut être créée — et on veut le savoir avant qu'un vendeur l'apprenne.
 */
test("0046 absente → manquant, nommée, avec la conséquence", () => {
  const v = verifierSchemaRequis({ lignes: AUTRES });
  assert.equal(v.statut, "manquant");
  assert.deepEqual(
    v.statut === "manquant" ? v.manquantes : [],
    ["0046_policy_acceptance.sql"],
  );
  assert.match(
    v.statut === "manquant" ? v.message : "",
    /création de fiche/,
    "le message doit dire ce qui casse, pas seulement ce qui manque",
  );
});

/**
 * Le troisième état. Rendre « ok » sur une lecture ratée transformerait une
 * panne de sonde en feu vert — l'erreur exacte que ce dépôt a déjà commise.
 */
test("lecture impossible → indéterminé, JAMAIS ok", () => {
  assert.equal(
    verifierSchemaRequis({ lignes: null, erreur: { message: "permission denied" } }).statut,
    "indetermine",
  );
  assert.equal(verifierSchemaRequis({ lignes: null }).statut, "indetermine");

  // Le cas qui ISOLE la branche « erreur » : des lignes lisibles ET une
  // erreur. Sans lui, la branche `lignes === null` rattrape tout et on peut
  // retirer le test d'erreur sans qu'aucun test ne rougisse — c'est ce qui
  // s'est produit à la première écriture de ce fichier.
  assert.equal(
    verifierSchemaRequis({ lignes: [], erreur: { message: "lecture partielle" } }).statut,
    "indetermine",
    "une lecture partielle ne doit pas être conclue comme « manquant »",
  );
});

test("journal vide mais lisible → manquant, pas indéterminé", () => {
  // Ce n'est pas une panne : aucune migration enregistrée signifie bien
  // qu'aucune n'est appliquée.
  const v = verifierSchemaRequis({ lignes: [] });
  assert.equal(v.statut, "manquant");
});

test("la liste des requises ne contient que du bloquant", () => {
  // `0045` et `0047` dégradent en silence : les y mettre ferait crier le
  // contrôle pour des cas où rien ne casse, et on cesserait de le lire.
  const fichiers = MIGRATIONS_REQUISES.map((m) => m.fichier);
  assert.equal(fichiers.includes("0045_profile_on_signup.sql"), false);
  assert.equal(fichiers.includes("0047_search_demand.sql"), false);
  assert.ok(fichiers.includes("0046_policy_acceptance.sql"));
});

/**
 * Détection par CODE et non par texte : un message change avec la version ou
 * la locale du serveur, et il change en silence.
 */
test("fonction absente reconnue par ses deux codes, jamais par le message", () => {
  assert.equal(isMissingFunction({ code: "42883" }), true, "code PostgreSQL");
  assert.equal(isMissingFunction({ code: "PGRST202" }), true, "code PostgREST");
  assert.equal(isMissingFunction({ code: "42703" }), false, "colonne absente ≠ fonction");
  assert.equal(isMissingFunction({ code: "23505" }), false);
  assert.equal(isMissingFunction(null), false);
  assert.equal(isMissingFunction(undefined), false);
  assert.equal(
    isMissingFunction({ code: "" } as { code: string }),
    false,
    "un code vide ne doit pas passer pour une fonction absente",
  );
});
