import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveMonCashMode, monCashGatewayHost } from "@/lib/moncash";

/**
 * `MONCASH_MODE` — LE CHAMP DE FORMULAIRE QUI DÉCIDE OÙ VA L'ARGENT.
 *
 * ⚠️ Écrit la veille du geste 4 de `docs/22`, et pour une raison précise :
 * cinq paiements ont déjà échoué en production (2026-08-11 → 08-14), tous
 * parce que le rail encaissait en bac à sable. Le geste 4 consiste à taper
 * `production` dans un champ Vercel. Un espace collé depuis un presse-papier,
 * une majuscule, et c'était une SIXIÈME tentative ratée — cette fois sur un
 * rail qu'on croit réel, avec un acheteur réel devant l'écran.
 *
 * La ligne d'avant :
 *
 *     const mode = (process.env.MONCASH_MODE as MonCashMode) ?? "sandbox";
 *
 * Un `as` n'est pas une vérification. Et `bases()` compare
 * `mode === "production"` avec un `else` binaire : tout ce qui n'est pas
 * exactement cette chaîne retombait en bac à sable, **sans un mot**.
 *
 * C'est la classe dominante de ce dépôt, encore : l'échec se présente comme
 * une réussite. `docs/22` avait nommé le défaut — « la cause n'est pas gardée,
 * seul l'effet est désormais lisible » — et l'effet ne se lit qu'APRÈS avoir
 * engagé un acheteur.
 */

test("R1 — les deux valeurs légitimes passent, telles quelles", () => {
  assert.equal(resolveMonCashMode("sandbox"), "sandbox");
  assert.equal(resolveMonCashMode("production"), "production");
});

test("R2 — l'absence vaut sandbox, et c'est le défaut DOCUMENTÉ", () => {
  /* Ne pas confondre avec les cas illisibles ci-dessous : une variable non
   * posée est un état légitime — c'est celui de tous les environnements de
   * développement. La changer en erreur casserait le local de tout le monde. */
  assert.equal(resolveMonCashMode(undefined), "sandbox");
  assert.equal(resolveMonCashMode(""), "sandbox");
  assert.equal(resolveMonCashMode("   "), "sandbox");
});

test("R3 — LE CAS QUI A ARMÉ LE PIÈGE : casse et espaces, normalisés", () => {
  /* Ces quatre-là retombaient SILENCIEUSEMENT en bac à sable. Ce sont
   * exactement les formes qu'un champ de formulaire produit : un copier-coller
   * qui emporte un espace, une majuscule d'autocorrection. */
  assert.equal(resolveMonCashMode("Production"), "production");
  assert.equal(resolveMonCashMode("production "), "production");
  assert.equal(resolveMonCashMode(" production"), "production");
  assert.equal(resolveMonCashMode("PRODUCTION"), "production");
  assert.equal(resolveMonCashMode("Sandbox "), "sandbox");
});

test("R4 — tout le reste LÈVE : deviner, c'est choisir qui encaisse", () => {
  /* ⚠️ Le connu-positif qui compte. `prod` et `live` sont des abréviations
   * qu'un humain écrit naturellement — et il n'appartient pas au code de
   * décider qu'elles veulent dire « encaisse de l'argent réel ». */
  for (const mauvais of ["prod", "live", "true", "1", "produccion", "sandbox2", "on"]) {
    assert.throws(
      () => resolveMonCashMode(mauvais),
      /MONCASH_MODE/,
      `« ${mauvais} » devrait lever, pas retomber en bac à sable`
    );
  }
  // Le message NOMME la valeur reçue : sans elle, on cherche dans Vercel à
  // l'aveugle. Un espace de fin est invisible dans un champ de formulaire.
  assert.throws(() => resolveMonCashMode("prod"), /« prod »/);
});

test("R5 — l'hôte suit le mode, et c'est bien celui de docs/22", () => {
  assert.equal(monCashGatewayHost("production"), "moncashbutton.digicelgroup.com");
  assert.equal(monCashGatewayHost("sandbox"), "sandbox.moncashbutton.digicelgroup.com");
  /* Connu-négatif structurel : les deux hôtes DIFFÈRENT. Une refactorisation
   * qui les ferait coïncider rendrait toute cette histoire indétectable. */
  assert.notEqual(
    monCashGatewayHost("production"),
    monCashGatewayHost("sandbox"),
    "les deux hôtes sont devenus identiques : le mode ne décide plus de rien"
  );
});

test("R6 — plus AUCUN cast de MONCASH_MODE ne subsiste dans le module", () => {
  /* ⚠️ ASSERTION SUR CE QUI COMMANDE. Vérifier que `resolveMonCashMode` est
   * appelée ne suffirait pas : la fonction pourrait être là, appelée ailleurs,
   * pendant qu'un second site garde le vieux cast. Il y en avait D'AILLEURS
   * DEUX dans le fichier — le second dans `config()`, découvert parce que
   * l'outil d'édition a refusé une ancre non unique, pas parce que je l'avais
   * vu. C'est exactement pour ça que l'assertion porte sur l'ABSENCE. */
  const src = readFileSync("lib/moncash.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  assert.ok(
    !/process\.env\.MONCASH_MODE\s+as\s+/.test(src),
    "un cast `as MonCashMode` est revenu : une valeur malformée retomberait " +
      "en bac à sable sans un mot, et c'est le défaut qui a coûté cinq paiements"
  );
  assert.match(
    src,
    /resolveMonCashMode\(process\.env\.MONCASH_MODE\)/,
    "le mode n'est plus résolu depuis l'environnement"
  );
});

test("R7 — le pré-vol expose le mode ET l'hôte, sans jamais un identifiant", () => {
  /* La raison d'être de la sonde : `docs/22` demandait de créer un paiement
   * puis de lire `payments.raw->>'moncash_host'` — c'est-à-dire d'engager un
   * acheteur réel pour vérifier un champ de formulaire. */
  const src = readFileSync("app/api/admin/coherence/route.ts", "utf8");
  assert.match(
    src,
    /moncash: \{ configure: Boolean\(process\.env\.MONCASH_CLIENT_ID\), \.\.\.sondeMonCash\(\) \}/,
    "le bloc `moncash` n'expose plus le pré-vol : il faudrait de nouveau " +
      "dépenser 300 HTG pour savoir chez qui on encaisse"
  );
  assert.match(
    src,
    /const mode = resolveMonCashMode\(process\.env\.MONCASH_MODE\);[\s\S]{0,120}monCashGatewayHost\(mode\)/,
    "l'hôte rapporté n'est plus dérivé du mode résolu : les deux pourraient " +
      "diverger, ce qui est exactement le défaut qu'on ferme"
  );
  /* ⚠️ ET LE SECRET NE SORT PAS. Même règle qu'`integrations-sonde` I3 : la
   * présence d'un identifiant se lit par un booléen, jamais par sa valeur. */
  assert.ok(
    !/process\.env\.MONCASH_CLIENT_SECRET/.test(src),
    "MONCASH_CLIENT_SECRET est déréférencée dans une route qui répond en HTTP"
  );
});

test("R8 — une valeur illisible ne fait PAS tomber le contrôle comptable", () => {
  /* Le contrôle de cohérence vérifie l'invariant du grand livre (`0033`). Le
   * faire dépendre d'un champ MonCash mal saisi le rendrait indisponible au
   * moment précis où on en a besoin — la veille d'un basculement. La sonde
   * ATTRAPE donc, et rapporte « illisible » comme un résultat. */
  const src = readFileSync("app/api/admin/coherence/route.ts", "utf8");
  assert.match(
    src,
    /catch \(e\) \{[\s\S]{0,260}return \{ mode: "illisible", hote: null \}/,
    "la sonde MonCash ne rattrape plus l'exception : une variable mal saisie " +
      "ferait rendre 500 au contrôle du registre, qui n'a rien à voir avec elle"
  );
});
