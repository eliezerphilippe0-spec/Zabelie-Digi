import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { POLITIQUE } from "../lib/policy-privacy";

/**
 * LA POLITIQUE DIT VRAI SUR LES COOKIES — intégrée le 2026-10-04 avec les
 * pixels vendeur. L'ancienne section 8 affirmait « uniquement la session,
 * aucun traçage tiers » alors que le code posait déjà zab_ref, zab_theme,
 * zabelie_lang et zabelie_sale_sources. Une phrase juridique fausse ne lève
 * aucune erreur : ce croisement la rend visible.
 */

function sources(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules") sources(p, out); }
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

/** Noms de cookies déclarés comme constantes dans le code (lib/, app/, proxy.ts). */
function cookiesDuCode(): string[] {
  const noms = new Set<string>();
  for (const f of [...sources("lib"), ...sources("app"), "proxy.ts"]) {
    for (const m of readFileSync(f, "utf8").matchAll(/COOKIE[A-Z_]* = "([a-z_]+)"/g)) noms.add(m[1]);
  }
  return [...noms].sort();
}

const texte = (lang: keyof typeof POLITIQUE) =>
  POLITIQUE[lang].sections.flatMap((s) => s.blocs.flatMap((b) => ("p" in b ? [String(b.p)] : b.ul.map(String)))).join("\n");

test("C1 — témoin : le relevé voit les cookies connus du code", () => {
  const noms = cookiesDuCode();
  for (const connu of ["zab_pub", "zab_ref", "zab_theme", "zabelie_lang", "zabelie_sale_sources"]) assert.ok(noms.includes(connu), `${connu} non relevé — le motif ne lit plus le code`);
});

test("C2 — chaque cookie posé par le code est déclaré, dans les quatre langues", () => {
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const t = texte(lang);
    for (const nom of cookiesDuCode()) assert.ok(t.includes(nom), `${lang} : le cookie ${nom} n'est pas déclaré dans la politique`);
    for (const regie of ["Meta", "Google", "TikTok"]) assert.ok(t.includes(regie), `${lang} : ${regie} absente de la politique`);
  }
});

test("C3 — l'ancienne affirmation fausse ne revient pas", () => {
  const faux = [/Aucun cookie publicitaire/, /Pa gen okenn cookie piblisite/, /No advertising cookies/, /Sin cookies publicitarias/,
    // Retirer son accord ne passe plus par « effacez vos cookies » : un lien, un clic.
    /effacez les cookies/, /efase cookies/, /clear zabelie\.com's cookies/, /borre las cookies/];
  for (const lang of ["fr", "ht", "en", "es"] as const) for (const re of faux) assert.doesNotMatch(texte(lang), re, `${lang} : ${re}`);
});

test("C4 — retrait en un clic, responsabilité du vendeur, droit haïtien : dans les quatre langues", () => {
  const responsable = { fr: "répond de l'usage qu'il en fait", ht: "se li ki reponn pou jan li sèvi avè l", en: "is answerable for how they use it", es: "responde del uso que hace de él" } as const;
  const lien = { fr: "Gérer les traceurs", ht: "Jere siveyans yo", en: "Manage trackers", es: "Gestionar rastreadores" } as const;
  for (const lang of ["fr", "ht", "en", "es"] as const) {
    const doc = POLITIQUE[lang];
    const i = doc.sections.findIndex((s) => s.ancre === "traceurs");
    assert.equal(i, POLITIQUE.fr.sections.findIndex((s) => s.ancre === "traceurs"), `${lang} : l'ancre « traceurs » n'est pas sur la même section`);
    assert.ok(i >= 0, `${lang} : aucune section n'a l'ancre « traceurs »`);
    const t = texte(lang);
    assert.ok(t.includes(`**${lien[lang]}**`), `${lang} : la politique ne nomme pas le lien « ${lien[lang]} »`);
    assert.match(t, /Le Moniteur\* n[^\n]{0,8}87/, `${lang} : l'arrêté de 2018 n'est pas cité`);
    assert.match(t, /2018/);
    assert.ok(t.includes(`**${responsable[lang]}**`), `${lang} : la responsabilité du vendeur sur son pixel n'est pas écrite`);
  }
});
