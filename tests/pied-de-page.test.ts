import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { etatDisponibilite } from "../lib/payment-availability";

/**
 * PIED DE PAGE — refonte du 2026-09-26. Demande porteur : six rubriques sur
 * UNE rangée dès 1 200 px, compact, et « éviter les doublons ».
 */

const brut = readFileSync("components/site-footer.tsx", "utf8");
const SRC = brut.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");

/** Chaque cible de lien, littérale (`href="…"`) ou calculée (`href={…}`). */
function cibles(src: string): string[] {
  return [...src.matchAll(/href=(?:"([^"]+)"|\{([^}]+)\})/g)].map((m) => m[1] ?? `{${m[2]}}`);
}

test("P1 — l'instrument voit un doublon, littéral ou calculé (cas connus)", () => {
  assert.deepEqual(cibles('<a href="/aide">x</a><Link href={POLICY_PATH}>y</Link>'), ["/aide", "{POLICY_PATH}"]);
  const d = cibles('<a href="/aide"/><a href="/aide"/>');
  assert.notEqual(new Set(d).size, d.length);
});

test("P2 — aucun lien n'apparaît deux fois dans le pied de page", () => {
  const c = cibles(SRC);
  assert.ok(c.length >= 15, `témoin : seulement ${c.length} liens lus — le motif ne lit plus le fichier`);
  const doublons = c.filter((h, i) => c.indexOf(h) !== i);
  assert.deepEqual(doublons, [], `lien en double : ${doublons.join(", ")}`);
});

test("P3 — la barre du bas ne répète aucun lien (légal compris)", () => {
  const i = SRC.lastIndexOf('<div className="border-t border-on-chrome/15">');
  assert.ok(i > 0, "barre du bas introuvable");
  assert.deepEqual(cibles(SRC.slice(i)), []);
});

test("P4 — six rubriques, une seule rangée dès 1 200 px", () => {
  assert.match(SRC, /min-\[1200px\]:grid-cols-\[1\.25fr_1fr_1fr_1fr_1fr_1\.2fr\]/);
  // Mesuré le 2026-09-26 : `md:grid-cols-3` sans borne est émis APRÈS la
  // règle 1 200 px et l'écrase — deux rangées à 1 920 px, suite verte.
  const grille = SRC.match(/<div className="grid [^"]*grid-cols-\[1\.25fr[^"]*"/)?.[0] ?? "";
  assert.ok(grille, "grille du pied introuvable");
  for (const c of grille.match(/\S*grid-cols-\S*/g) ?? []) {
    assert.ok(c.startsWith("min-[1200px]:") || /max-\[1199px\]:/.test(c), `règle de colonnes non bornée sous 1 200 px : ${c}`);
  }
  assert.equal(SRC.match(/<FooterSection titre=/g)?.length, 5, "cinq rubriques repliables + le bloc Zabelie");
  assert.equal(SRC.match(/<footer[\s>]/g)?.length, 1, "un seul pied de page");
});

test("P5 — une seule description de Zabelie", () => {
  assert.equal(SRC.match(/footer\.tagline/g)?.length, 1);
});

test("P6 — un moyen de paiement n'est « Actif » qu'en production", () => {
  assert.equal(etatDisponibilite("production", "soon"), "active");
  assert.equal(etatDisponibilite("sandbox", "soon"), "test");
  assert.equal(etatDisponibilite("unavailable", "soon"), "soon");
  assert.equal(etatDisponibilite("unavailable", "off"), "off");
  assert.match(SRC, /nom: "MonCash", etat: etatDisponibilite\(getMonCashAvailability\(\), "off"\)/);
  assert.match(SRC, /etat: isStripeEnabled\(\) \? "active" : "soon"/);
});

test("P7 — sans JavaScript, les rubriques sont OUVERTES (le repli n'est qu'une amélioration)", () => {
  const s = readFileSync("components/footer-section.tsx", "utf8");
  assert.match(s, /<details ref=\{ref\} open[\s>]/);
  assert.match(s, /el\.open = !mq\.matches;/);
});
