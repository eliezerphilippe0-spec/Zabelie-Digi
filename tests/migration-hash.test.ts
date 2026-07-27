import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalize, migrationHash } from "../scripts/zabelie-migration-hash.mjs";

/**
 * L'empreinte du registre de migrations (0041) doit être INSENSIBLE à la mise
 * en forme et SENSIBLE au moindre caractère exécutable.
 *
 * Défaut d'origine : l'empreinte du fichier a été enregistrée alors que la
 * chaîne transmise à la base avait des en-têtes abrégés. Un contrôle qui
 * signale du bruit dès le premier jour est un contrôle qu'on apprend à
 * ignorer — le jour d'une vraie dérive, le signal serait déjà mort.
 *
 * Règle du dépôt : un instrument se passe sur un cas connu-positif ET un cas
 * connu-négatif. Ici, positif = « même SQL, commentaires différents → même
 * empreinte » ; négatif = « un caractère de DDL change → empreinte
 * différente ».
 */

const AVEC_COMMENTAIRES = `
-- ============================================================
-- 0042 — un long en-tête explicatif qui n'exécute rien du tout,
-- avec des accents, des « guillemets » et des tirets -- internes.
-- ============================================================
/* un bloc
   sur plusieurs lignes */
create table t (
  id   uuid primary key,   -- commentaire de fin de ligne
  ref  text not null
);
create function f() returns text language plpgsql as $$
begin
  -- commentaire DANS le corps de la fonction
  return 'valeur -- pas un commentaire';
end;
$$;
`;

const ABREGE = `
-- 0042 (en-tête abrégé)
create table t (
  id uuid primary key,
  ref text not null
);
create function f() returns text language plpgsql as $$
begin
  return 'valeur -- pas un commentaire';
end;
$$;
`;

test("MH1 — même SQL, commentaires et espaces différents → MÊME empreinte", () => {
  assert.equal(
    migrationHash(AVEC_COMMENTAIRES),
    migrationHash(ABREGE),
    "l'empreinte ne doit pas dépendre de la mise en forme"
  );
});

test("MH2 — un seul caractère de DDL change → empreinte DIFFÉRENTE", () => {
  const mutations = [
    ["not null", "null"], // contrainte retirée
    ["uuid", "text"], // type changé
    ["create table t", "create table u"], // nom changé
  ];
  for (const [de, vers] of mutations) {
    const mute = AVEC_COMMENTAIRES.replace(de, vers);
    assert.notEqual(mute, AVEC_COMMENTAIRES, `mutation « ${de} » inopérante`);
    assert.notEqual(
      migrationHash(mute),
      migrationHash(AVEC_COMMENTAIRES),
      `« ${de} » → « ${vers} » doit changer l'empreinte`
    );
  }
});

test("MH3 — un `--` dans un littéral n'est PAS un commentaire", () => {
  // Sans respect des apostrophes, tout ce qui suit serait avalé.
  const c = canonicalize("select 'a -- b', 'c';");
  assert.ok(c.includes("'a -- b'"), `littéral tronqué : ${c}`);
  assert.ok(c.includes("'c'"), `la suite de l'instruction a disparu : ${c}`);
});

test("MH4 — une valeur de seed reste significative", () => {
  const a = "insert into l (k, v) values ('ttl', 30);";
  const b = "insert into l (k, v) values ('ttl', 120);";
  assert.notEqual(
    migrationHash(a),
    migrationHash(b),
    "changer 30 en 120 doit changer l'empreinte"
  );
});

test("MH5 — les migrations réelles se hachent, et deux d'entre elles diffèrent", () => {
  const a = migrationHash(readFileSync("supabase/migrations/0042_order_ref.sql", "utf8"));
  const b = migrationHash(readFileSync("supabase/migrations/0035_categories.sql", "utf8"));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.match(b, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});
