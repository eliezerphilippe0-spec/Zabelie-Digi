import { test } from "node:test";
import assert from "node:assert/strict";
import { refus, refusRe } from "./refus-forme";

/**
 * L'INSTRUMENT PASSE SON PROPRE EXAMEN.
 *
 * `refus()` est né pour réparer cinq tests que la traduction avait fait rougir
 * sans qu'aucun refus n'ait changé. Un fragment de motif écrit sous cette
 * pression est précisément le genre d'outil qui n'est jamais vérifié lui-même —
 * la classe de défaut dominante de ce dépôt.
 *
 * Chaque assertion vient donc par paire : un cas où le motif DOIT mordre, et un
 * cas où il DOIT rester muet. Un motif qui n'a jamais rendu `false` n'a pas
 * encore démontré qu'il pouvait.
 */

const ANCIENNE = 'return NextResponse.json({ error: "Accès refusé" }, { status: 403 });';
const NOUVELLE = 'return erreurTraduite("api.access.denied", 403);';
const AVEC_LANGUE = 'return erreurAvecLangue(lang, "api.access.denied", 403);';
const AVEC_EXTRA = 'return erreurTraduite("api.policy.required", 400, { code: "policy_required" });';

test("R1 — les deux formes de refus sont reconnues (connu-positif)", () => {
  assert.match(ANCIENNE, refusRe(403));
  assert.match(NOUVELLE, refusRe(403));
  assert.match(AVEC_LANGUE, refusRe(403));
  assert.match(AVEC_EXTRA, refusRe(400));
});

test("R2 — un autre statut ne matche pas (connu-négatif)", () => {
  // Sans ce contrôle, `refus()` pourrait rendre vrai partout et les cinq tests
  // qu'il répare seraient devenus décoratifs.
  assert.doesNotMatch(ANCIENNE, refusRe(401));
  assert.doesNotMatch(NOUVELLE, refusRe(401));
  assert.doesNotMatch(AVEC_LANGUE, refusRe(500));
});

test("R3 — le préfixe numérique ne suffit pas : refus(40) ≠ status 403", () => {
  // C'est la raison d'être du `\b`. Retirer le `\b` du fragment fait ROUGIR ce
  // test — mutation vérifiée le 2026-08-22.
  assert.doesNotMatch(ANCIENNE, refusRe(40));
  assert.doesNotMatch(NOUVELLE, refusRe(40));
});

test("R4 — le nombre doit être en POSITION de statut, pas n'importe où", () => {
  // Un nombre qui traîne dans un autre appel ne doit jamais faire passer le
  // motif : le statut est le dernier argument, ou l'avant-dernier.
  assert.doesNotMatch('const t = titre.slice(0, 403);', refusRe(403));
  assert.doesNotMatch('return erreurTraduite("api.x", 400);', refusRe(403));
  // …mais `403` en position d'argument de statut, si.
  assert.match('return erreurTraduite("api.x", 403);', refusRe(403));
});

test("R5 — le fragment reste composable à droite d'une CONDITION", () => {
  // L'emploi réel : la liaison est portée par l'extrémité gauche. Un fragment
  // employé seul n'affirmerait qu'une présence de texte.
  const routeConvertie =
    'if (!me || me.role !== "admin") {\n' +
    '    return erreurTraduite("api.access.denied", 403);\n' +
    "  }";
  const motif = new RegExp(`me\\.role !== "admin"[\\s\\S]{0,160}${refus(403)}`);
  assert.match(routeConvertie, motif);

  // Connu-négatif de la LIAISON, et c'est le seul qui compte vraiment : le
  // garde est encore là, son statut aussi, mais la condition ne le commande
  // plus. Un test qui cherchait `status: 403` seul serait resté vert ici.
  const gardeInatteignable =
    "if (false) {\n" + '    return erreurTraduite("api.access.denied", 403);\n' + "  }";
  assert.doesNotMatch(gardeInatteignable, motif);
});

test("R6 — pas de drapeau `g` : un prédicat ne porte pas d'état", () => {
  // Un regex `g` avance `lastIndex` d'un `.test()` à l'autre et rend donc faux
  // un appel sur deux, en silence (`CLAUDE.md`).
  const re = refusRe(403);
  assert.equal(re.global, false);
  assert.equal(re.sticky, false);
  assert.equal(re.test(NOUVELLE), true);
  assert.equal(re.test(NOUVELLE), true, "deuxième appel faux : le motif porte un état");
});
