import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE DÉCLENCHEUR pg_cron DU RAPPROCHEMENT (0170), CROISÉ AVEC CE QU'IL APPELLE.
 *
 * La migration vit en SQL, la route en TypeScript, le nom du secret dans deux
 * documents : rien ne relie ces quatre endroits, et un écart entre eux ne lève
 * rien. Un job qui appelle une autre route, un délai d'attente plus long que la
 * durée maximale de la route, ou un nom de secret différent de celui que la doc
 * fait poser au porteur, et le rapprochement cesse en silence — la base note
 * `appel_envoye` ou `secret_absent` à chaque passage, sans erreur.
 *
 * Le comportement de la fonction est éprouvé en SQL
 * (`supabase/tests/rapprochement_pg_cron.test.sql`, Vault et pg_net simulés).
 */

const MIGRATION = readFileSync("supabase/migrations/0170_zabelie_rapprochement_pg_cron.sql", "utf8");
const CODE = MIGRATION.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
const ROUTE = readFileSync("app/api/reconcile/route.ts", "utf8");
const SECRET = "zabelie_reconcile_secret";

test("pg_cron planifie le déclencheur toutes les cinq minutes, hors début d'heure", () => {
  assert.match(
    CODE,
    /cron\.schedule\('zabelie-rapprochement',\s*'2-59\/5 \* \* \* \*',\s*'select public\.zabelie_rapprochement_declencher\(\)'\)/,
  );
  // La planification n'est posée que si pg_cron existe : condition, pas message.
  assert.match(CODE, /if exists \(select 1 from pg_extension where extname = 'pg_cron'\) then\s*perform cron\.schedule/);
});

test("le déclencheur appelle LA route du rapprochement, en POST authentifié par RECONCILE_SECRET", () => {
  assert.match(CODE, /using v_cfg\.site_url \|\| '\/api\/reconcile',/);
  assert.match(CODE, /'Authorization', 'Bearer ' \|\| btrim\(v_secret\)/);
  // La route accepte bien ce jeton sur POST.
  assert.match(ROUTE, /export (const|async function) POST/);
  assert.match(ROUTE, /const reconcileSecret = process\.env\.RECONCILE_SECRET;[\s\S]{0,200}secretEgal\(bearer, reconcileSecret\)/);
});

test("le délai d'attente borné ne dépasse jamais la durée maximale de la route", () => {
  const borne = Number(CODE.match(/check \(delai_ms between 5000 and (\d+)\)/)?.[1]);
  const defaut = Number(CODE.match(/delai_ms\s+integer not null default (\d+)/)?.[1]);
  const maxDuration = Number(ROUTE.match(/export const maxDuration = (\d+);/)?.[1]);
  assert.ok(borne > 0 && defaut > 0 && maxDuration > 0, "borne, défaut ou maxDuration introuvable");
  assert.ok(borne <= maxDuration * 1000, `borne ${borne} ms > maxDuration ${maxDuration} s`);
  assert.ok(defaut <= borne, `défaut ${defaut} ms > borne ${borne} ms`);
});

test("le jeton est LU dans Vault sous le nom que la doc fait poser, et jamais écrit par la migration", () => {
  assert.match(CODE, new RegExp(`from vault\\.decrypted_secrets where name = \\$1 limit 1'\\s*into v_secret using '${SECRET}';`));
  assert.doesNotMatch(CODE, /vault\.create_secret\s*\(/, "la migration ne doit jamais poser le secret");
  for (const doc of ["docs/04-DEPLOIEMENT.md", "docs/11-SECRETS.md"]) {
    assert.ok(readFileSync(doc, "utf8").includes(SECRET), `${doc} ne nomme pas ${SECRET}`);
  }
  // Fail-closed : un jeton absent ou trop court n'appelle rien.
  assert.match(CODE, /if v_secret is null or length\(btrim\(v_secret\)\) < 16 then\s*v_issue := 'secret_absent';/);
});

test("aucun client n'exécute le déclencheur ni ne lit sa configuration", () => {
  assert.match(CODE, /revoke all on function public\.zabelie_rapprochement_declencher\(\) from public, anon, authenticated;/);
  assert.match(CODE, /revoke all on zabelie_rapprochement_config from public, anon, authenticated;/);
  assert.match(CODE, /security definer\s*set search_path = public/);
});
