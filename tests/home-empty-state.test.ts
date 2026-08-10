import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * V-13 : aucune étagère déserte. Une section de l'accueil ne s'affiche que si
 * elle a quelque chose à montrer.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Deux revues successives ont affirmé que la section « Services populaires »
 * s'affichait à vide, donc en violation de V-13. C'est faux : la garde existe,
 * mais elle est dans le COMPOSANT `HomeRow` et non au site d'appel. Les cinq
 * rangées de l'accueil en héritent sans qu'aucune ne l'écrive.
 *
 * Une garde invisible depuis les sites d'appel est une garde qu'on redécouvre
 * à chaque relecture, et qu'un jour quelqu'un supprimera de bonne foi en
 * croyant qu'elle ne sert à rien. Ce test la rend visible à la machine : la
 * retirer casse `npm test`, donc la CI.
 *
 * CE QUE CE TEST NE FAIT PAS
 * --------------------------
 * Il ne rend pas le composant. `HomeRow` n'est pas exporté et l'accueil est un
 * Server Component qui interroge Supabase à l'import — le monter demanderait
 * un harnais dont le coût dépasse ce qu'il prouverait. Le test lit donc la
 * SOURCE, comme `tests/product-kind-discipline.test.ts`, avec la même limite
 * assumée : il vérifie que la garde est écrite, pas qu'elle s'exécute.
 *
 * VÉRIFIÉ SUR CAS CONNU-NÉGATIF avant d'être committé : la ligne de garde
 * retirée de `app/page.tsx`, ce test échoue. Un test qui n'a jamais échoué n'a
 * pas encore démontré qu'il pouvait.
 */

const SOURCE = readFileSync("app/page.tsx", "utf8");

test("HomeRow s'efface à vide, sauf invitation explicite (V-13 amendée)", () => {
  /* AMENDEMENT PORTEUR 2026-08-10. V-13 disait : une section vide s'efface,
   * point. Le porteur a demandé que « Fichiers digitaux » et « Services »
   * restent VISIBLES à vide. La règle amendée tient les deux exigences :
   *   - sans prop `empty`, la section s'efface (comportement historique) ;
   *   - avec `empty`, elle affiche une INVITATION À VENDRE — un contenu
   *     honnête, jamais un titre au-dessus du néant ni de faux produits.
   * La garde reste une sortie anticipée, désormais conditionnée à `!empty`. */
  const garde =
    /if\s*\(\s*items\.length\s*===?\s*0\s*&&\s*!\s*empty\s*\)\s*return\s+null/;

  assert.match(
    SOURCE,
    garde,
    "La garde de vacuité de HomeRow a changé de forme dans app/page.tsx. " +
      "Elle doit rester : vide SANS invitation → rien ; vide AVEC invitation " +
      "→ le contenu d'invitation. Toute autre forme fait soit réapparaître " +
      "l'étagère déserte (V-13), soit disparaître les deux sections que le " +
      "porteur veut permanentes."
  );
});

test("l'invitation à vide est un privilège de DEUX sections, et mène à /vendre", () => {
  /* Sans cette borne, la prop `empty` s'étendrait rangée par rangée jusqu'à
   * vider V-13 de son sens — chaque section finirait par afficher quelque
   * chose à vide, et l'accueil d'un catalogue désert redeviendrait un couloir
   * de promesses creuses. Deux sections, celles que le porteur a nommées. */
  const invitations = SOURCE.match(/empty=\{\{/g) ?? [];
  assert.equal(
    invitations.length,
    2,
    `${invitations.length} section(s) portent une invitation à vide — la ` +
      "décision porteur du 2026-08-10 en nomme exactement deux (fichiers " +
      "digitaux, services). En ajouter une est un nouvel arbitrage, pas un " +
      "détail."
  );
  // Et l'invitation appelle à VENDRE : c'est sa seule justification honnête.
  const cibles = SOURCE.match(/empty=\{\{[\s\S]*?href:\s*"([^"]+)"/g) ?? [];
  assert.equal(cibles.length, 2, "invitations sans cible lisible");
  for (const c of cibles) {
    assert.ok(
      c.includes('"/vendre"'),
      "une invitation à vide ne mène pas à /vendre : " + c
    );
  }
});

test("toutes les rangées de produits passent par HomeRow", () => {
  // Si une rangée est écrite à la main plutôt que via HomeRow, elle n'hérite
  // pas de la garde : c'est le seul chemin par lequel une étagère déserte peut
  // réapparaître sans que le test précédent bronche.
  const appels = SOURCE.match(/<HomeRow\b/g) ?? [];
  assert.ok(
    appels.length >= 5,
    `Attendu au moins 5 rangées via <HomeRow>, trouvé ${appels.length}. ` +
      "Une rangée retirée est peut-être devenue une <section> écrite à la " +
      "main, qui ne porte plus la garde de vacuité."
  );
});

test("la section vendeurs garde sa propre condition", () => {
  // Elle n'est pas une rangée de produits et ne passe donc pas par HomeRow :
  // sa garde est explicite au site d'appel et doit le rester.
  assert.match(
    SOURCE,
    /sellers\.length\s*>\s*0\s*&&/,
    "La condition `sellers.length > 0` a disparu. Cette section n'utilise " +
      "pas HomeRow : sans sa propre garde, elle affiche un titre au-dessus " +
      "d'une grille vide."
  );
});
