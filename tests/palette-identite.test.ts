import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lirePalettes } from "../scripts/zabelie-contrast.mjs";
import { BRAND_INK } from "@/lib/brand";

/**
 * L'IDENTITÉ DANS LES DEUX MODES (revue des couleurs du 2026-10-17).
 *
 * Trois écarts mesurés ce jour-là : en sombre, l'en-tête brun-noir se
 * confondait avec le fond et l'indigo de la marque disparaissait ; la couleur
 * « info » était la jumelle du texte secondaire (identique en sombre) ; trois
 * teintes d'illustration vivaient en dur dans une feuille de page.
 */
const CSS = readFileSync("app/zabelie-theme.css", "utf8");
const { sombre, clair } = lirePalettes(CSS) as { sombre: Record<string, string>; clair: Record<string, string> };

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ecart = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("I1 — le chrome garde l'indigo de la marque dans les deux modes", () => {
  for (const k of ["chrome", "chrome-2", "chrome-3"]) {
    assert.equal(sombre[k]?.toLowerCase(), clair[k]?.toLowerCase(), `--color-${k} diverge entre clair et sombre`);
  }
  /* La barre d'adresse Android (`themeColor`) prolonge l'en-tête. */
  assert.equal(clair.chrome.toLowerCase(), BRAND_INK.toLowerCase());
  /* Et en sombre, l'en-tête se détache du fond : par la teinte (indigo
   * contre brun) plus que par la luminance, mais il ne doit plus en être le
   * presque-jumeau (#100c09 sur #070505 : 1,07:1, même teinte). */
  const e = ecart(sombre.chrome, sombre["bg-3"]);
  assert.ok(e >= 1.1, `en-tête et fond indiscernables en sombre (${e.toFixed(2)}:1)`);
  const [r, , b] = rgb(sombre.chrome);
  assert.ok(b > r + 20, "l'en-tête sombre n'est plus indigo");
});

test("I2 — « info » ne se confond plus avec le texte secondaire", () => {
  for (const [nom, P] of [["clair", clair], ["sombre", sombre]] as const) {
    assert.notEqual(P["info-text"].toLowerCase(), P.mist.toLowerCase(), `info = mist en ${nom}`);
    const [r, , b] = rgb(P["info-text"]);
    assert.ok(b > r + 20, `info n'est plus un bleu d'encre en ${nom} (${P["info-text"]})`);
  }
});

test("I3 — les teintes d'illustration sont des tokens, plus des hex dans la page", () => {
  for (const [nom, P] of [["clair", clair], ["sombre", sombre]] as const) {
    for (const k of ["illus-1", "illus-2", "illus-3"]) assert.match(P[k] ?? "", /^#[0-9a-f]{6}$/i, `--color-${k} absent en ${nom}`);
  }
  const page = readFileSync("app/home-vivant.css", "utf8");
  const regles = page.split("\n").filter((l) => l.includes(".universe-art {") && l.includes("nth-child"));
  assert.ok(regles.length >= 3, "règles des teintes introuvables");
  for (const l of regles) assert.doesNotMatch(l, /#[0-9a-f]{3,6}\b|color-mix/i, `teinte en dur : ${l.trim()}`);
  assert.doesNotMatch(page, /\[data-theme="dark"\] \.universe-grid/, "le sombre a de nouveau ses propres règles de teinte");
});
