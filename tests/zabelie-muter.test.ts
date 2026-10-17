import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * LE HARNAIS DE MUTATION LUI-MÊME (`scripts/zabelie-muter.mjs`).
 *
 * Le 2026-10-14, une mutation SQL `as $$ … $$` est arrivée dans le fichier en
 * `as $ … $` : `String.replace` interprète `$$` dans une chaîne de
 * remplacement. Le garde visé est resté vert, pour une mutation qui n'était
 * pas celle demandée. Ce test pose une mutation chargée de motifs `$` et
 * vérifie qu'elle arrive MOT POUR MOT, puis que le fichier est restauré.
 */

const RACINE = join(import.meta.dirname, "..");

test("une mutation contenant $$ et $& arrive telle quelle, puis le fichier est restauré", () => {
  const dossier = mkdtempSync(join(tmpdir(), "muter-"));
  try {
    const fichier = join(dossier, "cible.sql");
    const original = "create function f() returns int language sql as $$ select ANCRE $$;\n";
    writeFileSync(fichier, original);
    const remplacement = "1 $$ $& $' $1";
    // La « suite » rougit (exit 1) seulement si le fichier porte le remplacement exact.
    const verif = `process.exit(require("fs").readFileSync(${JSON.stringify(fichier)}, "utf8").includes(${JSON.stringify(remplacement)}) ? 1 : 0)`;
    const r = spawnSync(process.execPath, [join(RACINE, "scripts/zabelie-muter.mjs"), fichier, "ANCRE", remplacement, process.execPath, "-e", verif], { encoding: "utf8" });
    assert.equal(r.status, 0, `le harnais n'a pas vu la mutation exacte :\n${r.stdout}\n${r.stderr}`);
    assert.equal(readFileSync(fichier, "utf8"), original, "le fichier n'a pas été restauré");
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});
