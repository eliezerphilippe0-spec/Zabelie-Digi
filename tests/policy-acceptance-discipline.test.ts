import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Aucune fiche ne se crée sans attestation enregistrée.
 *
 * La politique produits interdits est plus stricte que la loi : ce qui la rend
 * opposable n'est pas un texte officiel mais le fait que le vendeur l'a
 * acceptée, dans une version connue. Une route de création qui oublierait
 * l'attestation produirait des fiches parfaitement fonctionnelles — rien ne
 * casserait, et on ne s'en apercevrait qu'au premier litige.
 *
 * Deux exigences, et la seconde compte autant que la première :
 *   1. la route REFUSE si la case n'est pas cochée ;
 *   2. la version vient de `lib/policy.ts`, JAMAIS du corps de la requête —
 *      sinon le vendeur choisit la version qu'il a « acceptée ».
 */

const ROUTES = [
  join("app", "api", "products", "route.ts"),
  join("app", "api", "products", "physical", "route.ts"),
];

test("les deux routes de création exigent l'attestation", () => {
  for (const route of ROUTES) {
    const src = readFileSync(route, "utf8");
    assert.match(
      src,
      /body\.policyAccepted\s*!==\s*true/,
      `${route} ne refuse pas une création sans attestation.`,
    );
    assert.match(
      src,
      /zabelie_record_policy_acceptance/,
      `${route} ne consigne aucune attestation.`,
    );
  }
});

test("la version enregistrée vient du serveur, pas du client", () => {
  for (const route of ROUTES) {
    const src = readFileSync(route, "utf8");
    // L'appel doit passer POLICY_VERSION, et rien qui vienne de `body`.
    const appel = src.slice(
      src.indexOf("zabelie_record_policy_acceptance"),
      src.indexOf("}", src.indexOf("p_version")) + 1,
    );
    assert.match(
      appel,
      /p_version:\s*POLICY_VERSION/,
      `${route} enregistre une version qui ne vient pas de lib/policy.ts.`,
    );
    assert.doesNotMatch(
      appel,
      /body\./,
      `${route} laisse le client influencer la version enregistrée.`,
    );
  }
});
