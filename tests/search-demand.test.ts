import test from "node:test";
import assert from "node:assert/strict";
import { messageSourcing, sessionFingerprint } from "../lib/search-demand";

function entetes(map: Record<string, string>) {
  return { get: (n: string) => map[n.toLowerCase()] ?? null };
}

/**
 * L'empreinte de session est la pièce la plus sensible du lot : elle décide
 * de ce qu'on peut reconstituer sur quelqu'un à partir du journal.
 */
test("l'empreinte ne laisse rien reconstituer de l'entrée", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3, 10.0.0.1", "user-agent": "Mozilla/5.0" });
  const e = sessionFingerprint(h, new Date("2026-07-27T10:00:00Z"));

  assert.match(e, /^[0-9a-f]{32}$/, "condensé hexadécimal attendu");
  assert.equal(e.includes("196.1.2.3"), false, "l'IP ne doit pas transparaître");
  assert.equal(e.includes("Mozilla"), false, "l'agent ne doit pas transparaître");
});

test("stable dans la journée — sinon la déduplication ne dédupliquerait rien", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "UA" });
  const matin = sessionFingerprint(h, new Date("2026-07-27T08:00:00Z"));
  const soir = sessionFingerprint(h, new Date("2026-07-27T22:00:00Z"));
  assert.equal(matin, soir);
});

/**
 * La rotation quotidienne est un choix, pas un effet de bord : elle rend
 * impossible de suivre quelqu'un d'un jour sur l'autre, même en le voulant.
 */
test("change chaque jour — on ne peut pas suivre quelqu'un dans le temps", () => {
  const h = entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "UA" });
  const jour1 = sessionFingerprint(h, new Date("2026-07-27T12:00:00Z"));
  const jour2 = sessionFingerprint(h, new Date("2026-07-28T12:00:00Z"));
  assert.notEqual(jour1, jour2);
});

test("deux appareils distincts ne se confondent pas", () => {
  const jour = new Date("2026-07-27T12:00:00Z");
  const a = sessionFingerprint(entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "A" }), jour);
  const b = sessionFingerprint(entetes({ "x-forwarded-for": "196.1.2.3", "user-agent": "B" }), jour);
  assert.notEqual(a, b);
});

test("en-têtes absents : une empreinte quand même, jamais une exception", () => {
  const e = sessionFingerprint(entetes({}), new Date("2026-07-27T12:00:00Z"));
  assert.match(e, /^[0-9a-f]{32}$/);
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
