import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Chantier A — garde-fou du rebrand « Zabelie Digi » → « Zabelie ».
 *
 * Ce test vérifie les DEUX sens, et c'est le second qui compte le plus :
 *   1. plus aucune occurrence de l'ancien nom dans les surfaces utilisateur ;
 *   2. « Digicel » — l'opérateur télécom partenaire — est INTACT.
 *
 * Un `grep -r "Digi"` remplacé globalement aurait cassé le catalogue de
 * recharge et les mentions « MonCash (Digicel) ». Le renommage ne porte que
 * sur la chaîne exacte.
 */

const ROOTS = ["app", "components", "lib"];
const EXTS = [".ts", ".tsx"];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (EXTS.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => walk(r));

test("aucune occurrence de l'ancien nom dans les surfaces utilisateur", () => {
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    src.split("\n").forEach((line, i) => {
      // Chaîne exacte, et lockup JSX en deux <span> (« Zabelie <span>Digi</span> »).
      if (/Zabelie Digi/.test(line) || /Zabelie\s*<span[^>]*>\s*Digi\s*</.test(line)) {
        offenders.push(`${f}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `ancien nom encore présent :\n${offenders.join("\n")}`);
});

test("« Digicel » est intact (jamais remplacé par erreur)", () => {
  // L'opérateur est cité dans le service de recharge et la page confidentialité.
  const withDigicel = files.filter((f) => /Digicel/.test(readFileSync(f, "utf8")));
  assert.ok(
    withDigicel.length > 0,
    "aucune mention de Digicel : un remplacement global a probablement corrompu le nom de l'opérateur"
  );

  // Symptôme d'un remplacement fautif : « Zabeliecel », « cel » orphelin…
  const corrupted: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    if (/Zabeliecel|Zabelie\s*cel\b/.test(src)) corrupted.push(f);
  }
  assert.deepEqual(corrupted, [], `nom d'opérateur corrompu dans :\n${corrupted.join("\n")}`);
});

test("le nom « Zabely » n'est jamais utilisé à la place de « Zabelie »", () => {
  // `zabely` minuscule reste autorisé dans les identifiants techniques
  // existants (règle CLAUDE.md) ; seule la forme affichée est interdite.
  const offenders: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/\bZabely\b/.test(line)) offenders.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `« Zabely » trouvé :\n${offenders.join("\n")}`);
});
