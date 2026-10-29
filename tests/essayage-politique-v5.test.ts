import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POLITIQUE } from "../lib/policy-privacy";
import { CONFIDENTIALITE_VERSION } from "../lib/legal-acceptance";
import { LANGS } from "../lib/i18n";

/**
 * L'essayage virtuel dans la politique (confidentialite-v5, 0167) — instruction
 * du porteur du 2026-10-29 : « Active la salle d'essayage ». La photo de
 * l'acheteur part chez un prestataire : la politique le dit AVANT l'interrupteur.
 */
const MIG = readFileSync("supabase/migrations/0167_zabelie_confidentialite_v5.sql", "utf8");
const section = (lang: (typeof LANGS)[number], n: number) =>
  POLITIQUE[lang].sections.filter((s) => s.titre.startsWith(`${n}.`)).flatMap((s) => s.blocs.flatMap((b) => ("ul" in b ? b.ul : "p" in b ? [b.p] : []))).join("\n");

test("v5 : la photo d'essayage est dite aux §2, §3, §5 et §6, dans les quatre langues", () => {
  const motPhoto = { fr: /Photo d'essayage/, ht: /Foto esè/, en: /Try-on photo/, es: /Foto de prueba/ } as const;
  for (const lang of LANGS) {
    assert.match(section(lang, 2), motPhoto[lang], `${lang} §2`);
    assert.match(section(lang, 5), motPhoto[lang], `${lang} §5`);
    assert.match(section(lang, 5), /\*\*3 (jours|jou|days|días)\*\*/, `${lang} §5 : la durée`);
    assert.match(section(lang, 6), /\*\*Genlook\*\*[\s\S]{0,8}\*\*FASHN\*\*/, `${lang} §6 : les deux prestataires`);
    assert.match(section(lang, 3), /\*(votre consentement|konsantman ou|your consent|su consentimiento)\*/, `${lang} §3 : la base légale`);
  }
});

test("v5 : aucune région d'hébergement affirmée pour les prestataires d'essayage (rien n'a été mesuré)", () => {
  for (const lang of LANGS) {
    const ligne = section(lang, 6).split("\n").find((l) => l.includes("Genlook")) ?? "";
    assert.ok(ligne.length > 0, lang);
    assert.doesNotMatch(ligne, /Europe|européenne|UE\b|EU\b|États-Unis|United States|Estados Unidos|Etazini|Ewòp/i, lang);
  }
});

test("0167 : CHAQUE fonction accepte v1, v3, v4 et v5, et rien d'autre", () => {
  assert.equal(CONFIDENTIALITE_VERSION, "confidentialite-v5");
  const corps = MIG.split(/create (?:or replace )?function /).slice(1).map((b) => b.slice(0, b.indexOf("$$;")));
  assert.equal(corps.length, 2);
  for (const [i, f] of corps.entries()) {
    assert.match(f, /not in \('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4', 'confidentialite-v5'\)/, `fonction ${i + 1}`);
    assert.doesNotMatch(f, /confidentialite-v2|confidentialite-v6/, `fonction ${i + 1} : une version inconnue`);
  }
  assert.match(MIG, /and p\.prosrc like '%''confidentialite-v4''%'\s+and p\.prosrc like '%''confidentialite-v5''%'\) <> 2 then/);
});

test("0167 : garde de rejeu d'abord, aucune suppression, aucun droit élargi, ordre écrit des deux côtés", () => {
  assert.match(MIG, /^select zabelie_migration_garde\('0167_zabelie_confidentialite_v5\.sql'\);/);
  const sql = MIG.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(drop|delete|truncate)\b/i);
  assert.doesNotMatch(sql, /grant execute on function public\.zabelie_handle_new_user/);
  assert.match(sql, /revoke all on function public\.zabelie_accept_account_legal\(text,text,boolean,boolean\) from public, anon, authenticated;\s*grant execute on function public\.zabelie_accept_account_legal\(text,text,boolean,boolean\) to authenticated;/);
  assert.match(MIG, /ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner/);
  assert.match(readFileSync("lib/legal-acceptance.ts", "utf8"), /`0167` doit être\s*\*?\s*APPLIQUÉE avant que cette ligne ne soit fusionnée/);
});
