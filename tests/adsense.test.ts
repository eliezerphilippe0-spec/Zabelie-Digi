import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ADSENSE_CLIENT } from "../lib/adsense";

/**
 * ADSENSE — ÉTAPE 1 : VALIDATION DU SITE, AUCUNE ANNONCE (porteur, 2026-10-16).
 *
 *  A1  toutes les pages portent la balise `google-adsense-account`, depuis la
 *      mise en page racine et la source unique `lib/adsense.ts` ;
 *  A2  `/ads.txt` déclare le même compte, au format attendu par Google ;
 *  A3  aucun script AdSense n'est chargé tant que la diffusion n'est pas
 *      décidée (pages, consentement, CSP, politique v4 : voir lib/adsense.ts).
 *      Le jour où elle l'est, ce test change AVEC la décision, pas avant.
 */

const RACINE = join(import.meta.dirname, "..");
const lire = (p: string) => readFileSync(join(RACINE, p), "utf8");
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(join(RACINE, dir))) {
    const p = `${dir}/${e}`;
    if (statSync(join(RACINE, p)).isDirectory()) fichiers(p, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) acc.push(p);
  }
  return acc;
}

test("A1 — la balise de validation vient de la source unique, sur toutes les pages", () => {
  assert.match(ADSENSE_CLIENT, /^ca-pub-\d{16}$/);
  const layout = sansCommentaires(lire("app/layout.tsx"));
  assert.match(layout, /import \{ ADSENSE_CLIENT \} from "@\/lib\/adsense";/);
  assert.match(layout, /export const metadata: Metadata = \{[\s\S]*other: \{ "google-adsense-account": ADSENSE_CLIENT \},[\s\S]*\};\s*export const viewport/);
});

test("A2 — ads.txt déclare le même compte, au format de Google", () => {
  const lignes = lire("public/ads.txt").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  assert.deepEqual(lignes, [`google.com, ${ADSENSE_CLIENT.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0`]);
});

test("A3 — aucun script AdSense chargé avant la décision de diffusion", () => {
  const chargeurs = [...fichiers("app"), ...fichiers("components"), ...fichiers("lib"), "proxy.ts"]
    .filter((f) => /adsbygoogle|pagead2\.googlesyndication\.com/.test(sansCommentaires(lire(f))));
  assert.deepEqual(chargeurs, [], `script AdSense chargé avant la décision : ${chargeurs.join(", ")}`);
});
