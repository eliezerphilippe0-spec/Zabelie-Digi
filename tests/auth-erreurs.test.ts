import { test } from "node:test";
import assert from "node:assert/strict";
import { causeAuth, estModeDemo } from "../lib/auth-erreurs";

/**
 * Le contrat tient en trois points :
 *   1. le CODE prime sur le texte ;
 *   2. le texte sert de repli pour les serveurs sans code ;
 *   3. hors cas connu → `null`, et l'appelant montre le message BRUT.
 *
 * Le troisième est le plus important et c'est celui qu'on est tenté de
 * casser : remplacer un échec non reconnu par « une erreur est survenue »
 * rend l'interface plus douce et le diagnostic impossible. C'est exactement
 * ce qui a rendu l'échec d'inscription du 31 juillet indiagnosticable — il a
 * fallu interroger `auth.users` pour découvrir qu'aucun compte n'existait.
 */

test("le code prime sur le texte", () => {
  // Message trompeur, code exact : c'est le code qui doit gagner.
  assert.equal(
    causeAuth({ code: "weak_password", message: "User already registered" }),
    "password"
  );
});

test("codes GoTrue reconnus", () => {
  const attendus: [string, string][] = [
    ["user_already_exists", "exists"],
    ["email_exists", "exists"],
    ["invalid_credentials", "credentials"],
    ["weak_password", "password"],
    ["email_not_confirmed", "notConfirmed"],
    ["over_request_rate_limit", "rate"],
    ["over_email_send_rate_limit", "rate"],
    ["signup_disabled", "disabled"],
    ["email_address_invalid", "email"],
  ];
  for (const [code, cause] of attendus) {
    assert.equal(causeAuth({ code }), cause, `code ${code}`);
  }
});

test("repli textuel quand le serveur ne renvoie pas de code", () => {
  const attendus: [string, string][] = [
    ["User already registered", "exists"],
    ["Invalid login credentials", "credentials"],
    ["Password should be at least 6 characters", "password"],
    ["Email not confirmed", "notConfirmed"],
    ["email rate limit exceeded", "rate"],
    ["Signups not allowed for this instance", "disabled"],
    ["Unable to validate email address: invalid format", "email"],
    ["Failed to fetch", "network"],
  ];
  for (const [message, cause] of attendus) {
    assert.equal(causeAuth({ message }), cause, message);
  }
});

test("la casse du message n'a pas d'importance", () => {
  assert.equal(causeAuth({ message: "USER ALREADY REGISTERED" }), "exists");
});

test("CAS CONNU-NÉGATIF : une cause inconnue rend null, jamais un générique", () => {
  // Le jour où GoTrue introduit un code ou un message nouveau, l'interface
  // doit montrer le texte du serveur. Si ce test venait à passer avec une
  // valeur non nulle, l'information serait perdue en silence.
  assert.equal(causeAuth({ code: "quelque_chose_de_nouveau" }), null);
  assert.equal(causeAuth({ message: "Something entirely new happened" }), null);
  assert.equal(causeAuth({}), null);
  assert.equal(causeAuth(null), null);
  assert.equal(causeAuth(undefined), null);
});

test("un code inconnu retombe sur le texte plutôt que d'abandonner", () => {
  assert.equal(
    causeAuth({ code: "code_jamais_vu", message: "User already registered" }),
    "exists"
  );
});

test("le mode démo est distingué des erreurs serveur", () => {
  assert.equal(
    estModeDemo("supabaseUrl is required. Provide URL and API key."),
    true
  );
  assert.equal(estModeDemo("User already registered"), false);
  assert.equal(estModeDemo(null), false);
  // Et il n'est PAS une cause d'authentification : createClient() lève avant
  // le moindre appel réseau.
  assert.equal(causeAuth({ message: "Provide URL and API key" }), null);
});
