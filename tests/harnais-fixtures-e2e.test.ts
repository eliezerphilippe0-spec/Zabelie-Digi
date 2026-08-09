import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import playwrightConfig from "@/playwright.config";
import { PRODUCTS } from "@/lib/sample-data";

/**
 * CROISEMENT — la garde et son activateur vivent dans deux fichiers.
 *
 * `demoFixturesEnabled()` (lib/products.ts) fait des fixtures un opt-in : sans
 * `ZABELIE_DEMO_FIXTURES=true`, le mode démo n'a AUCUN produit. C'est voulu, et
 * `tests/fixtures-gate.test.ts` le prouve.
 *
 * Mais le projet e2e `chromium` tourne précisément en mode démo : sa fiche
 * produit N'EXISTE que par ces fixtures. Poser la garde sans poser le drapeau
 * dans le harnais a mis trois tests au rouge — et le rouge est arrivé en CI,
 * pas au moment du commit, parce que RIEN dans le dépôt ne reliait les deux
 * fichiers. Même motif que `tests/crons-appelants.test.ts` : un artefact dont
 * l'appelant vit ailleurs ne signale jamais son absence tout seul.
 *
 * Ce test tient le lien dans les deux sens :
 *   1. le serveur du port 3000 pose le drapeau, le serveur du stub ne le pose
 *      pas (il a une base, une fixture y masquerait un défaut) ;
 *   2. chaque slug `/produit/<slug>` cité par ces specs existe VRAIMENT dans
 *      `lib/sample-data.ts` — sinon la fiche est un 404 et l'échec ressemble à
 *      une régression applicative.
 *
 * Vérifié sur cas connu-négatif avant commit : drapeau retiré de
 * playwright.config.ts → le premier test échoue ; slug muté dans
 * money-path.spec.ts → le second échoue en nommant le slug.
 */

type Serveur = { url?: string; env?: Record<string, string | number | boolean> };

function serveurs(): Serveur[] {
  const w = playwrightConfig.webServer;
  assert.ok(Array.isArray(w), "webServer doit rester une liste de serveurs");
  return w as Serveur[];
}

test("le serveur du mode démo (port 3000) active les fixtures, lui seul", () => {
  const liste = serveurs();

  const demo = liste.filter((s) => s.url?.includes(":3000"));
  assert.equal(
    demo.length,
    1,
    `un seul serveur doit servir le port 3000, trouvé ${demo.length}`
  );
  assert.equal(
    demo[0].env?.ZABELIE_DEMO_FIXTURES,
    "true",
    "Le projet `chromium` tourne sans Supabase : son catalogue EST celui de " +
      "lib/sample-data.ts. Sans ZABELIE_DEMO_FIXTURES=true sur ce serveur, " +
      "/produit/<slug> est introuvable — plus de bouton MonCash, métadonnées " +
      "génériques. Poser le drapeau dans playwright.config.ts, pas dans la CI."
  );

  const autres = liste.filter((s) => !s.url?.includes(":3000"));
  for (const s of autres) {
    assert.equal(
      s.env?.ZABELIE_DEMO_FIXTURES,
      undefined,
      `Le serveur ${s.url} a une base : une fixture y masquerait un défaut. ` +
        "Le drapeau appartient au seul serveur du mode démo."
    );
  }
});

test("chaque slug cité par les specs du mode démo existe dans les fixtures", () => {
  // Le projet `physique` est exclu par `testIgnore: /parcours-physique/` :
  // il est adossé au stub Supabase, ses slugs viennent d'ailleurs.
  const specs = readdirSync("e2e").filter(
    (f) => f.endsWith(".spec.ts") && !/parcours-physique/.test(f)
  );
  assert.ok(
    specs.length > 0,
    "aucune spec du mode démo trouvée — le croisement serait vide, donc vert " +
      "sans rien prouver. Le répertoire e2e/ ou le nom des specs a changé."
  );

  const connus = new Set(PRODUCTS.map((p) => p.slug));
  const cites = new Map<string, string>(); // slug -> première spec qui le cite

  for (const nom of specs) {
    const src = readFileSync(`e2e/${nom}`, "utf8");
    for (const m of src.matchAll(/["'`]\/produit\/([a-z0-9-]+)/g)) {
      if (!cites.has(m[1])) cites.set(m[1], nom);
    }
  }

  assert.ok(
    cites.size > 0,
    "aucun slug /produit/<slug> trouvé dans les specs du mode démo — le " +
      "croisement ne prouve plus rien. Adapter le motif si la forme de " +
      "l'URL a changé."
  );

  for (const [slug, nom] of cites) {
    assert.ok(
      connus.has(slug),
      `e2e/${nom} demande /produit/${slug}, absent de lib/sample-data.ts. ` +
        "En mode démo la fiche répondra 404 et l'échec e2e se lira comme une " +
        "régression applicative."
    );
  }
});
