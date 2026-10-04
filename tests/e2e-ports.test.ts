import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

/**
 * PORTS DES SERVEURS DE TEST HORS DE LA PLAGE ÉPHÉMÈRE (2026-10-04).
 *
 * Linux attribue les ports locaux des connexions SORTANTES dans
 * 32768–60999 (`/proc/sys/net/ipv4/ip_local_port_range`, défaut des
 * runners GitHub). Un serveur de test qui écoute dans cette plage peut
 * trouver son port déjà pris par une connexion de la suite précédente :
 * EADDRINUSE, CI rouge sans rapport avec le code. Six occurrences
 * (#251, #263, #272, #303, #309, #311) avant ce garde.
 */
const EPHEMERE = { min: 32768, max: 60999 };

/** Les ports d'écoute déclarés : `127.0.0.1:N`, `localhost:N`, `PORT … N`, `listen(N`. */
export function portsDeclares(src: string): number[] {
  const motifs = [/(?:127\.0\.0\.1|localhost):(\d{2,5})/g, /PORT[A-Z_]*\b[^\n]{0,60}?\b(\d{4,5})\b/g, /\.listen\(\s*(\d{2,5})/g];
  return [...new Set(motifs.flatMap((m) => [...src.matchAll(m)].map((x) => Number(x[1]))))];
}

const FICHIERS = [
  ...readdirSync(".").filter((f) => /^playwright.*\.config\.ts$/.test(f)),
  ...["e2e/fixtures", "e2e-auth"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".mjs")).map((f) => `${d}/${f}`)),
  ".github/workflows/ci.yml",
];

test("témoin : le relevé voit un port dans la plage, et en voit assez dans le dépôt", () => {
  assert.deepEqual(portsDeclares('const PORT = Number(process.env.STUB_PORT ?? 54321);'), [54321]);
  assert.deepEqual(portsDeclares('url: "http://127.0.0.1:3002"').sort(), [3002]);
  assert.deepEqual(portsDeclares('}).listen(54323, "127.0.0.1")'), [54323]);
  const tous = FICHIERS.flatMap((f) => portsDeclares(readFileSync(f, "utf8")));
  assert.ok(tous.length >= 20, `seulement ${tous.length} ports relevés : l'extraction ne lit plus les fichiers`);
});

test("aucun serveur de test n'écoute dans la plage éphémère de Linux", () => {
  const fautifs = FICHIERS.flatMap((f) =>
    portsDeclares(readFileSync(f, "utf8"))
      .filter((p) => p >= EPHEMERE.min && p <= EPHEMERE.max)
      .map((p) => `${f} → ${p}`),
  );
  assert.deepEqual(fautifs, [], `ports dans ${EPHEMERE.min}–${EPHEMERE.max} : ${fautifs.join(", ")}`);
});
