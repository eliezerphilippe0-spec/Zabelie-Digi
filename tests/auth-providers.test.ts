import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthProviders, urlDeRetourOAuth } from "../lib/auth-providers";

/**
 * V-19 — fournisseurs tiers. Ce que la liste DOIT faire : ne rien montrer
 * sans configuration, ignorer ce qu'elle ne connaît pas sans lever, garder
 * l'ordre, et traduire nos noms vers ceux de Supabase avec leurs options.
 */

test("AP1 — absente ou vide → aucun fournisseur, aucune erreur", () => {
  assert.deepEqual(resolveAuthProviders(undefined), []);
  assert.deepEqual(resolveAuthProviders(null), []);
  assert.deepEqual(resolveAuthProviders(""), []);
  assert.deepEqual(resolveAuthProviders(" , ,"), []);
});

test("AP2 — connu-POSITIF : google,microsoft → deux fournisseurs, ordre conservé, nom Supabase et portées", () => {
  const r = resolveAuthProviders("google,microsoft");
  assert.deepEqual(
    r.map((p) => [p.id, p.supabase, p.scopes ?? null]),
    [
      ["google", "google", null],
      ["microsoft", "azure", "email"],
    ]
  );
});

test("AP3 — connu-NÉGATIF : une valeur inconnue est ignorée ET journalisée, jamais rendue", () => {
  const journal: string[] = [];
  const r = resolveAuthProviders("google, twitter ,apple", (m) => journal.push(m));
  assert.deepEqual(
    r.map((p) => p.id),
    ["google", "apple"]
  );
  assert.equal(journal.length, 1);
  assert.match(journal[0], /twitter/);
  // Le journal nomme la valeur fautive TELLE QUELLE (pour la retrouver dans
  // Vercel), pas sa forme normalisée.
  assert.doesNotMatch(journal[0], /"twitter "/);
});

test("AP4 — casse, espaces, doublons et alias (azure → microsoft) sont absorbés", () => {
  const r = resolveAuthProviders(" Google , GOOGLE, azure, Microsoft, Facebook ");
  assert.deepEqual(
    r.map((p) => p.id),
    ["google", "microsoft", "facebook"]
  );
});

test("AP5 — l'URL de retour vise TOUJOURS /auth/callback et porte `next` encodé", () => {
  const u = urlDeRetourOAuth("https://zabelie.com", "/panier?x=1&y=2");
  assert.equal(u, "https://zabelie.com/auth/callback?next=%2Fpanier%3Fx%3D1%26y%3D2");
  // L'origine est celle de la page (apex OU www), jamais réécrite.
  assert.equal(
    urlDeRetourOAuth("https://www.zabelie.com", "/"),
    "https://www.zabelie.com/auth/callback?next=%2F"
  );
});
