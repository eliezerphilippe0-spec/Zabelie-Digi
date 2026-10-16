import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { IDENTITE } from "../lib/policy-privacy";

/**
 * DURCISSEMENTS DU 2026-10-14 (revue de sécurité, SEC-05 à SEC-07).
 *
 *  D1  `/.well-known/security.txt` : champs obligatoires (RFC 9116), contact
 *      unique avec la politique de confidentialité, et un rappel AVANT
 *      l'expiration (30 jours) plutôt qu'un fichier périmé en silence ;
 *  D2  0144 fige la date d'inscription sans perdre un garde de 0017 ;
 *  D3  0145 : la recherche approximative voit `extensions` ; et toute fonction
 *      trigramme écrite APRÈS le déplacement doit le voir aussi.
 *
 * Le comportement en base est éprouvé par `profil_inscription_figee.test.sql`
 * et par la post-condition de 0145 (la recherche s'exécute) ; ici, le texte.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentairesSql = (s: string) => s.replace(/--.*$/gm, "");

test("D1 — security.txt complet, contact unique, expiration surveillée", () => {
  const txt = lire("public/.well-known/security.txt");
  const champ = (nom: string) => new RegExp(`^${nom}: (.+)$`, "m").exec(txt)?.[1]?.trim();
  assert.equal(champ("Contact"), `mailto:${IDENTITE.email}`, "le contact doit être celui de la politique de confidentialité");
  assert.equal(champ("Canonical"), "https://zabelie.com/.well-known/security.txt");
  const expire = Date.parse(champ("Expires") ?? "");
  assert.ok(Number.isFinite(expire), "Expires illisible");
  const jours = (expire - Date.now()) / 86_400_000;
  assert.ok(jours > 30, `security.txt expire dans ${Math.floor(jours)} jour(s) : repousser Expires (un an au plus)`);
  assert.ok(jours <= 366, "Expires à plus d'un an : la RFC 9116 recommande moins d'un an");
});

test("D2 — 0144 fige la date d'inscription et garde les gardes de 0017", () => {
  const m = sansCommentairesSql(lire("supabase/migrations/0144_zabelie_profil_inscription_figee.sql"));
  const insert = /if tg_op = 'INSERT' then([\s\S]*?)elsif tg_op = 'UPDATE' then([\s\S]*?)end if;/.exec(m);
  assert.ok(insert, "branches INSERT / UPDATE introuvables");
  const [, brancheInsert, brancheUpdate] = insert;
  assert.match(brancheInsert, /new\.created_at\s+:= now\(\);/);
  assert.match(brancheUpdate, /new\.created_at\s+:= old\.created_at;/);
  for (const garde of ["new.role := old.role", "new.tier := old.tier", "new.suspended_at     := old.suspended_at", "new.suspended_reason := old.suspended_reason", "new.suspended_by     := old.suspended_by"]) {
    assert.ok(brancheUpdate.includes(garde), `garde perdu : ${garde}`);
  }
  for (const garde of ["new.role := 'buyer'", "new.tier := 'standard'", "new.suspended_at     := null"]) {
    assert.ok(brancheInsert.includes(garde), `garde perdu : ${garde}`);
  }
  assert.match(m, /if current_user in \(\s*'service_role', 'postgres', 'supabase_admin', 'supabase_auth_admin'\s*\) then\s*return new;/);
});

/** Corps des fonctions créées dans un fichier SQL, avec leur clause `set search_path`. */
function fonctions(sql: string): Array<{ nom: string; entete: string; corps: string }> {
  const out: Array<{ nom: string; entete: string; corps: string }> = [];
  const re = /create (?:or replace )?function ([\w.]+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi;
  for (const m of sql.matchAll(re)) out.push({ nom: m[1], entete: m[2], corps: m[4] });
  return out;
}
const TRIGRAMME = /\b(word_similarity|strict_word_similarity|similarity|show_trgm)\s*\(|<<?%|%>>?|<<?->>?/;

test("D3 — la recherche approximative voit `extensions`, et toute fonction trigramme future aussi", () => {
  const m = sansCommentairesSql(lire("supabase/migrations/0145_zabelie_pg_trgm_extensions.sql"));
  assert.match(m, /alter extension pg_trgm set schema extensions;/);
  assert.match(m, /alter function public\.zabelie_search_fuzzy\(text, integer\)\s+set search_path = public, extensions, pg_temp;/);

  // L'extracteur voit une fonction trigramme connue (connu-positif) et ignore
  // une fonction qui n'en utilise pas (connu-négatif).
  const essai = fonctions("create function f(a text) returns real language sql set search_path = public as $$ select word_similarity(a, 'x') $$; create function g() returns int language sql as $$ select 1 $$;");
  assert.deepEqual(essai.filter((f) => TRIGRAMME.test(f.corps)).map((f) => f.nom), ["f"]);

  const fautives: string[] = [];
  for (const f of readdirSync(join(RACINE, "supabase/migrations")).filter((n) => /^\d{4}_.*\.sql$/.test(n) && Number(n.slice(0, 4)) >= 145).sort()) {
    for (const fn of fonctions(sansCommentairesSql(lire(`supabase/migrations/${f}`)))) {
      if (TRIGRAMME.test(fn.corps) && !/set search_path\s*=\s*[^;$]*\bextensions\b/i.test(fn.entete)) fautives.push(`${f}: ${fn.nom}`);
    }
  }
  assert.deepEqual(fautives, [], `fonction trigramme sans \`extensions\` dans son search_path (pg_trgm vit dans extensions depuis 0145) : ${fautives.join(", ")}`);
});
