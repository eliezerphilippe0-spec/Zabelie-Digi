import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { garderProduction, resolveMonCashMode } from "@/lib/moncash";

/**
 * LE GARDE DE PRODUCTION — un acheteur réel ne part JAMAIS en bac à sable.
 *
 * Né de l'audit du 2026-09-02 (constat #1, BLOQUANT) : sept tentatives d'achat
 * par trois acheteurs distincts, toutes routées vers `sandbox.moncashbutton…`
 * parce que `MONCASH_MODE` n'était pas posée en production. Le repli sandbox
 * était journalisé depuis `885f02c` ; il restait PRIS. Ce garde le refuse là
 * où il coûte, et seulement là.
 */

const RACINE = join(import.meta.dirname, "..");
const MONCASH = readFileSync(join(RACINE, "lib/moncash.ts"), "utf8");

/* ── P1 — en production, l'absence REFUSE ──────────────────────────────────── */
test("P1 — production + MONCASH_MODE absente → lève, avec le geste à faire", () => {
  assert.throws(
    () => garderProduction("absente", "production"),
    /PRODUCTION[\s\S]*MONCASH_MODE=production[\s\S]*redéployer/
  );
});

test("P2 — production + MONCASH_MODE vide → lève aussi", () => {
  assert.throws(() => garderProduction("vide", "production"), /PRODUCTION/);
});

/* ── P3 — LE CAS QUI COMPTE : explicite passe, même sandbox ───────────────────
 * Un porteur qui a CHOISI sandbox en production (test contrôlé avant bascule)
 * a le droit de le faire. Ce garde ne refuse que ce qui n'a pas été choisi. */
test("P3 — production + choix explicite (sandbox OU production) → passe", () => {
  assert.doesNotThrow(() => garderProduction("explicite", "production"));
});

/* ── P4 — hors production, RIEN ne change ──────────────────────────────────── */
test("P4 — preview / development / absent : le défaut sandbox reste légitime", () => {
  for (const env of ["preview", "development", undefined, ""]) {
    assert.doesNotThrow(
      () => garderProduction("absente", env),
      `VERCEL_ENV=${String(env)} ne doit pas refuser — casser le local et les Preview serait un mauvais échange`
    );
  }
});

/* ── P5 — NODE_ENV n'est PAS le discriminant ───────────────────────────────────
 * `NODE_ENV` vaut « production » sur un build de Preview. Le garde doit lire
 * `VERCEL_ENV`, sinon chaque Preview refuserait tout paiement de test. */
test("P5 — le garde est branché sur VERCEL_ENV, jamais sur NODE_ENV", () => {
  assert.match(
    MONCASH,
    /garderProduction\(\s*resolveMonCashMode\(process\.env\.MONCASH_MODE\)\.source,\s*process\.env\.VERCEL_ENV\s*\)/,
    "createPayment doit appeler garderProduction avec la SOURCE résolue et VERCEL_ENV"
  );
  assert.doesNotMatch(
    MONCASH,
    /garderProduction\([^)]*NODE_ENV/,
    "NODE_ENV vaut aussi « production » en Preview : ce n'est pas le bon discriminant"
  );
});

/* ── P6 — LE GARDE EST DANS createPayment, PAS DANS config() ──────────────────
 * `config()` sert aussi `retrieveOrderPayment`, donc le réconciliateur. Un
 * garde là-bas empêcherait les paiements déjà partis en bac à sable d'expirer
 * proprement. L'assertion porte sur l'ordre : le garde AVANT le premier appel
 * réseau de createPayment. */
test("P6 — le garde précède getAccessToken dans createPayment, et config() n'en porte pas", () => {
  const debut = MONCASH.indexOf("export async function createPayment(");
  assert.ok(debut > 0, "createPayment introuvable");
  const corps = MONCASH.slice(debut, debut + 1600);
  const iGarde = corps.indexOf("garderProduction(");
  const iToken = corps.indexOf("await getAccessToken()");
  assert.ok(iGarde > 0 && iToken > 0, "garde ou getAccessToken absent du corps");
  assert.ok(iGarde < iToken, "le garde doit précéder le premier appel réseau");

  const iConfig = MONCASH.indexOf("function config()");
  const corpsConfig = MONCASH.slice(iConfig, MONCASH.indexOf("}", MONCASH.indexOf("return {", iConfig)));
  assert.doesNotMatch(corpsConfig, /garderProduction/, "config() sert le réconciliateur : pas de garde ici");
});

/* ── P7 — cohérence avec resolveMonCashMode : ce que « source » veut dire ─── */
test("P7 — les trois sources existent et une seule passe en production", () => {
  const passe = (["absente", "vide", "explicite"] as const).filter((s) => {
    try { garderProduction(s, "production"); return true; } catch { return false; }
  });
  assert.deepEqual(passe, ["explicite"]);
  // Et la source « explicite » est bien celle que rend une valeur légitime.
  assert.equal(resolveMonCashMode("production").source, "explicite");
  assert.equal(resolveMonCashMode(undefined).source, "absente");
});
