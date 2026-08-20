import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * `dev` et `build` doivent utiliser LE MÊME empaqueteur.
 *
 * ⚠️ CE FICHIER EXISTE PARCE QUE `npm run dev` ÉTAIT CASSÉ SUR `main`.
 * Constaté le 2026-08-20 en lançant la commande :
 *
 *     ⨯ ERROR: This build is using Turbopack, with a `webpack` config
 *       and no `turbopack` config.
 *
 * Next 16 lance `dev` avec Turbopack par défaut. `@serwist/next` (PWA,
 * `docs/32`) enveloppe `next.config.mjs` et y injecte une configuration
 * `webpack` — les deux se contredisent, et le serveur refuse de démarrer.
 *
 * Le détail qui fait de ce défaut un cas d'école : **`build` portait déjà le
 * drapeau.** `"build": "next build --webpack"` — quelqu'un a rencontré le
 * problème, l'a corrigé d'un côté, et n'a pas vu l'autre. La CI ne pouvait
 * rien dire : elle exécute `build`, jamais `dev`. Seul quelqu'un qui tape
 * `npm run dev` le découvre — et il n'a aucune raison de soupçonner le dépôt
 * plutôt que sa machine.
 *
 * Ce test ne juge pas QUEL empaqueteur est le bon. Il exige seulement que les
 * deux scripts s'accordent : c'est ce qui se vérifie mécaniquement, et c'est
 * exactement ce qui a manqué.
 */

const PKG = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

/** `--webpack` ou `--turbopack` — l'empaqueteur explicitement demandé, s'il l'est. */
function empaqueteur(script: string): "webpack" | "turbopack" | "défaut" {
  if (/--webpack\b/.test(script)) return "webpack";
  if (/--turbopack\b/.test(script)) return "turbopack";
  return "défaut";
}

test("les scripts dev et build existent — sinon ce test ne compare rien", () => {
  assert.ok(PKG.scripts?.dev, "script `dev` absent de package.json");
  assert.ok(PKG.scripts?.build, "script `build` absent de package.json");
});

test("dev et build demandent le MÊME empaqueteur", () => {
  const dev = empaqueteur(PKG.scripts.dev);
  const build = empaqueteur(PKG.scripts.build);

  assert.equal(
    dev,
    build,
    `\`dev\` utilise « ${dev} » et \`build\` utilise « ${build} ».\n` +
      `dev   = ${PKG.scripts.dev}\n` +
      `build = ${PKG.scripts.build}\n` +
      `Next 16 lance dev avec Turbopack par défaut, et @serwist/next injecte une config webpack : les deux se contredisent et le serveur REFUSE DE DÉMARRER. La CI ne le voit pas — elle exécute build, jamais dev. Seul quelqu'un qui tape \`npm run dev\` le découvre, et il soupçonnera sa machine avant le dépôt.`
  );
});

test("l'empaqueteur est EXPLICITE des deux côtés tant que next.config porte une config webpack", () => {
  /* Le défaut de la plateforme change d'une version majeure à l'autre — c'est
     précisément ce qui a produit la panne au passage à Next 16. Tant qu'un
     plugin injecte du webpack, s'en remettre au défaut est une garantie tenue
     par une coïncidence de version. */
  const config = readFileSync("next.config.mjs", "utf8");
  const injecteWebpack = /withSerwistInit|webpack\s*[:(]/.test(config);

  if (!injecteWebpack) return; // plus de config webpack : le défaut redevient sûr

  for (const nom of ["dev", "build"] as const) {
    assert.notEqual(
      empaqueteur(PKG.scripts[nom]),
      "défaut",
      `\`${nom}\` s'en remet à l'empaqueteur par défaut alors que next.config.mjs porte une configuration webpack (via @serwist/next). Le défaut a changé à Next 16 et cassera de nouveau au prochain changement. Posez --webpack ou --turbopack explicitement.`
    );
  }
});
