import test from "node:test";
import assert from "node:assert/strict";
import {
  captureActive,
  jourHaiti,
  messageSourcing,
  sessionFingerprint,
} from "../lib/search-demand";

function entetes(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

/** Le poivre est indispensable : sans lui la fonction refuse de répondre. */
process.env.SEARCH_FINGERPRINT_SALT ??= "poivre-de-test-suffisamment-long";

/** Les cas nominaux exigent une empreinte ; `null` y est un échec. */
function empreinte(h: Parameters<typeof sessionFingerprint>[0], d?: Date): string {
  const e = sessionFingerprint(h, d);
  assert.ok(e, "empreinte absente alors qu'un poivre est configuré");
  return e;
}

/**
 * L'empreinte de session est la pièce la plus sensible du lot : elle décide
 * de ce qu'on peut reconstituer sur quelqu'un à partir du journal.
 */
test("l'empreinte ne laisse rien reconstituer de l'entrée", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3, 10.0.0.1", "user-agent": "Mozilla/5.0" });
  const e = empreinte(h, new Date("2026-07-27T10:00:00Z"));

  assert.match(e, /^[0-9a-f]{32}$/, "condensé hexadécimal attendu");
  assert.equal(e.includes("196.1.2.3"), false, "l'IP ne doit pas transparaître");
  assert.equal(e.includes("Mozilla"), false, "l'agent ne doit pas transparaître");
});

test("stable dans la journée — sinon la déduplication ne dédupliquerait rien", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "UA" });
  const matin = empreinte(h, new Date("2026-07-27T08:00:00Z"));
  const soir = empreinte(h, new Date("2026-07-27T22:00:00Z"));
  assert.equal(matin, soir);
});

/**
 * La rotation quotidienne est un choix, pas un effet de bord : elle rend
 * impossible de suivre quelqu'un d'un jour sur l'autre, même en le voulant.
 */
test("change chaque jour — on ne peut pas suivre quelqu'un dans le temps", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "UA" });
  const jour1 = empreinte(h, new Date("2026-07-27T12:00:00Z"));
  const jour2 = empreinte(h, new Date("2026-07-28T12:00:00Z"));
  assert.notEqual(jour1, jour2);
});

test("deux appareils distincts ne se confondent pas", () => {
  const jour = new Date("2026-07-27T12:00:00Z");
  const a = empreinte(entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "A" }), jour);
  const b = empreinte(entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "B" }), jour);
  assert.notEqual(a, b);
});

test("en-têtes absents : une empreinte quand même, jamais une exception", () => {
  const e = empreinte(entetes({}), new Date("2026-07-27T12:00:00Z"));
  assert.match(e, /^[0-9a-f]{32}$/);
});

/**
 * Le fuseau n'est pas un détail : en UTC, la journée bascule vers 20 h en
 * Haïti — en plein pic d'usage. Une même soirée produirait deux empreintes,
 * donc une personne comptée deux fois, et le seuil de sessions distinctes
 * mesurerait du vent.
 */
test("la journée bascule à minuit EN HAÏTI, pas à 20 h", () => {
  // 2026-07-28T02:00Z = 27 juillet 22 h à Port-au-Prince (UTC-4).
  const soir = new Date("2026-07-28T02:00:00Z");
  assert.equal(jourHaiti(soir), "2026-07-27", "la soirée haïtienne appartient encore au 27");

  const h = entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "UA" });
  // 19 h et 22 h locales : même soirée, donc MÊME empreinte.
  const avant = empreinte(h, new Date("2026-07-27T23:00:00Z"));
  const apres = empreinte(h, new Date("2026-07-28T02:00:00Z"));
  assert.equal(avant, apres, "la soirée a été coupée en deux sessions");
});

/**
 * Sans secret serveur, l'espace d'entrée (une IPv4, quelques agents courants,
 * un jour connu) se parcourt en force brute : on saurait répondre à « telle
 * adresse a-t-elle cherché tel terme ». On refuse alors d'enregistrer.
 */
test("sans poivre serveur, pas d'empreinte — donc pas de journal", () => {
  const salt = process.env.SEARCH_FINGERPRINT_SALT;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SEARCH_FINGERPRINT_SALT;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.equal(
      sessionFingerprint(entetes({ "x-forwarded-for": "196.1.2.3" })),
      null,
      "une empreinte a été produite sans aucun secret serveur",
    );
  } finally {
    if (salt !== undefined) process.env.SEARCH_FINGERPRINT_SALT = salt;
    if (cle !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = cle;
  }
});

test("aucun repli sur la clé de service — les cycles de vie restent séparés", () => {
  const salt = process.env.SEARCH_FINGERPRINT_SALT;
  const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SEARCH_FINGERPRINT_SALT;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "cle-de-service-de-test-assez-longue";
  try {
    assert.equal(
      sessionFingerprint(entetes({ "x-forwarded-for": "196.1.2.3" })),
      null,
      "une empreinte a été dérivée de la clé de service : une rotation de clé " +
        "casserait le comptage en silence, et une fuite reconstituerait tout " +
        "l'historique des empreintes",
    );
    assert.equal(captureActive(), false, "la capture doit se déclarer inactive");
  } finally {
    if (cle === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = cle;
    if (salt !== undefined) process.env.SEARCH_FINGERPRINT_SALT = salt;
  }
});

test("capture active quand le poivre est posé", () => {
  assert.equal(captureActive(), true);
});

/**
 * Le message EST le livrable. S'il se lit mal, le lot n'a servi à rien.
 */
test("message de sourcing — Kreyòl par défaut, avec le rayon", () => {
  const m = messageSourcing(
    { term: "onduleur", department: "Électronique", sessions: 23 },
    { jours: 7 }
  );
  assert.match(m, /23 moun chèche/);
  assert.match(m, /« onduleur »/);
  assert.match(m, /\(Électronique\)/);
  assert.match(m, /7 dènye jou/);
});

test("accord du singulier — « 1 moun chèche », pas « 1 moun chèche yo »", () => {
  const m = messageSourcing({ term: "onduleur", department: null, sessions: 1 });
  assert.match(m, /1 moun chèche/);
  assert.equal(m.includes("1 moun chèche yo"), false);
});

test("sans rayon, pas de parenthèses vides", () => {
  const m = messageSourcing({ term: "onduleur", department: null, sessions: 4 });
  assert.equal(m.includes("()"), false);
});

test("variante française disponible pour qui la préfère", () => {
  const m = messageSourcing(
    { term: "onduleur", department: null, sessions: 2 },
    { lang: "fr" }
  );
  assert.match(m, /2 personnes ont cherché/);
  assert.equal(m.includes("moun"), false);
});
