#!/usr/bin/env node
/**
 * Empreinte CANONIQUE d'une migration — pour `zabelie_schema_migrations` (0041).
 *
 * Pourquoi ce script existe. La première série d'enregistrements a inscrit
 * l'empreinte du FICHIER alors que la chaîne réellement transmise à la base
 * différait (en-têtes de commentaires abrégés au passage). Un registre qui
 * signale un écart dès le premier jour est un registre qu'on apprend à
 * ignorer : « ça arrive, c'est les commentaires ». Le jour d'une vraie dérive,
 * le signal serait déjà mort.
 *
 * Correctif : on hache une FORME CANONIQUE — commentaires retirés, espaces
 * réduits — de sorte que deux chaînes qui exécutent le même SQL donnent la
 * même empreinte, quelle que soit leur mise en forme.
 *
 * Ce qui est délibérément IGNORÉ : commentaires (`--`, `/* *\/`), y compris
 * dans les corps de fonction, et toute suite d'espaces.
 * Ce qui reste SIGNIFIANT : le moindre caractère exécutable — un nom, un
 * opérateur, une valeur de seed, un `not null`.
 *
 * Les littéraux entre apostrophes et les blocs `$$…$$` sont respectés : un
 * `--` à l'intérieur d'un libellé n'est pas un commentaire.
 *
 * Usage :
 *   node scripts/zabelie-migration-hash.mjs                    # toutes
 *   node scripts/zabelie-migration-hash.mjs 0042_order_ref.sql # une
 *   node scripts/zabelie-migration-hash.mjs --sql              # UPDATE du registre
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "supabase/migrations";

/** Retire commentaires et espaces superflus, en respectant les littéraux. */
export function canonicalize(sql) {
  let out = "";
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // Littéral entre apostrophes ('' = apostrophe échappée) — conservé tel quel.
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }

    // Bloc dollar-quoté ($$…$$ ou $tag$…$tag$) : le CONTENU est du code, on le
    // canonicalise aussi (les commentaires d'un corps de fonction n'ont pas
    // plus de valeur exécutable que les autres).
    if (c === "$") {
      const m = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const body = end === -1 ? sql.slice(i + tag.length) : sql.slice(i + tag.length, end);
        out += tag + canonicalize(body) + tag;
        i = end === -1 ? n : end + tag.length;
        continue;
      }
    }

    // Commentaire de ligne.
    if (c === "-" && next === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      out += " ";
      continue;
    }

    // Commentaire de bloc (imbrication gérée, comme PostgreSQL).
    if (c === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") { depth++; j += 2; continue; }
        if (sql[j] === "*" && sql[j + 1] === "/") { depth--; j += 2; continue; }
        j++;
      }
      i = j;
      out += " ";
      continue;
    }

    out += c;
    i++;
  }

  return out.replace(/\s+/g, " ").trim();
}

export function migrationHash(sql) {
  return createHash("sha256").update(canonicalize(sql), "utf8").digest("hex");
}

// ── CLI ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const sqlMode = args.includes("--sql");
const only = args.filter((a) => !a.startsWith("--"));

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".sql"))
  .filter((f) => only.length === 0 || only.includes(f))
  .sort();

if (sqlMode) {
  console.log("-- Empreintes canoniques (scripts/zabelie-migration-hash.mjs).");
  console.log("-- À exécuter pour corriger les lignes déjà enregistrées.");
  for (const f of files) {
    const h = migrationHash(readFileSync(join(DIR, f), "utf8"));
    console.log(
      `update zabelie_schema_migrations set sha256 = '${h}' where filename = '${f}' and statut = 'appliquee';`
      // Le garde porte sur `statut` depuis `0062`, plus sur `sha256 <> '-'` :
      // deux sources de vérité pour le même fait est le défaut que 0062 ferme.
    );
  }
} else {
  for (const f of files) {
    console.log(`${migrationHash(readFileSync(join(DIR, f), "utf8"))}  ${f}`);
  }
}
