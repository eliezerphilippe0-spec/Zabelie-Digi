#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { releaseIdForCommit } from "../lib/deployment-release.mjs";

export const ESSAIS_PAR_DEFAUT = 60;
export const ATTENTE_MS_PAR_DEFAUT = 10000;

/** Chaque requête, lecture du corps comprise, possède son propre délai. */
async function lireJson(fetchFn, url, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchFn(url, {
          cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { "Cache-Control": "no-cache" },
        });
        return { status: response.status, body: await response.json() };
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("délai réseau dépassé"));
        }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/**
 * Exige LA livraison attendue ET une base accessible par le chemin acheteur.
 * @param {{url?: string, expectedCommit?: string, fetchFn?: typeof fetch, essais?: number,
 * attendreMs?: number, timeoutMs?: number, dormir?: (ms: number) => Promise<void>,
 * journal?: (ligne: string) => void}} options
 */
export async function verifierDeploiement({
  url, expectedCommit, fetchFn = fetch, essais = ESSAIS_PAR_DEFAUT,
  attendreMs = ATTENTE_MS_PAR_DEFAUT, timeoutMs = 8000,
  dormir = (ms) => new Promise((r) => setTimeout(r, ms)), journal = () => {},
} = {}) {
  let base;
  try {
    base = new URL((url ?? "").trim());
    if (!/^https?:$/.test(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error();
  } catch {
    return { ok: false, motif: "ZABELIE_URL absente ou invalide (origine HTTP(S) requise)", tentatives: 0 };
  }
  const expectedRelease = releaseIdForCommit(expectedCommit);
  if (!expectedRelease) return { ok: false, motif: "ZABELIE_EXPECTED_COMMIT absent ou invalide (SHA Git complet requis)", tentatives: 0 };
  if (!Number.isInteger(essais) || essais < 1 || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, motif: "Budget de vérification invalide", tentatives: 0 };
  }
  let dernier = "aucune tentative";
  for (let n = 1; n <= essais; n++) {
    try {
      const deployed = await lireJson(fetchFn, new URL("/api/deployment", base).href, timeoutMs);
      if (deployed.status !== 200 || deployed.body?.release !== expectedRelease) {
        dernier = `livraison attendue absente (HTTP ${deployed.status})`;
      } else {
        const ready = await lireJson(fetchFn, new URL("/api/readyz", base).href, timeoutMs);
        if (ready.status === 200 && ready.body?.ok === true) {
          journal(`✓ Livraison attendue et readyz 200 ok:true (tentative ${n})`);
          return { ok: true, motif: `livraison attendue, 200 ok:true en ${n} tentative(s)`, tentatives: n };
        }
        dernier = `readyz non sain (HTTP ${ready.status})`;
      }
    } catch (error) {
      dernier = error instanceof Error ? error.message : "erreur réseau";
    }
    journal(`… tentative ${n}/${essais} — ${dernier}`);
    if (n < essais) await dormir(attendreMs);
  }
  return { ok: false, motif: `${essais} tentative(s) sans livraison saine. Dernière : ${dernier}`, tentatives: essais };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifierDeploiement({
    url: process.env.ZABELIE_URL ?? process.argv[2],
    expectedCommit: process.env.ZABELIE_EXPECTED_COMMIT,
    journal: (line) => console.log(line),
  }).then((result) => {
    console.log(`${result.ok ? "✓" : "✗"} Déploiement ${result.ok ? "vérifié" : "NON vérifié"} — ${result.motif}`);
    process.exitCode = result.ok ? 0 : 1;
  }).catch(() => { console.error("✗ Vérification interrompue"); process.exitCode = 1; });
}
