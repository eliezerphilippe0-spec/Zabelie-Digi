import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { declarations } from "./helpers/css-declarations";

/**
 * VALEURS EN DUR → JETONS — audit du système de design du 2026-10-27, m9.
 *
 * Mesuré à `acc72c9` :
 *   • `app/home-vivant.css:36,39,44` — la vitrine de l'accueil en hex
 *     (#f2eee7, #fffdf9, #17123a) et en rayons chiffrés (24/16 px). Ces
 *     couleurs ne basculaient PAS en mode sombre, à côté de `.universe-art`
 *     qui, elle, suit les tokens ;
 *   • `components/site-nav.tsx:139` — `text-[11px]`, valeur arbitraire (gardée
 *     désormais par `tests/tailles-texte.test.ts`, dont l'exception est tombée) ;
 *   • `components/search-box.tsx:137` — `hover:bg-black/20` : un noir pur, que
 *     la palette du dépôt refuse (`tests/palette-resserree`).
 */

const FEUILLES = ["app/home-vivant.css", "app/editorial-marketplace.css", "app/ventes-flash.css"];
const THEME = readFileSync("app/zabelie-theme.css", "utf8");
/** Le bloc sombre : tout ce qui suit sa PREMIÈRE occurrence (même découpe que la porte de contraste). */
const SOMBRE = THEME.slice(THEME.indexOf('[data-theme="dark"]'));

/** Une couleur LITTÉRALE dans une valeur CSS, hors `url(…)` (une image garde ses couleurs). */
const LITTERALE = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/i;
const sansUrl = (v: string) => v.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, "url()");

test("VD0 — l'instrument : hex, rgb et rgba sont vus ; une image en data: et un token ne le sont pas", () => {
  for (const v of ["#f2eee7", "rgba(23, 18, 58, .35)", "rgb(255 255 255 / 0.35)", "hsl(0 0% 100%)"]) {
    assert.ok(LITTERALE.test(sansUrl(v)), `non vu : ${v}`);
  }
  for (const v of [`url("data:image/svg+xml,%3Cpath fill='%23e0580f'/%3E")`, "var(--color-ink-soft)", "color-mix(in srgb, var(--color-chrome) 35%, transparent)"]) {
    assert.ok(!LITTERALE.test(sansUrl(v)), `faux positif : ${v}`);
  }
});

test("VD1 — aucune couleur littérale dans les trois feuilles de l'accueil", () => {
  for (const f of FEUILLES) {
    const decl = declarations(readFileSync(f, "utf8"));
    assert.ok(decl.length > 20, `${f} : ${decl.length} déclarations lues — l'extraction a bougé`);
    const fautes = decl.filter((d) => LITTERALE.test(sansUrl(d.valeur))).map((d) => `${d.contextes.at(-1)} { ${d.prop}: ${d.valeur} }`);
    assert.deepEqual(fautes, [], `${f} : couleur écrite en dur — passer par un token de zabelie-theme.css`);
  }
});

test("VD2 — la vitrine bascule avec le thème, et ses rayons sont des crans de l'échelle", () => {
  const vitrine = declarations(readFileSync("app/home-vivant.css", "utf8")).filter((d) => /\.home-vitrine(-tile)?\b/.test(d.contextes.at(-1) ?? ""));
  assert.ok(vitrine.length >= 15, `${vitrine.length} déclarations de vitrine lues`);
  const jetons = new Set(vitrine.flatMap((d) => [...d.valeur.matchAll(/var\(--color-([a-z0-9-]+)\)/g)].map((m) => m[1])));
  assert.ok(jetons.size >= 4, `jetons de couleur lus : ${[...jetons].join(", ")}`);
  for (const j of jetons) {
    // Défini en clair (@theme) ET redéfini dans le bloc sombre : il bascule.
    assert.match(THEME.slice(0, THEME.indexOf('[data-theme="dark"]')), new RegExp(`--color-${j}:`), `--color-${j} absent de la palette claire`);
    assert.match(SOMBRE, new RegExp(`--color-${j}:`), `--color-${j} ne bascule pas en mode sombre`);
  }
  const rayons = vitrine.filter((d) => d.prop === "border-radius");
  assert.ok(rayons.length >= 4, `${rayons.length} rayons de vitrine lus (clair et téléphone)`);
  for (const r of rayons) {
    assert.match(r.valeur, /^var\(--radius-(xl|2xl|3xl|card)\)$/, `rayon hors échelle : ${r.contextes.at(-1)} { border-radius: ${r.valeur} }`);
  }
});

// ── Le noir pur et le blanc pur des classes Tailwind : un cliquet ──────────

function tsx(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e).replace(/\\/g, "/");
    if (statSync(f).isDirectory()) tsx(f, out);
    else if (f.endsWith(".tsx")) out.push(f);
  }
  return out;
}
const NOIR_BLANC = /(?<![\w-])(?:[\w-]+:)*(?:bg|text|border|ring|from|via|to|fill|stroke|shadow|outline|divide|decoration|caret)-(?:black|white)(?![\w-])/g;

/**
 * Les classes `*-black` / `*-white` qui restent, MESURÉES le 2026-10-27 sur la
 * branche du lot 6 (`search-box.tsx` en sort). Elles vivent dans des fichiers
 * d'autres chantiers (admin, carte, essayage) : un cliquet, pas un gel — rouge
 * si un fichier en gagne, rouge s'il en perd sans décrément ici.
 */
const NOIR_BLANC_INVENTAIRE: Record<string, number> = {
  "components/admin-mfa-form.tsx": 1,
  "components/admin/identity-block.tsx": 3,
  "components/admin/menu-badges.tsx": 1,
  "components/essayage-feuille.tsx": 1,
  "components/geo-map.tsx": 1,
};

test("VD3 — le noir pur et le blanc pur ne gagnent aucune classe (cliquet)", () => {
  assert.equal("x hover:bg-black/20 y".match(NOIR_BLANC)?.length, 1, "instrument : hover:bg-black/20 non vu");
  assert.equal("text-white bg-white/10".match(NOIR_BLANC)?.length, 2, "instrument : text-white non vu");
  assert.equal("bg-black-ink text-whitesmoke".match(NOIR_BLANC), null, "instrument : faux positif sur un préfixe");
  const reel: Record<string, number> = {};
  for (const f of [...tsx("app"), ...tsx("components")]) {
    const n = (readFileSync(f, "utf8").match(NOIR_BLANC) ?? []).length;
    if (n) reel[f] = n;
  }
  assert.deepEqual(
    reel,
    NOIR_BLANC_INVENTAIRE,
    "Classe noire ou blanche pure : utiliser un token (bg-brand/10, bg-line/40, text-on-chrome…). " +
      "Si une classe a DISPARU, décrémenter l'inventaire dans le même commit."
  );
});
