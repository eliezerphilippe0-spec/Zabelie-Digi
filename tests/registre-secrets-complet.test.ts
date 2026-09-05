import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LE REGISTRE DES CLÉS NE DOIT PAS DÉRIVER — croisement `.env.example` ↔
 * `docs/11-SECRETS.md`.
 *
 * ─── CE QUI A ÉTÉ MESURÉ, ET POURQUOI CE FICHIER EXISTE ─────────────────────
 * Le 2026-08-20, l'audit `docs/41` §7.5 a constaté que onze variables étaient
 * LUES par le code sans figurer dans `.env.example`, les a ajoutées, et a câblé
 * `tests/env-example-complet.test.ts` — un croisement `.env.example` ↔ CODE.
 *
 * Personne n'a étendu `docs/11-SECRETS.md`, et **rien ne pouvait le signaler** :
 * le registre n'était croisé avec rien. Mesuré le 2026-09-05 : 15 variables
 * nommées au registre pour 31 déclarées dans `.env.example`. Parmi les vingt
 * absentes, trois secrets réels — `OPENAI_API_KEY`, `GEMINI_API_KEY`
 * (facturables) et `SEARCH_FINGERPRINT_SALT` (poivre cryptographique). Aucune
 * n'avait fuité ; simplement, la procédure de fuite du §5 ne les nommait pas,
 * et personne n'aurait su qu'il fallait les révoquer.
 *
 * C'est très exactement le motif que `CLAUDE.md` décrit sous « le code sans
 * appelant » : un artefact que rien ne croise ne lève rien, ne journalise
 * rien, et son défaut est invisible PAR NATURE. Un document se périme encore
 * plus silencieusement qu'une fonction.
 *
 * ─── CE QUE CE CROISEMENT GARANTIT ──────────────────────────────────────────
 * Fail-closed : toute variable de `.env.example` doit être classée dans
 * EXACTEMENT un des trois tableaux du registre. Une variable ajoutée demain et
 * non classée fait rougir la CI — on ne peut plus l'oublier, il faut décider
 * si c'est un secret.
 *
 * Et l'exemption se périme dans les deux sens : un nom cité au registre qui
 * disparaît de `.env.example` échoue aussi, pour que le registre ne se
 * remplisse pas de fantômes.
 *
 * Mutations éprouvées :
 *   RS1  `OPENAI_API_KEY` retirée du registre                → rouge
 *   RS2  `GEMINI_MODEL` déplacée en 2.1 (double classement)  → rouge
 *   RS3  une variable inventée ajoutée au registre           → rouge
 *   RS4  `NEXT_PUBLIC_SITE_URL` classée comme secret         → rouge
 *   RS5  une valeur posée sur un secret dans `.env.example`  → rouge
 */

const ENV = readFileSync(".env.example", "utf8");
const REGISTRE = readFileSync("docs/11-SECRETS.md", "utf8");

/** Les variables déclarées par le gabarit, avec leur valeur. */
function variablesDuGabarit(): Map<string, string> {
  const m = new Map<string, string>();
  for (const ligne of ENV.split("\n")) {
    const t = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(ligne);
    if (t) m.set(t[1], t[2]);
  }
  return m;
}

/**
 * Les noms cités dans le tableau d'une section du registre.
 *
 * On lit UNIQUEMENT la première cellule d'une ligne de tableau
 * (`| \`NOM\` | … |`), jamais la prose : les notes sous les tableaux citent
 * légitimement d'autres variables — `NEXT_PUBLIC_AUTH_PROVIDERS` est
 * expliquée sous le tableau des secrets sans en être un. Une extraction qui
 * ramasserait tous les mots en majuscules de la section les confondrait, et
 * ce test « marcherait » en classant de travers.
 */
function tableauDeSection(titre: string): string[] {
  const debut = REGISTRE.indexOf(titre);
  assert.notEqual(debut, -1, `section « ${titre} » introuvable dans docs/11-SECRETS.md`);
  const suite = REGISTRE.slice(debut + titre.length);
  // La section s'arrête au prochain titre de même niveau ou supérieur.
  const fin = suite.search(/\n#{2,3} /);
  const corps = fin === -1 ? suite : suite.slice(0, fin);
  return [...corps.matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)].map((m) => m[1]);
}

const SECRETS = tableauDeSection("### 2.1");
const CONFIG = tableauDeSection("### 2.2");
const PUBLIQUES = tableauDeSection("### 2.3");

test("RS0 — les trois tableaux du registre sont lisibles et non vides", () => {
  // Sans ce garde, un titre renommé viderait les trois listes et TOUS les
  // tests suivants passeraient au vert en ne comparant rien : le vert de la
  // mutation qui n'a pas muté, transposé à un parseur.
  assert.ok(SECRETS.length >= 10, `2.1 : ${SECRETS.length} lignes lues`);
  assert.ok(CONFIG.length >= 8, `2.2 : ${CONFIG.length} lignes lues`);
  assert.ok(PUBLIQUES.length >= 6, `2.3 : ${PUBLIQUES.length} lignes lues`);
});

test("RS1 — toute variable de `.env.example` est classée dans le registre", () => {
  const classees = new Set([...SECRETS, ...CONFIG, ...PUBLIQUES]);
  const manquantes = [...variablesDuGabarit().keys()].filter((v) => !classees.has(v));
  assert.deepEqual(
    manquantes,
    [],
    `Variable(s) absente(s) de docs/11-SECRETS.md : ${manquantes.join(", ")}. ` +
      `Il faut DÉCIDER : secret (2.1), configuration serveur (2.2) ou publique (2.3). ` +
      `Un secret non registré est un secret que personne ne pensera à révoquer.`,
  );
});

test("RS2 — aucune variable classée deux fois", () => {
  const toutes = [...SECRETS, ...CONFIG, ...PUBLIQUES];
  const doublons = toutes.filter((v, i) => toutes.indexOf(v) !== i);
  assert.deepEqual(
    [...new Set(doublons)],
    [],
    "une variable figure dans plusieurs tableaux : sa classification est ambiguë",
  );
});

test("RS3 — aucun fantôme : tout nom du registre existe dans `.env.example`", () => {
  // L'exemption se périme dans les deux sens. Un registre qui ne sait que
  // grandir devient une conformité par usure.
  const gabarit = variablesDuGabarit();
  const fantomes = [...SECRETS, ...CONFIG, ...PUBLIQUES].filter((v) => !gabarit.has(v));
  assert.deepEqual(
    fantomes,
    [],
    `Nom(s) au registre sans ligne dans .env.example : ${fantomes.join(", ")}`,
  );
});

test("RS4 — un secret n'est JAMAIS préfixé `NEXT_PUBLIC_`, et une publique l'est toujours", () => {
  // `NEXT_PUBLIC_` est inliné dans le bundle navigateur au BUILD : un secret
  // qui porterait ce préfixe serait publié à chaque déploiement, sans erreur
  // et sans trace.
  const fuites = SECRETS.filter((v) => v.startsWith("NEXT_PUBLIC_"));
  assert.deepEqual(fuites, [], `secret(s) exposé(s) au navigateur : ${fuites.join(", ")}`);
  const malClassees = CONFIG.filter((v) => v.startsWith("NEXT_PUBLIC_"));
  assert.deepEqual(malClassees, [], `NEXT_PUBLIC_ classée en configuration serveur : ${malClassees.join(", ")}`);
  const sansPrefixe = PUBLIQUES.filter((v) => !v.startsWith("NEXT_PUBLIC_"));
  assert.deepEqual(sansPrefixe, [], `classée publique sans le préfixe : ${sansPrefixe.join(", ")}`);
});

test("RS5 — aucun secret ne porte de valeur dans `.env.example`", () => {
  // Le gabarit est un gabarit, jamais un stockage. Une valeur sur une ligne de
  // secret, même « pour essayer », est un secret commité.
  const gabarit = variablesDuGabarit();
  const avecValeur = SECRETS.filter((v) => (gabarit.get(v) ?? "").trim() !== "");
  assert.deepEqual(
    avecValeur,
    [],
    `secret(s) porteur(s) d'une valeur dans .env.example : ${avecValeur.join(", ")}`,
  );
});

test("RS6 — les trois secrets découverts le 2026-09-05 sont bien au registre", () => {
  // Connu-positif nommé : ce sont EUX qui manquaient. Si un jour ce test
  // devient faux, c'est qu'on a régressé exactement là où on s'est déjà fait
  // prendre.
  for (const v of ["OPENAI_API_KEY", "GEMINI_API_KEY", "SEARCH_FINGERPRINT_SALT"]) {
    assert.ok(SECRETS.includes(v), `${v} doit être classé secret (2.1)`);
  }
  // Et la procédure de fuite doit les couvrir : elle nommait cinq
  // fournisseurs et en oubliait deux.
  const fuite = REGISTRE.slice(REGISTRE.indexOf("## 5."));
  assert.match(fuite, /OpenAI/, "le §5 doit nommer OpenAI parmi les fournisseurs à qui révoquer");
  assert.match(fuite, /SEARCH_FINGERPRINT_SALT/, "le §5 doit dire ce que « révoquer » veut dire pour un poivre sans fournisseur");
});
