import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifierDeploiement } from "../scripts/verifier-deploiement.mjs";

/**
 * LE CONTRÔLE D'APRÈS-DÉPLOIEMENT DOIT SAVOIR ÉCHOUER.
 *
 * `/api/readyz` existait depuis `docs/30` et **personne ne l'appelait** — le
 * motif « code sans appelant », appliqué cette fois à la vérification du
 * déploiement. Ce script l'appelle. Mais un vérificateur qui ne sait pas
 * rougir ne vérifie rien : l'essentiel de ce fichier n'est pas « il dit oui
 * quand tout va bien », c'est **il dit non dans les trois cas où un contrôle
 * de ce genre ment d'ordinaire** :
 *
 *   1. l'URL manque → il « saute » et paraît vert ;
 *   2. le réseau est injoignable → il avale l'erreur et sort en succès ;
 *   3. un 200 est servi sur une page d'erreur → il le prend pour argent
 *      comptant.
 *
 * Les trois sont des ÉCHECS ici, et chacun a son test. Le cas heureux n'en a
 * qu'un — c'est le bon rapport.
 */

/* Le script attend un `fetch` complet ; ces doublures n'en implémentent que
   ce qu'il lit (`status`, `json()`). Le cast est délibéré et borné à la
   doublure — élargir la signature du script pour plaire au test reviendrait à
   affaiblir le code pour son instrument. */
type Doublure = typeof globalThis.fetch;
const doublure = (fn: (url: string) => Promise<{ status: number; json: () => Promise<unknown> }>) =>
  fn as unknown as Doublure;

const REPONSE = (status: number, corps: unknown) => ({
  status,
  json: async () => corps,
});
const sansAttente = { attendreMs: 0, dormir: async () => {} };

test("VD1 — le cas heureux : 200 et ok:true", async () => {
  let appels = 0;
  const r = await verifierDeploiement({
    url: "https://exemple.test",
    fetchFn: doublure(async (u) => {
      appels++;
      assert.equal(u, "https://exemple.test/api/readyz", "la sonde doit être readyz");
      return REPONSE(200, { ok: true, latencyMs: 42 });
    }),
    ...sansAttente,
  });
  assert.equal(r.ok, true);
  assert.equal(appels, 1, "un site sain ne doit pas être sondé deux fois");
});

test("VD2 — URL absente : ÉCHEC, jamais un saut silencieux", async () => {
  /* LE PIÈGE LE PLUS COURANT. Un contrôle qui ne s'exécute pas faute de
     configuration et sort en succès est PIRE que pas de contrôle : il
     rassure. Les trois formes de l'absence doivent échouer. */
  for (const url of [undefined, "", "   "]) {
    const r = await verifierDeploiement({
      url,
      fetchFn: doublure(async () => {
        throw new Error("le réseau ne doit même pas être touché");
      }),
      ...sansAttente,
    });
    assert.equal(r.ok, false, `URL ${JSON.stringify(url)} devrait échouer`);
    assert.match(r.motif, /ZABELIE_URL/);
    assert.equal(r.tentatives, 0);
  }
});

test("VD3 — réseau injoignable : ÉCHEC après épuisement, pas un succès", async () => {
  let appels = 0;
  const r = await verifierDeploiement({
    url: "https://exemple.test",
    fetchFn: doublure(async () => {
      appels++;
      throw new Error("ENOTFOUND");
    }),
    essais: 3,
    ...sansAttente,
  });
  assert.equal(r.ok, false, "épuiser ses essais n'est pas réussir");
  assert.equal(appels, 3, "tous les essais doivent être tentés");
  assert.match(r.motif, /ENOTFOUND/, "le motif doit porter la dernière cause");
});

test("VD4 — un 200 ne suffit PAS : le corps doit dire ok:true", async () => {
  /* Une page d'erreur servie en 200 — un edge mal configuré, un rewrite qui
     avale la route — passerait un contrôle qui ne regarde que le code. */
  const menteurs = [
    { corps: { ok: false, latencyMs: 9 }, quoi: "ok:false" },
    { corps: { message: "Not Found" }, quoi: "corps sans ok" },
    { corps: null, quoi: "corps illisible (HTML)" },
    { corps: { ok: "true" }, quoi: "ok en chaîne, pas en booléen" },
  ];
  for (const { corps, quoi } of menteurs) {
    const r = await verifierDeploiement({
      url: "https://exemple.test",
      fetchFn: doublure(async () => REPONSE(200, corps)),
      essais: 2,
      ...sansAttente,
    });
    assert.equal(r.ok, false, `un 200 avec ${quoi} ne doit pas passer`);
  }
  // Et un 503 franc échoue évidemment aussi.
  const r = await verifierDeploiement({
    url: "https://exemple.test",
    fetchFn: doublure(async () => REPONSE(503, { ok: false })),
    essais: 2,
    ...sansAttente,
  });
  assert.equal(r.ok, false);
});

test("VD5 — la patience est réelle : un déploiement lent finit par passer", async () => {
  /* Vercel déploie de façon asynchrone : les premières sondes frappent un site
     qui n'est pas encore là. Sans réessai, ce contrôle rougirait à chaque
     fusion — et un contrôle qui crie tout le temps finit par être ignoré,
     ce qui revient à ne pas l'avoir. */
  let appels = 0;
  const r = await verifierDeploiement({
    url: "https://exemple.test/",
    fetchFn: doublure(async () => {
      appels++;
      if (appels < 4) throw new Error("ECONNREFUSED");
      return REPONSE(200, { ok: true, latencyMs: 30 });
    }),
    essais: 6,
    ...sansAttente,
  });
  assert.equal(r.ok, true, "un site qui arrive tard doit finir par être vu");
  assert.equal(r.tentatives, 4);
  // La barre oblique finale de l'URL ne doit pas produire `//api/readyz`.
  assert.match(r.motif, /4 tentative/);
});

test("VD6 — le workflow appelle bien le script, et sur la bonne branche", () => {
  const wf = readFileSync(".github/workflows/post-deploy.yml", "utf8");
  // Ce qui COMMANDE : le déclencheur, la variable, et l'appel. Un motif qui ne
  // verrait que « le fichier existe » resterait vert sur un workflow vide.
  assert.match(wf, /on:\s*\n\s*push:\s*\n\s*branches: \[main\]/);
  assert.match(wf, /ZABELIE_URL: \$\{\{ vars\.ZABELIE_URL \}\}/);
  assert.match(wf, /node scripts\/verifier-deploiement\.mjs/);
  // Une pause avant la première sonde : sans elle, on contrôlerait l'ANCIEN
  // déploiement et le vert ne prouverait rien sur le nouveau.
  assert.match(wf, /sleep \d+/);
});
