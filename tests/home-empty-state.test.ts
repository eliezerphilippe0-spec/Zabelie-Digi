import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * ÉTAT VIDE DE L'ACCUEIL — la règle a changé deux fois, et ce fichier garde
 * la dernière.
 *
 *   • V-13 (2026-07) : une section vide s'efface, jamais d'étagère déserte.
 *   • Amendement porteur du 2026-08-10 : DEUX sections (fichiers digitaux,
 *     services) restaient visibles à vide avec une invitation à vendre.
 *   • Accueil premium, Phase 3 (2026-09-04, brief §4.3) : l'invitation
 *     disparaît. Une rangée n'existe qu'à partir de SEUIL_RANGEE produits
 *     (`lib/home-sections.ts`), et l'appel aux vendeurs vit dans UN bloc en
 *     fin de page. Sous le seuil, rien — pas même un titre.
 *
 * Ce test vérifie que l'amendement de 2026-08-10 ne REVIENT pas par une prop
 * `empty` réinventée, et que la garde de vacuité passe par le helper partagé
 * plutôt qu'une condition écrite à la main dans la page.
 */
const SOURCE = readFileSync("app/page.tsx", "utf8");

test("aucune rangée ne porte plus d'invitation à vide — la prop `empty` n'existe plus", () => {
  assert.doesNotMatch(SOURCE, /empty=\{\{|empty\?: \{ body/);
});

test("la garde de vacuité de HomeRow est le seuil partagé, pas un `length === 0` local", () => {
  assert.match(SOURCE, /if \(!rangeeVisible\(items\.length\)\) return null;/);
  assert.doesNotMatch(SOURCE, /items\.length\s*===?\s*0\s*&&/);
  assert.match(SOURCE, /from "@\/lib\/home-sections"/);
});
