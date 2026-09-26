import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RootError from "../app/global-error";
import { ERR } from "../lib/i18n-erreur";
import { DELAI_MS, estEchecDeChargement, rechargerUneFois } from "../lib/rechargement-chunk";

/**
 * FICHIER DE L'APPLICATION INTROUVABLE → rechargement, une seule fois.
 * Mesuré le 2026-09-26 sur zabelie.com : après un déploiement, une page ouverte
 * avant demandait un fichier JS disparu (404) ; la frontière d'erreur prenait
 * le relais et « Réessayer » (`reset()`) rejouait l'échec à l'infini.
 */

function stockage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

test("R1 — reconnaît un échec de chargement, et seulement lui", () => {
  const chunk = Object.assign(new Error("Loading chunk 4824 failed.\n(error: https://zabelie.com/_next/static/chunks/4824-abc.js)"), { name: "ChunkLoadError" });
  assert.equal(estEchecDeChargement(chunk), true);
  assert.equal(estEchecDeChargement(new Error("Loading chunk app/vendre/physique/page failed.")), true, "par le message seul");
  assert.equal(estEchecDeChargement(new Error("Loading CSS chunk 123 failed.")), true);
  for (const non of [new Error("panne simulée"), new TypeError("x is undefined"), null, undefined, "Loading chunk 1 failed", { message: 42 }]) {
    assert.equal(estEchecDeChargement(non), false, `faux positif : ${String(non)}`);
  }
});

test("R2 — un seul rechargement par fenêtre : jamais de boucle", () => {
  const s = stockage();
  let n = 0;
  const t0 = 1_000_000;
  assert.equal(rechargerUneFois(s, t0, () => n++), true);
  assert.equal(rechargerUneFois(s, t0 + 1_000, () => n++), false, "second échec juste après le rechargement : on montre l'écran, on ne boucle pas");
  assert.equal(rechargerUneFois(s, t0 + DELAI_MS + 1, () => n++), true, "plus tard, un nouvel échec a droit à son rechargement");
  assert.equal(n, 2);
});

test("R3 — stockage absent ou bloqué : aucun rechargement automatique", () => {
  let n = 0;
  assert.equal(rechargerUneFois(null, 1, () => n++), false);
  const bloque = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => {} };
  assert.equal(rechargerUneFois(bloque, 1, () => n++), false);
  assert.equal(n, 0);
});

test("R4 — les deux frontières d'erreur branchent le rechargement, et « Réessayer » recharge sur un échec de chargement", () => {
  for (const f of ["app/error.tsx", "app/global-error.tsx"]) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.match(src, /const echecDeChargement = estEchecDeChargement\(error\);/, `${f} : l'erreur n'est pas examinée`);
    assert.match(src, /if \(echecDeChargement\) rechargerUneFois\(stockageSession\(\), Date\.now\(\), \(\) => window\.location\.reload\(\)\)/, `${f} : pas de rechargement automatique`);
    assert.match(src, /onClick=\{echecDeChargement \? \(\) => window\.location\.reload\(\) : reset\}/, `${f} : « Réessayer » rejouerait l'échec`);
  }
});

test("R5 — la frontière racine rend sans lever, porte <html>/<body> et ses libellés", () => {
  const html = renderToStaticMarkup(createElement(RootError, { error: new Error("panne racine"), reset: () => { throw new Error("reset au rendu"); } }));
  assert.match(html, /^<html lang="fr">(<head><\/head>)?<body/);
  const texte = html.replace(/&#x27;/g, "'");
  for (const l of [ERR.fr.title, ERR.fr.retry, ERR.fr.home]) assert.ok(texte.includes(l), `libellé absent : ${l}`);
});
