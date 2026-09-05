import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import sharp from "sharp";
import manifest from "../app/manifest";
import { BRAND_INK } from "../lib/brand";

/**
 * LE MANIFESTE ADRESSE SES ICÔNES PAR CHAÎNE — DONC RIEN NE LES VÉRIFIE.
 *
 * `{ src: "/icons/icon-192.png" }` est un littéral. Le compilateur ne le
 * suivra jamais, le rendu ne lèvera rien, et le navigateur qui ne trouve pas
 * le fichier n'affiche pas d'erreur : il installe l'application avec une
 * icône vide, ou une lettre grise sur fond blanc. Le vendeur voit une tuile
 * cassée sur son écran d'accueil et personne côté plateforme ne l'apprend —
 * la classe d'artefact que `CLAUDE.md` demande de croiser AVANT de conclure
 * quoi que ce soit, parce qu'aucun autre contrôle ne la couvre.
 *
 * Ce que le contrôle croise :
 *   les `src` et `sizes` déclarés par `app/manifest.ts`
 *     × les fichiers RÉELS de `public/`, dimensions lues dans le PNG
 *
 * Déclarer `512x512` et livrer un fichier de 192 px est un mensonge qu'aucune
 * lecture du manifeste ne peut détecter : c'est pour ça que le test ouvre
 * l'image au lieu de comparer deux chaînes entre elles.
 *
 * ⚠️ CE QUE CE CONTRÔLE NE PROUVE PAS. Que l'installation fonctionne. Un
 * manifeste valide servi en HTTP sans HTTPS, ou avec un `scope` incohérent,
 * reste ininstallable — et ça se mesure dans un navigateur, pas ici.
 */

const M = manifest();

test("chaque icône déclarée existe vraiment sur le disque", async () => {
  assert.ok(M.icons && M.icons.length > 0, "aucune icône déclarée");
  for (const icone of M.icons!) {
    const chemin = `public${icone.src}`;
    assert.ok(
      existsSync(chemin),
      `Le manifeste déclare \`${icone.src}\` et le fichier \`${chemin}\` ` +
        `n'existe pas. Le navigateur installera une icône vide sans rien dire.`
    );
  }
});

test("les dimensions déclarées sont celles du fichier, pas une promesse", async () => {
  for (const icone of M.icons!) {
    const [l, h] = String(icone.sizes).split("x").map(Number);
    const meta = await sharp(`public${icone.src}`).metadata();
    assert.equal(
      `${meta.width}x${meta.height}`,
      `${l}x${h}`,
      `\`${icone.src}\` est annoncée ${l}x${h} et mesure ` +
        `${meta.width}x${meta.height}. Android choisit son icône SUR LA FOI ` +
        `de \`sizes\` : une déclaration fausse lui fait redimensionner la ` +
        `mauvaise image.`
    );
  }
});

test("une icône maskable existe — sinon Android rogne la tuile", () => {
  const maskables = M.icons!.filter((i) =>
    String(i.purpose ?? "").split(/\s+/).includes("maskable")
  );
  assert.ok(
    maskables.length > 0,
    "Sans variante `maskable`, le système applique son masque (cercle, " +
      "goutte, carré selon le constructeur) directement sur l'icône `any` : " +
      "les angles de la tuile sont coupés, ou un fond blanc est ajouté autour."
  );
  for (const m of maskables) {
    const [l] = String(m.sizes).split("x").map(Number);
    assert.ok(l >= 512, `\`${m.src}\` fait ${l} px ; 512 est le minimum utile.`);
  }
});

test("les couleurs du manifeste sont celles du thème, pas une copie figée", () => {
  const css = readFileSync("app/zabelie-theme.css", "utf8");
  const m = /--color-chrome:\s*(#[0-9a-fA-F]{3,8})/.exec(css);
  assert.ok(m, "`--color-chrome` introuvable dans le thème");
  const ink = m![1].toLowerCase();
  assert.equal(
    BRAND_INK.toLowerCase(),
    ink,
    "`BRAND_INK` de `lib/brand.ts` a divergé du token `--color-chrome` du thème (l'encre du CHROME : en-tête, pied, barre d'adresse). C'est " +
      "exactement ce qui est arrivé au favicon, qui a gardé `#17123a` " +
      "pendant que `--color-ink` passait à `#0a0a0a`."
  );
  assert.equal(String(M.theme_color).toLowerCase(), ink);
  assert.equal(String(M.background_color).toLowerCase(), ink);
});

test("l'identité de l'application est figée par `id`", () => {
  // Sans `id`, l'identité dérive de `start_url`. Le jour où `start_url`
  // change, Android croit à une AUTRE application : l'ancienne icône reste
  // orpheline sur l'écran d'accueil de chaque vendeur qui l'avait installée.
  assert.equal(M.id, "/");
  assert.equal(M.scope, "/");
});

test("le nom court tient sous une icône Android", () => {
  assert.ok(M.short_name, "`short_name` manquant");
  assert.ok(
    M.short_name!.length <= 12,
    `\`short_name\` fait ${M.short_name!.length} caractères ; Android tronque ` +
      `au-delà de ~12 sous l'icône de l'écran d'accueil.`
  );
});
