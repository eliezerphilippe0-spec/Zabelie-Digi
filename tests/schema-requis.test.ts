import test from "node:test";
import assert from "node:assert/strict";
import {
  MIGRATIONS_REQUISES,
  OBJETS_MEDIAS_0152,
  verdictObjets,
  verifierSchemaRequis,
  verifierPresenceObjets,
} from "../lib/schema-requis";
import { isMissingFunction } from "../lib/pg-errors";

const AUTRES = [
  { filename: "0042_order_ref.sql" },
  { filename: "0045_profile_on_signup.sql" },
  { filename: "0151_zabelie_stripe_disputes.sql" },
  { filename: "0152_zabelie_product_media_review.sql" },
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
  // Ce n'est pas une panne : les dépendances ne sont pas déclarées au registre.
  // Cela ne constitue pas une observation des objets réellement présents.
  const v = verifierSchemaRequis({ lignes: [] });
  assert.equal(v.statut, "manquant");
});

test("la liste des requises ne contient que du bloquant", () => {
  // `0045` et `0047` dégradent en silence : les y mettre ferait crier le
  // contrôle pour des cas où rien ne casse, et on cesserait de le lire.
  // Élargi en `string[]` : `as const` donne un type littéral, et `.includes`
  // d'une valeur absente de l'union devient une ERREUR DE COMPILATION au lieu
  // d'un test. C'est précisément ce qu'on veut vérifier à l'exécution.
  const fichiers: string[] = MIGRATIONS_REQUISES.map((m) => m.fichier);
  assert.equal(fichiers.includes("0045_profile_on_signup.sql"), false);
  assert.equal(fichiers.includes("0047_search_demand.sql"), false);
  assert.ok(fichiers.includes("0046_policy_acceptance.sql"));
  assert.ok(fichiers.includes("0151_zabelie_stripe_disputes.sql"));
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

/**
 * Le registre DÉCLARE, `zabelie_objets_requis()` CONSTATE. La distinction
 * n'est pas théorique : seule `0041` s'inscrit au registre, les autres
 * migrations y sont ajoutées à la main. Une restauration partielle ou un
 * retour arrière produit donc « ligne présente, fonction absente ».
 */
test("le CONSTAT prime sur la DÉCLARATION", () => {
  const v = verdictObjets({
    objets: [
      {
        objet: "zabelie_record_policy_acceptance(uuid, text)",
        present: false,
        pourquoi: "toute création de fiche échoue",
      },
    ],
    // Le registre, lui, affirme que tout est appliqué. C'est le cas
    // vert-mais-cassé qu'on ferme.
    lignesRegistre: [{ filename: "0046_policy_acceptance.sql" }],
  });
  assert.equal(v.source, "présence");
  assert.equal(v.statut, "manquant");
  assert.match(v.message, /création de fiche/);
});

test("tous les objets présents → ok, par constat", () => {
  const v = verdictObjets({
    objets: OBJETS_COMPLETS,
    lignesRegistre: [],
  });
  assert.equal(v.source, "présence");
  assert.equal(v.statut, "ok");
});

test("0048 non appliquée → repli sur le registre, ÉTIQUETÉ comme tel", () => {
  const v = verdictObjets({
    objets: null,
    erreurObjets: { message: "function does not exist" },
    lignesRegistre: JOURNAL_0151,
  });
  assert.equal(v.source, "registre", "le repli doit se déclarer");
  assert.equal(v.statut, "indetermine");
  assert.match(
    v.message,
    /repli sur le registre/,
    "un contrôle qui ne dit pas à quelle question il a répondu rassure sans informer",
  );
});

test("ni constat ni registre → indéterminé, jamais ok", () => {
  const v = verdictObjets({
    objets: null,
    erreurObjets: { message: "absent" },
    lignesRegistre: null,
    erreurRegistre: { message: "permission denied" },
  });
  assert.equal(v.statut, "indetermine");
});

const OBJETS_0151 = [
  "zabelie_record_stripe_dispute(text,text,text,text,text,text,bigint,text,boolean)",
  "zabelie_stripe_dispute_event_immutable()",
  "zabelie_stripe_dispute_events",
  "zabelie_stripe_dispute_event_immutable",
  "zabelie_stripe_dispute_event_no_truncate",
  "escrow_entries.dispute_frozen_at",
  "zabelie_operations_config.stripe_dispute_freeze_enabled",
].map((objet) => ({ objet, present: true, pourquoi: "dépendance Stripe 0151" }));
const JOURNAL_0151 = AVEC_0046;
const OBJETS_COMPLETS = [...OBJETS_0151, ...OBJETS_MEDIAS_0152.map((objet) => ({ objet, present: true, pourquoi: "revue des médias 0152" }))];

test("0151 : une ancienne sonde entièrement verte ne constate pas les nouveaux objets", () => {
  const v = verdictObjets({
    objets: [{ objet: "fonction_historique()", present: true, pourquoi: "ancienne sonde" }],
    lignesRegistre: JOURNAL_0151,
  });
  assert.equal(v.source, "présence");
  assert.equal(v.statut, "indetermine");
  assert.match(v.message, /0151/);
  assert.match(v.message, /non vérifi|incomplète/);
});

test("0151 : chaque dépendance omise reste non vérifiée, même si le registre la déclare", () => {
  for (const objet of OBJETS_0151) {
    const v = verdictObjets({
      objets: OBJETS_COMPLETS.filter((row) => row.objet !== objet.objet),
      lignesRegistre: JOURNAL_0151,
    });
    assert.equal(v.statut, "indetermine", objet.objet);
    assert.ok(v.message.includes(objet.objet), objet.objet);
  }
});

test("0151 : une dépendance explicitement absente est distinguée d'une sonde incomplète", () => {
  const v = verdictObjets({
    objets: [{ ...OBJETS_0151[0], present: false }],
    lignesRegistre: JOURNAL_0151,
  });
  assert.equal(v.statut, "manquant");
  assert.ok(v.message.includes(OBJETS_0151[0].objet));
});

test("0151 : une erreur avec des lignes présentes interdit de conclure au constat", () => {
  const v = verdictObjets({
    objets: OBJETS_0151,
    erreurObjets: { message: "réponse partielle" },
    lignesRegistre: JOURNAL_0151,
  });
  assert.equal(v.statut, "indetermine");
  assert.match(v.message, /non vérifi/);
});

test("0151 : le registre complet seul ne prouve pas la présence des objets", () => {
  const v = verdictObjets({ objets: null, lignesRegistre: JOURNAL_0151 });
  assert.equal(v.source, "registre");
  assert.equal(v.statut, "indetermine");
  assert.match(v.message, /non vérifi/);
});

test("0151 : son absence du registre est nommée sans prétendre observer la base", () => {
  const v = verifierSchemaRequis({ lignes: AVEC_0046.filter((row) => row.filename !== "0151_zabelie_stripe_disputes.sql") });
  assert.equal(v.statut, "manquant");
  assert.deepEqual(v.statut === "manquant" ? v.manquantes : [], ["0151_zabelie_stripe_disputes.sql"]);
});

test("0151 : le constat complet prime sur un registre indisponible", () => {
  const v = verdictObjets({
    objets: OBJETS_COMPLETS,
    lignesRegistre: null,
    erreurRegistre: { message: "registre indisponible" },
  });
  assert.equal(v.source, "présence");
  assert.equal(v.statut, "ok");
});

test("0151 : un objet historique absent garde son diagnostic", () => {
  const v = verdictObjets({
    objets: [...OBJETS_0151, { objet: "fonction_historique()", present: false, pourquoi: "fonction métier indisponible" }],
    lignesRegistre: JOURNAL_0151,
  });
  assert.equal(v.statut, "manquant");
  assert.match(v.message, /fonction_historique\(\).*fonction métier indisponible/);
});

test("une garde de route vérifie uniquement son sous-ensemble, sans exiger Stripe", () => {
  const objet = "garde_media_synthetique()";
  const requis = [objet];
  assert.equal(verifierPresenceObjets({ objets: [{ objet, present: true, pourquoi: "test" }], requis }).statut, "ok");
  assert.equal(verifierPresenceObjets({ objets: OBJETS_0151, requis }).statut, "indetermine");
  assert.equal(verifierPresenceObjets({ objets: [{ objet, present: false, pourquoi: "test" }], requis }).statut, "manquant");
  assert.equal(verifierPresenceObjets({ objets: null, requis }).statut, "indetermine");
  assert.equal(verifierPresenceObjets({ objets: [{ objet, present: true, pourquoi: "test" }], erreur: { message: "partielle" }, requis }).statut, "indetermine");
});

test("un sous-ensemble non booléen ou dupliqué reste indéterminé", () => {
  const objet = "garde_media_synthetique()";
  const requis = [objet];
  const ligne = { objet, present: true, pourquoi: "test" };
  assert.equal(verifierPresenceObjets({ objets: [ligne, ligne], requis }).statut, "indetermine");
  assert.equal(verifierPresenceObjets({ objets: [{ ...ligne, present: null as unknown as boolean }], requis }).statut, "indetermine");
});

test("0152 : une sonde 0151 complète ne prouve pas les gardes de revue média", () => {
  const v = verdictObjets({ objets: OBJETS_0151, lignesRegistre: JOURNAL_0151 });
  assert.equal(v.statut, "indetermine");
  assert.match(v.message, /0152/);
});

test("0152 : la dépendance média doit être déclarée au registre", () => {
  const v = verifierSchemaRequis({ lignes: AVEC_0046.filter((row) => row.filename !== "0152_zabelie_product_media_review.sql") });
  assert.equal(v.statut, "manquant");
  assert.deepEqual(v.statut === "manquant" ? v.manquantes : [], ["0152_zabelie_product_media_review.sql"]);
});

test("0152 : chaque garde omise reste indéterminée et une route n'exige pas Stripe", () => {
  for (const objet of OBJETS_MEDIAS_0152) {
    const v = verdictObjets({ objets: OBJETS_COMPLETS.filter((row) => row.objet !== objet), lignesRegistre: JOURNAL_0151 });
    assert.equal(v.statut, "indetermine");
    assert.ok(v.message.includes(objet));
  }
  assert.equal(verifierPresenceObjets({
    objets: OBJETS_MEDIAS_0152.map((objet) => ({ objet, present: true, pourquoi: "test" })),
    requis: OBJETS_MEDIAS_0152,
  }).statut, "ok");
});
