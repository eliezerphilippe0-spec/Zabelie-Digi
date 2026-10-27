import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DICT, LANGS, t, type Lang } from "@/lib/i18n";
import { loadRoute } from "./helpers/route-harness";

/**
 * PAGES DE PAIEMENT : ICÔNES TRACÉES, ONGLETS TRADUITS — audit du système de
 * design du 2026-10-27, constat m10.
 *
 * Mesuré à `acc72c9` : la pastille d'état des trois pages de paiement portait
 * un GLYPHE — ✓ (succès), × (échec), ⏳ (en attente) — sans `aria-hidden`. Un
 * glyphe dépend de la police du téléphone : sur un Android d'entrée de gamme,
 * ⏳ sort en emoji couleur ou en carré vide, et un lecteur d'écran annonce
 * « coche » ou « sablier » avant le titre qui dit déjà la même chose. Et les
 * titres d'onglet étaient en français fixe (`export const metadata`), y compris
 * celui du tableau de bord vendeur.
 *
 * Les titres des trois pages de paiement sont EXÉCUTÉS par S12
 * (`tests/paiement-succes.test.ts`) ; ce fichier garde les pastilles, et le
 * titre du tableau de bord.
 */

const PAGES = ["app/paiement/succes/page.tsx", "app/paiement/echec/page.tsx", "app/paiement/en-attente/page.tsx"];
const sansCommentaires = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Les glyphes d'état qui dépendent de la police, et leurs proches parents. */
const GLYPHES = /[✓✔✗✕✖×⏳⌛✅❌]/u;

/** La pastille d'état : un `span` rond à fond de statut, dont le PREMIER enfant est un SVG décoratif. */
const PASTILLE =
  /<span\s+className="[^"]*\brounded-full\b[^"]*\bbg-(success|danger|warning)\b[^"]*"\s*>\s*<svg\b([^>]*)>/g;

test("PI0 — l'instrument : un glyphe est vu, une pastille sans aria-hidden aussi", () => {
  assert.ok(GLYPHES.test("<span>✓</span>") && GLYPHES.test("×") && GLYPHES.test("⏳"));
  assert.ok(!GLYPHES.test(`<path d="M5 12.5l4.5 4.5L19 7.5" />`), "un tracé SVG n'est pas un glyphe");
  const nue = `<span className="mx-auto grid rounded-full bg-danger text-ink"><svg viewBox="0 0 24 24">`;
  const m = [...nue.matchAll(PASTILLE)];
  assert.equal(m.length, 1, "la pastille doit être reconnue");
  assert.doesNotMatch(m[0][2], /aria-hidden="true"/, "connu-négatif : cette pastille n'est PAS décorative");
});

test("PI1 — chaque pastille d'état est un SVG aria-hidden, et aucun glyphe n'est rendu", () => {
  const vues = new Set<string>();
  for (const f of PAGES) {
    const code = sansCommentaires(readFileSync(f, "utf8"));
    assert.doesNotMatch(code, GLYPHES, `${f} rend encore un glyphe d'état (dépend de la police du téléphone)`);
    const pastilles = [...code.matchAll(PASTILLE)];
    assert.equal(pastilles.length, 1, `${f} : ${pastilles.length} pastille(s) d'état tracée(s) au lieu d'une`);
    for (const p of pastilles) {
      vues.add(p[1]);
      assert.match(p[2], /aria-hidden="true"/, `${f} : l'icône d'état doit être décorative (le titre dit l'état)`);
    }
  }
  // Les trois états, et pas trois fois le même : sinon un copier-coller passerait.
  assert.deepEqual([...vues].sort(), ["danger", "success", "warning"]);
});

test("PI2 — l'onglet du tableau de bord est dans la langue de session, hors index", async () => {
  const f = "app/tableau-de-bord/page.tsx";
  assert.doesNotMatch(readFileSync(f, "utf8"), /export const metadata\b/, "un titre fixe est revenu à côté de generateMetadata");
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  for (const lang of LANGS) {
    const mod = loadRoute(f, {
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
      "@/lib/i18n": { t },
      "@/lib/i18n-server": { getLang: async () => lang },
    }) as unknown as { generateMetadata?: () => Promise<{ title?: string; robots?: unknown }> };
    assert.equal(typeof mod.generateMetadata, "function", "generateMetadata n'est plus exportée");
    const meta = await mod.generateMetadata!();
    assert.equal(meta.title, `${(DICT[lang as Lang] as Record<string, string>)["nav.dashboard"]} — Zabelie`, `titre (${lang})`);
    assert.deepEqual({ ...(meta.robots as object) }, { index: false, follow: false }, `le tableau de bord (${lang}) peut être indexé`);
  }
  // Connu-négatif de la langue : le kreyòl ne rend PAS le titre français.
  assert.notEqual(DICT.ht["nav.dashboard"], DICT.fr["nav.dashboard"]);
});

test("PI3 — l'onglet d'échec et d'attente dit le MÊME mot que le titre de la page", () => {
  /* Le français fixe d'avant disait « Paiement échoué » au-dessus d'une page
     titrée « Paiement non confirmé » : l'onglet affirmait plus que la page. La
     liaison est vérifiée sur la source : la clé du <h1> est celle du titre. */
  for (const f of ["app/paiement/echec/page.tsx", "app/paiement/en-attente/page.tsx"]) {
    const src = readFileSync(f, "utf8");
    const h1 = /<h1\b[^>]*>\{t\(lang, "([^"]+)"\)\}<\/h1>/.exec(src)?.[1];
    assert.ok(h1, `${f} : <h1> introuvable`);
    assert.match(
      src,
      new RegExp(`export async function generateMetadata\\(\\) \\{\\s*const lang = await getLang\\(\\);\\s*return \\{ title: \`\\$\\{t\\(lang, "${h1!.replace(/\./g, "\\.")}"\\)\\} — Zabelie\``),
      `${f} : le titre d'onglet ne reprend pas la clé du <h1> (${h1})`
    );
  }
});
