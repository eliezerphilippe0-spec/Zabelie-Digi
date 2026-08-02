import test from "node:test";
import assert from "node:assert/strict";
import nextConfig from "../next.config.mjs";

/**
 * En-têtes de sécurité — SEC-02.
 *
 * CE QUE CE TEST FAIT, ET SA LIMITE, dite avant le reste : il interroge la
 * CONFIGURATION, pas une réponse HTTP. Il prouve que la déclaration existe et
 * couvre tout le site ; il ne prouve pas qu'un serveur la sert — ça a été
 * vérifié séparément par `curl` contre un serveur de développement, et c'est
 * consigné dans le message de commit.
 *
 * Il existe parce que la déclaration est ce qui se supprime : un jour, une
 * CSP mal posée cassera une page, quelqu'un commentera le bloc entier pour
 * débloquer, et `frame-ancestors` partira avec. Ce test fait échouer ce
 * geste-là.
 */

type Entete = { key: string; value: string };

async function entetes(): Promise<Entete[]> {
  const regles = await nextConfig.headers!();
  assert.equal(regles.length, 1, "une seule règle attendue, couvrant tout");
  assert.equal(
    regles[0].source,
    "/(.*)",
    "le motif doit couvrir tout le site — un motif plus étroit laisse des chemins nus"
  );
  return regles[0].headers as Entete[];
}

const valeur = (l: Entete[], k: string) =>
  l.find((h) => h.key.toLowerCase() === k.toLowerCase())?.value;

test("l'encadrement en iframe est interdit — par les DEUX mécanismes", async () => {
  const l = await entetes();
  // `frame-ancestors` pour les navigateurs modernes, `X-Frame-Options` pour
  // ceux qui l'ignorent. Les deux se relaient, ils ne se contredisent pas.
  assert.match(
    valeur(l, "Content-Security-Policy") ?? "",
    /frame-ancestors\s+'none'/,
    "sans cette directive, /connexion est encadrable par un site d'hameçonnage"
  );
  assert.equal(valeur(l, "X-Frame-Options"), "DENY");
});

test("la CSP ne contient QUE `frame-ancestors`", async () => {
  // Le jour où quelqu'un ajoute `script-src` ici sans nonce, la page casse ou
  // la politique devient décorative. Ce test force à en parler.
  const l = await entetes();
  const directives = (valeur(l, "Content-Security-Policy") ?? "")
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  assert.deepEqual(
    directives,
    ["frame-ancestors 'none'"],
    "une CSP élargie sur Next demande un nonce propagé à chaque rendu — " +
      "l'ajouter sans ça donne soit une page cassée, soit `unsafe-inline`"
  );
});

test("nosniff, HSTS et Referrer-Policy sont présents", async () => {
  const l = await entetes();
  assert.equal(valeur(l, "X-Content-Type-Options"), "nosniff");
  assert.match(valeur(l, "Strict-Transport-Security") ?? "", /max-age=\d{7,}/);
  assert.equal(
    valeur(l, "Referrer-Policy"),
    "strict-origin-when-cross-origin"
  );
});

test("HSTS n'emporte PAS `preload` — c'est une porte à sens unique", async () => {
  // Inscrire le domaine dans la liste des navigateurs se défait en des mois.
  // Zabelie n'a pas encore son domaine définitif : ce test fait échouer un
  // ajout distrait, pas une décision prise.
  const l = await entetes();
  assert.doesNotMatch(
    valeur(l, "Strict-Transport-Security") ?? "",
    /preload/,
    "ajouter `preload` est une décision porteur, pas un durcissement de routine"
  );
});

test("caméra, micro, géolocalisation et paiement sont refusés", async () => {
  const l = await entetes();
  const pp = valeur(l, "Permissions-Policy") ?? "";
  for (const f of ["camera", "microphone", "geolocation", "payment"]) {
    assert.match(
      pp,
      new RegExp(`${f}=\\(\\)`),
      `${f} devrait être refusé : le site ne l'utilise pas`
    );
  }
});
