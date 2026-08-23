import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { resolveMonCashMode, monCashGatewayHost, sondeMonCash } from "@/lib/moncash";

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

test("R1 — les deux valeurs légitimes passent, avec leur SOURCE", () => {
  assert.deepEqual(resolveMonCashMode("sandbox"), { mode: "sandbox", source: "explicite" });
  assert.deepEqual(resolveMonCashMode("production"), { mode: "production", source: "explicite" });
});

test("R2 — l'absence vaut sandbox, mais elle ne se CONFOND plus avec un choix", () => {
  /* ⚠️ LE POINT SOULEVÉ PAR LA REVUE PORTEUR DU 2026-08-22, et il était juste :
   * la première version rendait `"sandbox"` tout court pour une variable
   * absente. C'est LA MÊME PANNE PAR UNE AUTRE PORTE — quelqu'un qui supprime
   * `MONCASH_MODE` d'un déploiement de production retombe en bac à sable sans
   * un mot, et l'on recommence les cinq échecs sans même un espace à
   * incriminer.
   *
   * Le mode ne change pas (casser le local de tout le monde pour se prémunir
   * d'une suppression en production serait un mauvais échange). Ce qui change,
   * c'est que les deux états du monde cessent de produire la même chaîne. */
  assert.deepEqual(resolveMonCashMode(undefined), { mode: "sandbox", source: "absente" });
  assert.deepEqual(resolveMonCashMode(""), { mode: "sandbox", source: "vide" });
  assert.deepEqual(resolveMonCashMode("   "), { mode: "sandbox", source: "vide" });

  /* Le connu-négatif qui donne son sens au précédent : un `sandbox` CHOISI et
   * un `sandbox` SUBI ont le même mode et des sources différentes. */
  assert.equal(resolveMonCashMode("sandbox").mode, resolveMonCashMode(undefined).mode);
  assert.notEqual(resolveMonCashMode("sandbox").source, resolveMonCashMode(undefined).source);
});

test("R3 — LE CAS QUI A ARMÉ LE PIÈGE : casse et espaces, normalisés", () => {
  /* Ces quatre-là retombaient SILENCIEUSEMENT en bac à sable. Ce sont
   * exactement les formes qu'un champ de formulaire produit : un copier-coller
   * qui emporte un espace, une majuscule d'autocorrection. */
  for (const brut of ["Production", "production ", " production", "PRODUCTION", "\tproduction\n"]) {
    assert.deepEqual(
      resolveMonCashMode(brut),
      { mode: "production", source: "explicite" },
      `« ${JSON.stringify(brut)} » doit valoir production, et compter comme un CHOIX`
    );
  }
  assert.deepEqual(resolveMonCashMode("Sandbox "), { mode: "sandbox", source: "explicite" });
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

test("R7 — le pré-vol est CÂBLÉ à la route, et aucun secret ne sort", () => {
  const src = readFileSync("app/api/admin/coherence/route.ts", "utf8");
  assert.match(
    src,
    /moncash: \{ configure: Boolean\(process\.env\.MONCASH_CLIENT_ID\), \.\.\.sondeMonCash\(\) \}/,
    "le bloc `moncash` n'expose plus le pré-vol : il faudrait de nouveau " +
      "dépenser 300 HTG pour savoir chez qui on encaisse"
  );
  /* ⚠️ ET LE SECRET NE SORT PAS. Même règle qu'`integrations-sonde` I3 : la
   * présence d'un identifiant se lit par un booléen, jamais par sa valeur. */
  assert.ok(
    !/process\.env\.MONCASH_CLIENT_SECRET/.test(src),
    "MONCASH_CLIENT_SECRET est déréférencée dans une route qui répond en HTTP"
  );
});

/**
 * ─────────── LE PRÉ-VOL, EXÉCUTÉ — pas relu ───────────
 *
 * ⚠️ EXIGENCE DE LA REVUE PORTEUR DU 2026-08-22, et elle corrige un vrai
 * manque : la première version de R8 se contentait de CHERCHER le `catch` dans
 * le texte du fichier. Un `try` peut être présent et n'attraper rien —
 * exactement le piège de sous-chaîne que `CLAUDE.md` décrit. La sonde a donc
 * quitté le fichier de route pour `lib/moncash.ts`, afin d'être APPELÉE.
 *
 * ⚠️ ET UNE CORRECTION À LA REVUE, parce qu'elle change le cas de test :
 * `MONCASH_MODE=" production"` (espace de tête) ne rend PAS « illisible ». Il
 * rend `production` — c'est précisément ce que la normalisation est là pour
 * faire, et l'exiger « illisible » aurait bloqué le porteur au pire moment.
 * Les valeurs qui rendent « illisible » sont les AMBIGUËS : `prod`, `live`.
 */
function sousMode<T>(valeur: string | undefined, corps: () => T): T {
  const avant = process.env.MONCASH_MODE;
  const err = console.error;
  const info = console.info;
  console.error = () => {};
  console.info = () => {};
  if (valeur === undefined) delete process.env.MONCASH_MODE;
  else process.env.MONCASH_MODE = valeur;
  try {
    return corps();
  } finally {
    console.error = err;
    console.info = info;
    if (avant === undefined) delete process.env.MONCASH_MODE;
    else process.env.MONCASH_MODE = avant;
  }
}

test("R8 — le pré-vol rend un VERDICT sur une valeur illisible, il ne lève pas", () => {
  /* Le cas que la revue redoutait, dans sa forme réelle : une valeur ambiguë.
   * Une 500 ici laisserait le porteur sans lecture au moment du geste 5. */
  for (const mauvais of ["prod", "live", "true", "1", "on"]) {
    const r = sousMode(mauvais, () => sondeMonCash());
    assert.equal(r.mode, "illisible", `« ${mauvais} » doit rendre un verdict`);
    assert.equal(r.source, "illisible");
    assert.equal(r.hote, null);
    assert.equal(r.bascule.pret, false, "une valeur ambiguë n'est JAMAIS prête");
    assert.match(r.bascule.raison!, /ambigu/);
  }
});

test("R9 — le pré-vol ne lève JAMAIS, quelle que soit l'entrée", () => {
  /* Batterie hostile. L'assertion n'est pas « la valeur est bonne » mais
   * « la fonction rend », ce qui est la propriété dont dépend le geste 5. */
  const hostiles = [
    undefined, "", "   ", "prod", "PRODUCTION", " production", "production ",
    "sandbox", "\u0000", "sandbox\u0000", "🙂", "a".repeat(5000), "null",
    "undefined", "[object Object]", "production;drop", "sand box",
  ];
  for (const v of hostiles) {
    const r = sousMode(v, () => {
      try {
        return sondeMonCash();
      } catch (e) {
        assert.fail(`sondeMonCash a LEVÉ sur ${JSON.stringify(v)} : ${e}`);
      }
    });
    assert.ok(typeof r.mode === "string" && r.mode.length > 0);
    assert.ok(r.hote === null || typeof r.hote === "string");
    // Un hôte non nul implique un mode réel — jamais « illisible » avec un hôte.
    assert.equal(r.hote === null, r.mode === "illisible");
  }
});

test("R10 — le pré-vol distingue le sandbox CHOISI du sandbox SUBI", () => {
  /* La correction demandée par la revue, vue depuis la route : c'est la ligne
   * que le porteur lira au geste 5. Sans `source`, les deux sont la même
   * chaîne, et une variable supprimée par erreur passe pour un choix. */
  const choisi = sousMode("sandbox", () => sondeMonCash());
  const subi = sousMode(undefined, () => sondeMonCash());
  const vide = sousMode("", () => sondeMonCash());

  assert.equal(choisi.mode, "sandbox");
  assert.equal(subi.mode, "sandbox");
  assert.equal(choisi.source, "explicite");
  assert.equal(subi.source, "absente");
  assert.equal(vide.source, "vide");
  assert.notDeepEqual(choisi, subi, "les deux états du monde sont redevenus indiscernables");

  // Et le cas nominal du geste 5, celui qu'il doit lire après la bascule.
  assert.deepEqual(sousMode("production", () => sondeMonCash()), {
    mode: "production",
    source: "explicite",
    hote: "moncashbutton.digicelgroup.com",
    bascule: { pret: true, raison: null },
  });
});

test("R12 — le pré-vol RELÈVE la bascule, il ne la fait pas deviner", () => {
  /* ⚠️ SECONDE REVUE PORTEUR (2026-08-22) : « le pré-vol n'est réputé passé que
   * si source = explicite — les trois autres états sont des arrêts, y compris
   * `absente`, même si le repli sandbox est sûr ».
   *
   * Sans ce champ, le geste 5 demande de comparer trois valeurs de tête et de
   * conclure : une impression, pas un relevé. Et l'erreur naturelle est de lire
   * `sandbox / absente` comme rassurant — le repli est sûr pour la SÉCURITÉ, il
   * est une panne de REVENU que rien à l'écran ne montre. */
  const cas: [string | undefined, boolean][] = [
    ["production", true],   // le seul état prêt
    ["Production ", true],  // normalisé → toujours prêt
    ["sandbox", false],     // choisi, correct en dev, pas prêt
    [undefined, false],     // ⚠️ le cas de la revue : sûr, mais pas prêt
    ["", false],
    ["prod", false],        // ambigu
  ];
  for (const [valeur, attendu] of cas) {
    const r = sousMode(valeur, () => sondeMonCash());
    assert.equal(
      r.bascule.pret,
      attendu,
      `MONCASH_MODE=${JSON.stringify(valeur)} → pret devrait valoir ${attendu}`
    );
    /* Un arrêt sans raison serait un arrêt qu'on ne sait pas lever. Et un
     * « prêt » qui porterait une raison serait un garde qui hésite. */
    assert.equal(
      r.bascule.raison === null,
      attendu,
      `MONCASH_MODE=${JSON.stringify(valeur)} : la raison ne suit pas le verdict`
    );
  }

  /* Le connu-négatif qui donne son sens au tableau : `absente` et `sandbox`
   * explicite rendent le MÊME mode et le MÊME hôte. Seules la source et la
   * raison les séparent — c'est-à-dire exactement ce que la revue a demandé. */
  const subi = sousMode(undefined, () => sondeMonCash());
  const choisi = sousMode("sandbox", () => sondeMonCash());
  assert.equal(subi.mode, choisi.mode);
  assert.equal(subi.hote, choisi.hote);
  assert.notEqual(subi.bascule.raison, choisi.bascule.raison);
});

test("R11 — l'absence de variable est JOURNALISÉE, pas seulement rendue", () => {
  /* Corollaire d'observabilité : un exploitant qui n'ouvre jamais la route doit
   * quand même croiser la ligne. Un `sandbox` par absence de variable sur un
   * déploiement de production est une anomalie. */
  const vus: string[] = [];
  const err = console.error;
  const info = console.info;
  const avant = process.env.MONCASH_MODE;
  console.error = (...a: unknown[]) => vus.push("ERR " + a.map(String).join(" "));
  console.info = (...a: unknown[]) => vus.push("INFO " + a.map(String).join(" "));
  try {
    delete process.env.MONCASH_MODE;
    sondeMonCash();
    assert.match(vus.join("\n"), /ERR .*MONCASH_MODE ABSENTE/, "l'absence ne crie pas");

    vus.length = 0;
    process.env.MONCASH_MODE = "production";
    sondeMonCash();
    // Connu-négatif : le cas sain ne doit pas crier — un garde qui crie
    // toujours ne dit rien.
    assert.ok(!vus.some((l) => l.startsWith("ERR")), "le cas sain journalise une ERREUR");
    assert.match(vus.join("\n"), /INFO .*mode=production \(explicite\)/);
  } finally {
    console.error = err;
    console.info = info;
    if (avant === undefined) delete process.env.MONCASH_MODE;
    else process.env.MONCASH_MODE = avant;
  }
});
