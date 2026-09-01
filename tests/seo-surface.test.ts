import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * LA SURFACE INDEXABLE — quatre gardes, dont une qui protège une ABSENCE.
 *
 * Origine : audit SEO du 2026-08-28. Quatre défauts mesurés, tous du même
 * genre — un fichier décidait seul d'une chose qu'un autre fichier décidait
 * déjà, et les deux divergeaient en silence :
 *
 *   • `robots.ts` et `sitemap.ts` résolvaient l'origine du site à la main
 *     (`process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"`) là où
 *     `app/layout.tsx` passait par `siteUrl()`. Canoniques et sitemap
 *     pouvaient donc annoncer deux domaines différents sur un même
 *     déploiement ;
 *   • six replis de domaine, trois comportements — dont `""`, qui fabriquait
 *     des liens RELATIFS dans des e-mails transactionnels ;
 *   • le sitemap déclarait `/createur/<uuid>`, précisément l'URL que
 *     `app/createur/[id]/page.tsx` canonicalise vers `/boutik/<slug>` ;
 *   • `/facture/[token]` — facture d'un client, avec montants et nom — était
 *     indexable.
 *
 * Aucun de ces quatre-là ne se voit à la lecture d'UN fichier. C'est pour ça
 * qu'ils sont croisés ici, et pas surveillés à la relecture.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");

const ROBOTS = lire("app/robots.ts");
const SITEMAP = lire("app/sitemap.ts");
const FACTURE = lire("app/facture/[token]/page.tsx");

/* ───────────────────────────────────────────────────────────────────────────
 * N1 — la facture publique porte `noindex`.
 *
 * ⚠️ L'assertion porte sur la LIAISON export → `robots` → `index: false`, pas
 * sur la présence du texte « index: false » quelque part dans le fichier.
 * Un `robots: { index: false }` détaché de `export const metadata` ne serait
 * jamais lu par Next : il laisserait exactement la même sous-chaîne dans le
 * fichier tout en ne protégeant plus rien. C'est le piège que ce dépôt a
 * rencontré deux fois (`CartPayButton` renommé, `if (false)`), et il ne se
 * corrige pas en y pensant plus fort.
 * ------------------------------------------------------------------------ */
test("N1 — /facture/[token] exporte robots.index = false depuis metadata", () => {
  assert.match(
    FACTURE,
    /export const metadata\s*=\s*\{[\s\S]{0,200}?robots:\s*\{[^}]{0,80}index:\s*false/,
    "La facture publique doit porter `robots: { index: false }` DANS son export `metadata`."
  );
});

/* ───────────────────────────────────────────────────────────────────────────
 * N2 — L'ABSENCE QUI PORTE LA PROTECTION.
 *
 * C'est le contrôle le moins intuitif du fichier, et le plus important.
 *
 * `disallow` et `noindex` se DÉFONT l'un l'autre : une URL interdite au crawl
 * n'est jamais lue, donc son `noindex` n'est jamais vu, et le moteur peut
 * indexer l'adresse nue sur la seule foi d'un lien entrant. Ajouter
 * « /facture/ » au `disallow` de `robots.ts` — geste qui a toutes les
 * apparences d'un renforcement — ANNULE la protection posée par N1.
 *
 * Rien dans `robots.ts` ne le dit à qui l'édite ; rien dans la page facture
 * non plus. Seul ce croisement le dit.
 * ------------------------------------------------------------------------ */
test("N2 — /facture n'est PAS dans le disallow (sinon le noindex de N1 est ignoré)", () => {
  const bloc = ROBOTS.match(/disallow:\s*\[([\s\S]*?)\]/);
  assert.ok(bloc, "app/robots.ts doit porter une liste `disallow`.");
  assert.doesNotMatch(
    bloc[1],
    /["']\/facture/,
    "« /facture » dans le disallow empêche le crawler de LIRE le noindex de la page : " +
      "la facture redevient indexable par lien entrant. Les deux ne se cumulent pas."
  );
});

/* ───────────────────────────────────────────────────────────────────────────
 * N3 — une seule fonction décide de l'origine du site.
 * ------------------------------------------------------------------------ */
test("N3 — robots.ts et sitemap.ts passent par siteUrl()", () => {
  for (const [nom, src] of [
    ["app/robots.ts", ROBOTS],
    ["app/sitemap.ts", SITEMAP],
  ] as const) {
    assert.match(
      src,
      /const base = siteUrl\(\)/,
      `${nom} doit résoudre son origine par siteUrl(), pas à la main.`
    );
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * N4 — CROISEMENT : plus aucune lecture directe de la variable d'origine.
 *
 * Deux exceptions, et elles sont load-bearing, pas tolérées :
 *   • `lib/site-url.ts` — c'est la fonction elle-même ;
 *   • les deux appelants de `siteOrigin()` (`app/auth/callback`,
 *     `app/api/moncash/return`) — eux ont besoin de la valeur CONFIGURÉE
 *     *et* de l'URL de la requête, pour ne pas casser le cookie de session
 *     entre `zabelie.com` et `www.zabelie.com`. Leur passer `siteUrl()` — qui
 *     a déjà tranché — leur retirerait précisément l'information dont ils
 *     ont besoin. Voir `lib/site-origin.ts`.
 *
 * Toute NOUVELLE lecture directe échoue ici. C'est ce qui empêche le défaut
 * de revenir par un fichier qui n'existe pas encore.
 * ------------------------------------------------------------------------ */
const EXEMPTS = new Set([
  "lib/site-url.ts",
  "lib/site-origin.ts",
  "app/auth/callback/route.ts",
  "app/api/moncash/return/route.ts",
]);

function sources(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const rel = `${dir}/${e}`;
    if (e === "node_modules" || e === ".next") continue;
    if (statSync(join(RACINE, rel)).isDirectory()) sources(rel, acc);
    else if (/\.tsx?$/.test(e)) acc.push(rel);
  }
  return acc;
}

/**
 * Retire les commentaires avant de chercher du CODE.
 *
 * ⚠️ Écrit après un rouge, et le rouge était juste : la première version
 * sautait les lignes commençant par `*` ou `//` et signalait donc le
 * commentaire de `app/sitemap.ts` qui EXPLIQUE la correction. Un contrôle qui
 * accuse sa propre documentation pousse à exempter le fichier — c'est-à-dire
 * à créer l'angle mort exact qu'il existe pour fermer. On retire les
 * commentaires, on n'exempte pas le fichier.
 *
 * Le garde `[^:]` évite de tronquer une URL (`https://…`) prise pour un
 * commentaire de fin de ligne.
 */
const sansCommentaires = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("N4 — aucune lecture directe de NEXT_PUBLIC_SITE_URL hors des exemptés", () => {
  const fautifs: string[] = [];
  for (const f of [...sources("app"), ...sources("lib"), ...sources("components")]) {
    if (EXEMPTS.has(f)) continue;
    for (const ligne of sansCommentaires(lire(f)).split("\n")) {
      const nu = ligne.trim();
      if (nu.includes("process.env.NEXT_PUBLIC_SITE_URL")) fautifs.push(`${f} → ${nu}`);
    }
  }
  assert.deepEqual(
    fautifs,
    [],
    "Ces fichiers résolvent l'origine à la main au lieu d'appeler siteUrl() :\n" +
      fautifs.join("\n")
  );

  // Connu-négatif intégré : la liste d'exemptions doit rester VRAIE. Une
  // exemption qui a perdu sa raison d'être est une conformité par usure —
  // même règle que `tests/crons-appelants.test.ts`.
  for (const f of EXEMPTS) {
    if (f === "lib/site-url.ts" || f === "lib/site-origin.ts") continue;
    assert.match(
      lire(f),
      /siteOrigin\(/,
      `${f} est exempté parce qu'il appelle siteOrigin(). Il ne l'appelle plus : ` +
        `retirer l'exemption ou rétablir l'appel.`
    );
  }
});

/* ───────────────────────────────────────────────────────────────────────────
 * N5 — le sitemap déclare l'adresse CANONIQUE de la boutique.
 *
 * L'assertion porte sur ce qui COMMANDE l'URL — l'appel à `hrefBoutique`
 * dans la construction de `url` — et, en regard, sur l'absence de toute
 * fabrication d'URL créateur en dur. Les deux ensemble : la première dit que
 * la bonne fonction décide, la seconde dit que personne ne décide à côté.
 * ------------------------------------------------------------------------ */
test("N5 — le sitemap construit l'URL vendeur par hrefBoutique, jamais en dur", () => {
  assert.match(
    SITEMAP,
    /url:\s*`\$\{base\}\$\{hrefBoutique\(/,
    "L'URL vendeur du sitemap doit venir de hrefBoutique() — la fonction qui " +
      "tranche déjà entre /boutik/<slug> et /createur/<id> partout ailleurs."
  );
  assert.doesNotMatch(
    SITEMAP,
    /`\$\{base\}\/createur\//,
    "Le sitemap ne doit pas fabriquer /createur/<id> en dur : c'est l'URL que " +
      "app/createur/[id]/page.tsx canonicalise vers /boutik/<slug>."
  );
});
