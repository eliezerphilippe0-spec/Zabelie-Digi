import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

/**
 * `next dev` ÉCRIT DANS `CLAUDE.md` SI ON LE LAISSE FAIRE — mesuré le 2026-09-26.
 *
 * Next 16 ajoute à chaque démarrage de `next dev` un bloc
 * `<!-- BEGIN:nextjs-agent-rules -->` à la fin de `CLAUDE.md`, et crée
 * `AGENTS.md`, sauf si `agentRules: false`. Le bloc demande lui-même à être
 * commité. `CLAUDE.md` est la constitution du dépôt : elle ne s'écrit qu'à la
 * main, sur décision du porteur.
 */

const config = readFileSync("next.config.mjs", "utf8").replace(/\/\/.*$/gm, "");

test("A1 — `agentRules: false` est posé dans la config Next, hors commentaire", () => {
  assert.match(config, /^\s*agentRules:\s*false,/m);
});

test("A2 — aucun bloc généré par Next dans CLAUDE.md, aucun AGENTS.md", () => {
  assert.doesNotMatch(readFileSync("CLAUDE.md", "utf8"), /nextjs-agent-rules/, "bloc `next dev` présent dans CLAUDE.md — à retirer, pas à commiter");
  assert.equal(existsSync("AGENTS.md"), false, "AGENTS.md généré par `next dev`");
});
