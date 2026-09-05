import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * LES RAYONS DE RECHARGE RESTENT DORMANTS TANT QUE D-7 N'EST PAS TRANCHÉE.
 *
 * `0097` sème « Recharge Digicel » et « Recharge Natcom » sous un parent
 * lui-même fermé. Ils préparent le modèle que le porteur a réaffirmé le
 * 2026-09-05 — le vendeur vend, Zabelie prélève sa commission — mais ils
 * n'autorisent rien : **D-7 est commerciale ET réglementaire**, et le
 * réglementaire ne se tranche pas par préférence.
 *
 * Ce test existe parce que l'enjeu n'est pas ordinaire. Un rayon « recharge »
 * est à un mot de « m ap vann balans », qui est de la monnaie électronique et
 * reste interdit sans appel. Une activation faite en passant — un `true` glissé
 * dans le seed, un `update` ajouté au fichier — ouvrirait les deux d'un coup.
 * La post-condition SQL le refuse à l'application ; ce croisement-ci le refuse
 * **avant**, en CI, quand le fichier n'a encore été appliqué nulle part.
 *
 * ⚠️ Depuis `0098` (décision porteur du 2026-09-05, « rajoute la section, en
 * cas d'interdit je vais l'enlever »), les trois rayons sont OUVERTS. Ce test
 * garde toujours le FICHIER 0097 : une migration appliquée ne se réécrit pas,
 * et 0097 doit rester ce qu'elle a été — un seed dormant. L'ouverture vit dans
 * 0098, avec ses propres gardes (`tests/sous-rayon.test.ts` SR8).
 *
 * Mutations éprouvées :
 *   RD1  le seed passe `false` → `true`                       → rouge
 *   RD2  un `set active = true` ajouté au fichier             → rouge
 *   RD3  la post-condition « ne doit RIEN ouvrir » retirée     → rouge
 */

const SQL = readFileSync(
  "supabase/migrations/0097_rechaj_vendeur_dormant_registre_0096.sql",
  "utf8",
);

/** Le SQL exécutable seul : sans ça, une interdiction porterait sur la prose. */
function executable(s: string): string {
  return s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}
const CODE = executable(SQL);

test("RD1 — les deux rayons sont semés INACTIFS, et la liaison est dans le seed lui-même", () => {
  // Ce qui COMMANDE : le `false` de la colonne `active` dans le `select` du
  // seed, pas un mot « dormant » écrit en commentaire.
  assert.match(
    CODE,
    /select p\.id, 3, v\.slug, v\.kr, v\.fr, v\.en, v\.es, false, v\.pos/,
    "le seed doit poser active = false",
  );
  for (const slug of ["rechaj-digicel", "rechaj-natcom"]) {
    assert.ok(CODE.includes(`'${slug}'`), `${slug} manque au seed`);
  }
});

test("RD2 — le fichier n'active RIEN, nulle part", () => {
  // Un `update … set active = true` glissé ici rouvrirait un rayon que 0096 a
  // fermé au titre de V-17, ou ouvrirait D-7 sans arbitrage.
  assert.doesNotMatch(
    CODE,
    /set\s+active\s*=\s*true/i,
    "0097 ne doit contenir aucune activation",
  );
  assert.doesNotMatch(CODE, /active,\s*true/i);
});

test("RD3 — la post-condition refuse explicitement toute ouverture accidentelle", () => {
  // La garde d'application doit exister ET porter sur le compte d'actifs.
  assert.match(
    CODE,
    /select count\(\*\) into v_actifs[\s\S]{0,200}where slug in \('rechaj-digicel', 'rechaj-natcom'\) and active;/,
  );
  assert.match(CODE, /if v_actifs <> 0 then[\s\S]{0,200}raise exception/);
  // Et le parent doit rester fermé — l'activer par effet de bord rouvrirait
  // la vente de recharge en propre, fermée par V-17.
  assert.match(CODE, /if v_parent then[\s\S]{0,200}raise exception/);
});

test("RD4 — la décision D-7 est citée, et les préalables à l'activation sont écrits", () => {
  // Le commentaire n'est pas décoratif ici : c'est le seul endroit où
  // quelqu'un qui ouvre ce fichier apprend qu'il ne doit PAS l'activer seul.
  assert.match(SQL, /D-7/);
  assert.match(SQL, /avis juridique/i);
  // La ligne entre le permis et l'interdit doit être nommée, avec les deux
  // termes que les gens emploient.
  assert.match(SQL, /vann balans/i);
  assert.match(SQL, /monnaie électronique|monnaie electronique/i);
});
