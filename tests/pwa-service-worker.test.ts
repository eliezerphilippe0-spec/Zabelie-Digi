import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import {
  CHEMINS_JAMAIS_CACHES,
  jamaisCache,
  PAGE_HORS_LIGNE,
  PAGE_DESINSTALLATION,
} from "../lib/pwa-routes";

/**
 * LE SERVICE WORKER — CE QUI DOIT RESTER VRAI.
 *
 * > Un service worker qui sert une page de paiement périmée n'est pas un bug
 * > d'affichage, c'est un incident financier. (`docs/32` §2)
 *
 * ⚠️ LA FORME DU DANGER, ET ELLE EST PARTICULIÈRE À CE CHANTIER. Un service
 * worker s'installe CHEZ L'UTILISATEUR et survit aux déploiements. Une règle
 * de cache trop large ne casse rien de visible : elle sert une page qui a
 * l'air normale, simplement vieille. Personne ne remonte « le prix affiché
 * datait d'hier » — on remonte « le site m'a menti », une fois, et on ne
 * revient pas.
 *
 * ⚠️ CE QUE CE FICHIER NE PROUVE PAS. Le comportement réel du navigateur.
 * Il vérifie que la liste COMMANDE la configuration, pas qu'un Chrome sur
 * Android refuse effectivement de servir `/panier` depuis un cache. Cette
 * preuve-là est un test Playwright hors réseau (`docs/32` §4.1) et un
 * téléphone. Les deux sont nécessaires.
 */

const SW_SRC = readFileSync("app/sw.ts", "utf8");
const exec = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, "");

test("la liste des chemins jamais cachés couvre l'argent et la session", () => {
  /* Le croisement porte sur des CHEMINS RÉELS du dépôt, pas sur le nombre
   * d'entrées : une liste peut grandir tout en perdant celle qui comptait. */
  const doiventEtreProteges = [
    "/api/checkout",
    "/api/moncash/return",
    "/api/download",
    "/panier",
    "/mes-achats",
    "/mes-ventes",
    "/admin/produits",
    "/tableau-de-bord",
    "/connexion",
    "/reinitialiser-mot-de-passe",
  ];
  const troues = doiventEtreProteges.filter((c) => !jamaisCache(c));
  assert.deepEqual(
    troues,
    [],
    `Ces chemins pourraient être servis depuis un cache : ${troues.join(", ")}`,
  );
});

test("des chemins ordinaires restent cachables — sinon le chantier ne sert à rien", () => {
  // Connu-NÉGATIF de la fonction : une règle qui protégerait tout rendrait le
  // test précédent vert sans rien apporter. C'est la forme la plus discrète
  // d'un garde inutile.
  for (const ouvert of ["/", "/aide", "/hors-ligne", "/_next/static/chunk.js"]) {
    assert.equal(
      jamaisCache(ouvert),
      false,
      `\`${ouvert}\` est traité comme non cachable : la liste est trop large.`,
    );
  }
});

test("le service worker CONSOMME la liste, il ne la recopie pas", () => {
  /* Le cœur du croisement. Une liste que le SW n'utiliserait pas serait une
   * déclaration d'intention — et elle se lirait exactement comme une
   * protection. L'assertion porte donc sur l'import ET sur la construction des
   * règles à partir de lui. */
  const src = exec(SW_SRC);
  assert.match(
    src,
    /import\s*\{[^}]*CHEMINS_JAMAIS_CACHES[^}]*\}\s*from\s*"@\/lib\/pwa-routes"/,
    "Le SW doit importer la liste partagée plutôt que porter sa propre copie.",
  );
  assert.match(
    src,
    /CHEMINS_JAMAIS_CACHES\.map\([\s\S]{0,300}new NetworkOnly\(\)/,
    "Chaque entrée de la liste doit produire une règle `NetworkOnly`.",
  );
});

test("les interdits sont posés AVANT toute règle de cache", () => {
  /* L'ORDRE EST LA GARANTIE. Serwist retient la première règle qui
   * correspond : une règle générique placée devant viderait les interdits de
   * leur sens, sans que rien ne casse ni ne se voie. */
  const src = exec(SW_SRC);
  const iInterdits = src.indexOf("...reglesSansCache");
  const iPremierCache = Math.min(
    ...[/new CacheFirst\(/, /new StaleWhileRevalidate\(/]
      .map((re) => {
        const m = re.exec(src);
        return m ? m.index : Number.MAX_SAFE_INTEGER;
      }),
  );
  assert.ok(iInterdits > 0, "`reglesSansCache` introuvable dans runtimeCaching");
  assert.ok(
    iInterdits < iPremierCache,
    "Une règle de cache est déclarée AVANT la liste des interdits : elle gagnerait.",
  );
});

test("la discipline de version est respectée (`docs/32` §3)", () => {
  const src = exec(SW_SRC);
  assert.match(
    src,
    /skipWaiting:\s*false/,
    "`skipWaiting` actif ferait servir un mélange d'ancien et de nouveau bundle sur une page ouverte.",
  );
  assert.match(src, /clientsClaim:\s*false/);
});

test("la sortie de secours existe et n'est JAMAIS cachée", () => {
  /* C'est la seule panne de ce chantier qui ne se répare pas depuis le
   * serveur : un SW cassé peut intercepter les requêtes qui serviraient à le
   * remplacer. Si cette page pouvait venir d'un cache, elle serait
   * remplaçable par une version périmée d'elle-même. */
  assert.ok(
    existsSync(`app${PAGE_DESINSTALLATION}/page.tsx`),
    `La page ${PAGE_DESINSTALLATION} n'existe pas.`,
  );
  assert.match(
    exec(SW_SRC),
    new RegExp(`startsWith\\(PAGE_DESINSTALLATION\\)[\\s\\S]{0,120}new NetworkOnly\\(\\)`),
    "La page de désinstallation doit être déclarée NetworkOnly.",
  );
  // Et elle doit réellement désinscrire, pas seulement le dire.
  const comp = readFileSync("components/desinstaller-sw.tsx", "utf8");
  assert.match(comp, /\.unregister\(\)/, "Rien ne désinscrit le service worker.");
  assert.match(comp, /caches\.delete\(/, "Les caches survivraient à la désinscription.");
});

test("la page hors réseau existe et ne dépend pas de ce qui est tombé", () => {
  const chemin = `app${PAGE_HORS_LIGNE}/page.tsx`;
  assert.ok(existsSync(chemin), `${chemin} manquant — le SW y renvoie pourtant.`);
  const src = readFileSync(chemin, "utf8");
  assert.doesNotMatch(
    src,
    /<SiteNav/,
    "La barre de navigation lit les catégories en base : hors réseau, elle échoue. " +
      "Une page de secours qui dépend de ce qui vient de tomber n'en est pas une.",
  );
  // Elle parle les quatre langues comme le reste du site.
  assert.match(src, /t\(lang, "offline\.title"\)/);
});

test("le service worker n'est pas commité — il est généré", () => {
  const ignore = readFileSync(".gitignore", "utf8");
  assert.match(
    ignore,
    /^\/public\/sw\.js$/m,
    "`public/sw.js` doit être ignoré : le commiter ferait diverger le fichier " +
      "servi de sa source, et 49 Ko minifiés cacheraient toute revue.",
  );
});

test("le build utilise webpack — Serwist ne sait pas faire autrement", () => {
  // Mesuré : avec Turbopack, `next build` échoue et AUCUN sw.js n'est produit.
  // Un build vert sans service worker serait le pire cas : la PWA aurait l'air
  // installée et ne le serait pas.
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.match(
    pkg.scripts.build,
    /--webpack/,
    "Sans `--webpack`, Serwist ne s'exécute pas et le service worker n'est jamais généré.",
  );
});

test("chaque entrée de la liste porte une raison lisible", () => {
  // Une liste sans raisons devient une liste qu'on n'ose plus toucher : on ne
  // sait plus ce qui protège quoi, donc on n'enlève jamais rien.
  const muettes = CHEMINS_JAMAIS_CACHES.filter((c) => c.raison.trim().length < 30);
  assert.deepEqual(muettes.map((c) => c.motif), [], "Entrées sans raison explicite");
});
