import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigSupabaseInvalide,
  configPublique,
  configService,
  verifierUrlSupabase,
} from "../lib/supabase/config";

/**
 * La lecture des variables Supabase doit discriminer dans LES DEUX SENS, et
 * c'est le sens « tolère » qui compte le plus ici.
 *
 * Le 2026-08-04, deux causes ont traversé `estModeDemo` sans être vues — un
 * `\n` collé, et l'URL du tableau de bord. Une première garde proposée les
 * attrapait toutes les deux, mais elle exigeait la forme exacte
 * `^https://[a-z0-9]{20}\.supabase\.co$` et rejetait au passage TROIS valeurs
 * parfaitement légitimes : la barre oblique finale, un domaine personnalisé,
 * `http://localhost:54321` du CLI Supabase.
 *
 * Une garde qui casse la production pour un non-problème est l'échec INVERSE
 * de celui qu'on corrige, et le pire des deux : elle tombe du côté alarmant,
 * donc elle sera désarmée à la première fausse alerte. Ces tests fixent donc
 * autant ce qui doit PASSER que ce qui doit échouer.
 */

const REF = "https://ddditxykopuxxqzgkqwy.supabase.co";
const CLE = "sb_publishable_exemple_de_test";

function avec<T>(env: Record<string, string | undefined>, f: () => T): T {
  const avant = { ...process.env };
  Object.assign(process.env, env);
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  try {
    return f();
  } finally {
    for (const k of Object.keys(env)) delete process.env[k];
    Object.assign(process.env, avant);
  }
}

// ───────────────── Ce qui doit ÊTRE REJETÉ ───────────────────────────────────

test("l'URL du tableau de bord est rejetée, et le message NOMME la valeur", () => {
  const mauvaise = "https://supabase.com/dashboard/project/ddditxykopuxxqzgkqwy";
  // `assert.throws` rend `undefined`, il ne RETOURNE pas l'erreur — capture
  // manuelle. (Erreur commise en écrivant ce test, attrapée par ce test.)
  let err: unknown;
  try {
    verifierUrlSupabase(mauvaise);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof ConfigSupabaseInvalide, "type d'erreur inattendu");
  // Le point de tout l'exercice : trois heures de diagnostic deviennent une
  // ligne à l'écran. Le message doit contenir la valeur fautive.
  assert.ok(err.message.includes(mauvaise), `message sans la valeur : ${err.message}`);
  assert.ok(err.message.includes("tableau de bord"), "la cause n'est pas nommée");
  assert.equal(err.valeur, mauvaise);
});

test("une valeur qui n'est pas une URL est rejetée", () => {
  assert.throws(() => verifierUrlSupabase("ddditxykopuxxqzgkqwy"), ConfigSupabaseInvalide);
  assert.throws(() => verifierUrlSupabase(""), ConfigSupabaseInvalide);
});

// ───────────────── Ce qui doit PASSER — la moitié qui compte ─────────────────

test("les valeurs légitimes passent, y compris celles que la garde stricte cassait", () => {
  for (const bonne of [
    REF,
    `${REF}/`, // barre oblique finale — le collage le plus banal qui soit
    "https://api.zabelie.com", // domaine personnalisé
    "http://localhost:54321", // CLI Supabase, développement local
    "http://127.0.0.1:54321",
  ]) {
    assert.doesNotThrow(() => verifierUrlSupabase(bonne), `REJETÉE À TORT : ${bonne}`);
  }
});

// ───────────────── Le `\n` : éliminé, pas diagnostiqué ───────────────────────

test("un saut de ligne ou une espace collée est retiré, pas signalé", () => {
  // Mesuré : `new URL()` NORMALISE le \n final, il ne peut donc pas le
  // détecter. Seul `.trim()` règle ce cas — d'où l'élimination plutôt que la
  // détection.
  assert.equal(new URL(`${REF}\n`).href, `${REF}/`);

  for (const sale of [`${REF}\n`, `  ${REF}  `, `${REF}\r\n`, `\t${REF}`]) {
    const { url } = avec(
      { NEXT_PUBLIC_SUPABASE_URL: sale, NEXT_PUBLIC_SUPABASE_ANON_KEY: `${CLE}\n` },
      configPublique
    );
    assert.equal(url, REF, `non nettoyée : ${JSON.stringify(sale)}`);
  }

  // La clé aussi — c'est elle qu'on recolle à chaque rotation.
  const { key } = avec(
    { NEXT_PUBLIC_SUPABASE_URL: REF, NEXT_PUBLIC_SUPABASE_ANON_KEY: `${CLE}\n ` },
    configPublique
  );
  assert.equal(key, CLE);
});

// ───────────── L'absence reste distincte de l'invalidité ─────────────────────

test("absente → message du mode démo ; présente mais fausse → ConfigSupabaseInvalide", () => {
  // `estModeDemo` (lib/auth-erreurs.ts) teste `includes("URL and API key")`.
  // Si ce message change, l'écran « mode démo » cesse de s'afficher EN SILENCE.
  let absente: unknown;
  try {
    avec(
      { NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined },
      configPublique
    );
  } catch (e) {
    absente = e;
  }
  assert.ok(absente instanceof Error);
  assert.ok(
    absente.message.includes("URL and API key"),
    "le contrat avec estModeDemo est rompu — l'écran mode démo ne s'affichera plus"
  );
  assert.ok(!(absente instanceof ConfigSupabaseInvalide), "absence confondue avec invalidité");

  // Une valeur vide après trim compte comme absente, pas comme invalide.
  let vide: unknown;
  try {
    avec({ NEXT_PUBLIC_SUPABASE_URL: "   ", NEXT_PUBLIC_SUPABASE_ANON_KEY: CLE }, configPublique);
  } catch (e) {
    vide = e;
  }
  assert.ok(vide instanceof Error);
  assert.ok(vide.message.includes("URL and API key"));
});

// ───────────────── La clé de service suit le même chemin ─────────────────────

test("la clé de service est nettoyée et son URL contrôlée", () => {
  const { url, key } = avec(
    { NEXT_PUBLIC_SUPABASE_URL: `${REF}\n`, SUPABASE_SERVICE_ROLE_KEY: "  sb_secret_faux  " },
    configService
  );
  assert.equal(url, REF);
  assert.equal(key, "sb_secret_faux");

  assert.throws(
    () =>
      avec(
        {
          NEXT_PUBLIC_SUPABASE_URL: "https://supabase.com/dashboard/project/x",
          SUPABASE_SERVICE_ROLE_KEY: "sb_secret_faux",
        },
        configService
      ),
    ConfigSupabaseInvalide
  );
});
