import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appelSession, cheminConnexion, iciMeme } from "../lib/appel-session";

/**
 * LA PORTE DES APPELS AUTHENTIFIÉS (`lib/appel-session.ts`).
 *
 * Ce qui se joue ici tient en une phrase : **une panne serveur ne doit jamais
 * se présenter comme une panne de l'utilisateur.** Le 2026-09-05, sur le
 * chemin de l'argent, un `HTTP 500` au corps non-JSON faisait lever
 * `res.json()`, la levée tombait dans le `catch` du réseau, et l'acheteur
 * lisait « Connexion impossible. Réessayez. » — il changeait de réseau et
 * réessayait, pendant que le serveur restait tombé.
 *
 * Mutations éprouvées (chacune passée, chacune rouge) :
 *   AS3  `json().catch(() => ({}))` redevient `json()` nu       → rouge
 *   AS4  le 401 rend `refus` au lieu de `connexion`             → rouge
 *   AS5  `cheminConnexion` n'encode plus sa destination         → rouge
 *   AS7  `buy-button` retrouve un `res.json()` nu               → rouge
 *   AS7  `buy-button` n'importe plus la porte                   → rouge
 */

/** Remplace `fetch` le temps d'un appel, et le rend toujours. */
async function avecFetch<T>(faux: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const avant = globalThis.fetch;
  globalThis.fetch = faux;
  try {
    return await fn();
  } finally {
    globalThis.fetch = avant;
  }
}

/** Une réponse HTTP minimale, corps donné TEL QUEL (JSON ou non). */
const reponse = (statut: number, corps: string): Response =>
  ({
    status: statut,
    ok: statut >= 200 && statut < 300,
    json: async () => JSON.parse(corps),
  }) as Response;

test("AS1 — le serveur dit oui : `ok`, et la réponse est rendue telle quelle", async () => {
  const r = await avecFetch(
    async () => reponse(200, JSON.stringify({ redirectUrl: "https://passerelle/x" })),
    () => appelSession<{ redirectUrl: string }>("/api/checkout", { productId: "p" }, "/produit/x"),
  );
  assert.equal(r.etat, "ok");
  assert.equal(r.etat === "ok" && r.data.redirectUrl, "https://passerelle/x");
});

test("AS2 — 401 : `connexion`, avec l'URL qui ramène ICI (query comprise)", async () => {
  const r = await avecFetch(
    async () => reponse(401, JSON.stringify({ error: "Connexion requise" })),
    () => appelSession("/api/panier", { productId: "p" }, "/catalogue?cat=Beauté&page=2"),
  );
  assert.equal(r.etat, "connexion");
  assert.equal(
    r.etat === "connexion" && r.vers,
    "/connexion?next=%2Fcatalogue%3Fcat%3DBeaut%C3%A9%26page%3D2",
  );
});

test("AS3 — LE DÉFAUT DE 2026-09-05 : 500 au corps NON-JSON → `refus`, jamais `reseau`", async () => {
  // C'est l'assertion qui compte dans tout ce fichier. Le corps est la page
  // d'erreur HTML de Next : `json()` LÈVE. La porte doit malgré tout dire
  // « le serveur a répondu non », parce qu'il a répondu.
  const r = await avecFetch(
    async () => reponse(500, "<!DOCTYPE html><html><body>Internal Server Error</body></html>"),
    () => appelSession("/api/checkout", { productId: "p" }, "/produit/x"),
  );
  assert.equal(r.etat, "refus", "un 500 illisible reste un REFUS du serveur, pas une panne de réseau");
  assert.equal(r.etat === "refus" && r.statut, 500);
  assert.equal(r.etat === "refus" && r.code, undefined);
  assert.equal(r.etat === "refus" && r.error, undefined);
});

test("AS4 — un refus nommé garde son code et son message", async () => {
  const r = await avecFetch(
    async () => reponse(409, JSON.stringify({ error: "Article indisponible.", code: "stock_indisponible" })),
    () => appelSession("/api/checkout", { productId: "p" }, "/produit/x"),
  );
  assert.equal(r.etat, "refus");
  assert.equal(r.etat === "refus" && r.code, "stock_indisponible");
  assert.equal(r.etat === "refus" && r.error, "Article indisponible.");
});

test("AS5 — `reseau` UNIQUEMENT quand la requête n'est jamais partie", async () => {
  const r = await avecFetch(
    async () => {
      throw new TypeError("Failed to fetch");
    },
    () => appelSession("/api/checkout", { productId: "p" }, "/produit/x"),
  );
  assert.equal(r.etat, "reseau", "un fetch qui LÈVE est le seul cas de réseau");
});

test("AS6 — un corps JSON dont `code`/`error` ne sont pas des chaînes ne contamine pas l'issue", async () => {
  const r = await avecFetch(
    async () => reponse(422, JSON.stringify({ code: 42, error: { message: "objet" } })),
    () => appelSession("/api/checkout", { productId: "p" }, "/produit/x"),
  );
  assert.equal(r.etat, "refus");
  assert.equal(r.etat === "refus" && r.code, undefined);
  assert.equal(r.etat === "refus" && r.error, undefined);
});

test("AS7 — `cheminConnexion` encode, et se replie sur l'accueil plutôt que sur du vide", () => {
  assert.equal(cheminConnexion("/produit/mon-produit"), "/connexion?next=%2Fproduit%2Fmon-produit");
  assert.equal(cheminConnexion(""), "/connexion?next=%2F");
  // Hors navigateur (rendu serveur), `iciMeme` ne lève pas.
  assert.equal(iciMeme(), "/");
});

/**
 * LE CROISEMENT — un artefact adressé par CHAÎNE, que `tsc` ne verra jamais.
 *
 * La porte ne sert à rien si un composant du chemin de l'argent refait son
 * propre appel. On croise donc la liste des composants qui appellent
 * `/api/checkout` ou `/api/panier` avec ceux qui importent la porte, et
 * l'assertion porte sur ce qui COMMANDE — l'import et l'absence de `res.json()`
 * nu — pas sur un mot présent dans un commentaire.
 *
 * ⚠️ L'exemption se périme dans les deux sens : un composant de la liste qui
 * cesserait d'appeler ces routes fait échouer ce test aussi.
 */
const SUR_LE_CHEMIN_DE_LARGENT = [
  "components/add-to-cart.tsx",
  "components/buy-button.tsx",
  "components/cart-pay-button.tsx",
];

/**
 * Retire les commentaires AVANT d'asserter une absence.
 *
 * Écrit après s'être fait prendre : la première version de AS8 échouait sur
 * `buy-button.tsx` parce que le COMMENTAIRE qui raconte le défaut cite
 * « `await res.json()` sans garde ». L'assertion voyait la prose et croyait
 * voir le code — le piège de sous-chaîne, dans le sens de l'absence cette
 * fois. Une interdiction ne porte que sur ce qui s'exécute.
 */
function sansCommentaires(s: string): string {
  return s
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");
}

test("AS8 — tout composant du chemin de l'argent passe par la porte, et aucun ne relit `res.json()` seul", () => {
  for (const f of SUR_LE_CHEMIN_DE_LARGENT) {
    // Une seule chaîne, dépouillée : ce qu'on cherche ET ce qu'on interdit se
    // lisent sur le même texte, celui qui s'exécute.
    const code = sansCommentaires(readFileSync(f, "utf8"));
    assert.match(
      code,
      /"\/api\/(checkout|panier)"/,
      `${f} n'appelle plus /api/checkout ni /api/panier — exemption périmée, retirer la ligne`,
    );
    assert.match(
      code,
      /import \{ appelSession \} from "@\/lib\/appel-session";/,
      `${f} n'importe pas la porte`,
    );
    assert.match(
      code,
      /const issue = await appelSession/,
      `${f} n'appelle pas la porte`,
    );
    // Ce qui COMMANDE : plus aucune lecture de corps hors de la porte.
    assert.doesNotMatch(
      code,
      /await res\.json\(\)/,
      `${f} relit une réponse lui-même — c'est exactement le chemin qui confondait 500 et panne réseau`,
    );
    assert.doesNotMatch(
      code,
      /res\.status === 401/,
      `${f} refait son propre 401 au lieu de lire l'issue « connexion »`,
    );
  }
});

test("AS9 — le bouton d'achat distingue les quatre issues, et `reseau` ne couvre que le réseau", () => {
  const src = sansCommentaires(readFileSync("components/buy-button.tsx", "utf8"));
  // La LIAISON qui compte : le message de réseau est attaché à l'issue
  // `reseau`, et à elle seule. Une proximité de texte ne suffirait pas — on
  // ancre sur la condition, pas sur le libellé.
  assert.match(
    src,
    /if \(issue\.etat === "reseau"\) \{\s*setError\(errors\?\.network/,
    "le message de réseau doit être commandé par l'issue `reseau`",
  );
  assert.match(src, /if \(issue\.etat === "connexion"\) \{\s*router\.push\(issue\.vers\);/);
  assert.match(src, /if \(issue\.etat === "refus"\) \{/);
  // Une réponse OK sans destination n'est pas une réussite.
  assert.match(src, /const destination = String\(issue\.data\.redirectUrl \?\? ""\);[\s\S]{0,120}if \(!destination\)/);
});
