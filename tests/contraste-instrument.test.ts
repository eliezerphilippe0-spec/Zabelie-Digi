import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

/**
 * LE QC CONTRASTE EST LUI-MÊME SOUS CONTRÔLE.
 *
 * L'ancienne version de `scripts/zabelie-contrast.mjs` a menti pendant deux
 * semaines : sa table de couleurs recopiait la palette ABANDONNÉE le
 * 2026-07-25 (violet #17123A, surfaces marron), elle annonçait 7 échecs sur
 * un thème que personne ne servait plus, sortait en 0, et aucune CI ne
 * l'appelait. Pendant ce temps le défaut réel — text-mist/50 à 2,82:1 sur
 * les seize rangées de la colonne des rayons — était d'une forme qu'elle ne
 * regardait même pas.
 *
 * Ce test applique à l'instrument la règle du dépôt : connu-positif ET
 * connu-négatif avant confiance. Les cas positifs passent par INJECTION
 * (tokens truqués, lecteur de fichiers factice) — pas par mutation des vrais
 * fichiers, qui a déjà coûté une série d'éditions à ce dépôt.
 */

type Instrument = {
  lireTokens: (css: string) => Record<string, string>;
  ratio: (a: string, b: string) => number;
  paires: (T: Record<string, string>) => [string, string, string, number][];
  opacitesInterdites: (racines?: string[], lecteur?: (p: string, e: string) => string) => string[];
  sansCommentaires: (src: string) => string;
};
// Import DANS les tests (pas au niveau module) : la chaîne de test transpile
// en CJS, où le await de tête n'existe pas.
const charge = (): Promise<Instrument> =>
  import("../scripts/zabelie-contrast.mjs") as unknown as Promise<Instrument>;

test("les tokens viennent du CSS réel, et les clés porteuses y sont", async () => {
  const { lireTokens } = await charge();
  const T = lireTokens(readFileSync("app/zabelie-theme.css", "utf8"));
  for (const cle of ["cloud", "mist", "brand", "ink", "accent", "bg-1", "bg-3",
    "surface-neutral", "success", "success-text", "danger", "danger-text"]) {
    assert.ok(T[cle], `token --color-${cle} introuvable — le CSS ou l'extracteur a bougé`);
    assert.match(T[cle], /^#[0-9a-f]{6}$/);
  }
});

test("connu-positif : un token assombri fait échouer sa paire", async () => {
  const { lireTokens, ratio, paires } = await charge();
  const T = lireTokens(readFileSync("app/zabelie-theme.css", "utf8"));
  // mist assombri à la valeur qui rendait la colonne illisible (mist à 50 %
  // sur le fond réel ≈ #565656) : la paire doit tomber sous 4,5.
  const truque = { ...T, mist: "#565656" };
  const echouees = paires(truque).filter(([, fg, bg, seuil]) => ratio(fg, bg) < seuil);
  assert.ok(
    echouees.some(([nom]) => nom.includes("--mist")),
    "le mist illisible n'a fait échouer aucune paire — l'instrument ne mesure pas ce qu'il annonce"
  );
  // Connu-négatif : les tokens réels ne font rien échouer.
  const reelles = paires(T).filter(([, fg, bg, seuil]) => ratio(fg, bg) < seuil);
  assert.deepEqual(reelles.map(([nom]) => nom), []);
});

test("connu-positif : la police d'opacité voit text-mist/50, et ignore commentaires et /80", async () => {
  const { opacitesInterdites } = await charge();
  const faux = (contenu: string) =>
    opacitesInterdites(["app"], (p: string) =>
      p.endsWith(".tsx") ? contenu : ""
    );
  // Un vrai site fautif → détecté. (Le lecteur factice sert le même contenu
  // pour chaque .tsx : au moins une faute doit remonter.)
  assert.ok(
    faux('<p className="text-mist/50">x</p>').length > 0,
    "text-mist/50 non détecté — la police est aveugle"
  );
  // La même chaîne DANS UN COMMENTAIRE → ignorée (le commentaire historique
  // de app/page.tsx cite text-mist/60 en prose, il ne doit pas compter).
  assert.equal(faux('{/* text-mist/50 dans la prose */}').length, 0);
  // /80 passe : 5,41:1 mesuré sur le fond le plus sombre.
  assert.equal(faux('<p className="text-mist/80">x</p>').length, 0);
  // cloud est couvert aussi.
  assert.ok(faux('<p className="text-cloud/60">x</p>').length > 0);
});

test("le décapant de commentaires ne mange pas le code entre deux blocs", async () => {
  const { sansCommentaires } = await charge();
  const src = 'a /* x */ "text-mist/50" /* y */ b';
  assert.ok(sansCommentaires(src).includes("text-mist/50"));
});

test("connu-négatif : le script réel sort en 0 sur le dépôt réel", () => {
  // Le chemin de sortie (exit code) est ce que la CI consomme : on l'éprouve
  // en exécutant le script comme la CI le fera.
  const sortie = execFileSync("node", ["scripts/zabelie-contrast.mjs"], { encoding: "utf8" });
  assert.match(sortie, /Toutes les paires passent/);
});
