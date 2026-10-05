#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ORIGINES = new Set(["https://zabelie.com", "https://www.zabelie.com"]);
const TAILLE_MAX_REPONSE = 65536;

/** @typedef {{ok: boolean, statut: string, http?: number, scanned?: number,
 * confirmed?: number, erreurs?: number, divergences?: number, rejets?: number,
 * sessionsManquantes?: number}} ResultatReconciliation */

function compteur(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Ne sort que des compteurs : les réponses internes portent des identifiants.
 * @returns {ResultatReconciliation | null} */
export function resumerReconciliation(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (body.ignore === "bail_tenu") return { ok: true, statut: "bail_tenu" };
  const total = { scanned: 0, confirmed: 0, erreurs: 0, divergences: 0, rejets: 0, sessionsManquantes: 0 };
  for (const rail of [body, body.topup, body.kobara, body.stripe]) {
    if (!rail || typeof rail !== "object" || Array.isArray(rail)) return null;
    if (rail.ignore === "rail_non_configure") continue;
    if (typeof rail.error === "string" && rail.error) { total.erreurs++; continue; }
    if (!Array.isArray(rail.errors)) return null;
    total.erreurs += rail.errors.length;
    const scanned = compteur(rail.scanned);
    const confirmed = compteur(rail.confirmed);
    // Une file inaccessible peut rendre { errors: [...] } sans compteurs.
    if ((scanned === null || confirmed === null) && rail.errors.length === 0) return null;
    total.scanned += scanned ?? 0;
    total.confirmed += confirmed ?? 0;
    if (rail.discrepancies !== undefined) {
      if (!Array.isArray(rail.discrepancies)) return null;
      total.divergences += rail.discrepancies.length;
    }
    for (const [champ, cible] of [["rejected", "rejets"], ["missingSession", "sessionsManquantes"], ["sansIdentifiant", "sessionsManquantes"]]) {
      if (rail[champ] === undefined) continue;
      const n = compteur(rail[champ]);
      if (n === null) return null;
      total[cible] += n;
    }
  }
  if (!Object.values(total).every(Number.isSafeInteger)) return null;
  const ok = total.erreurs + total.divergences + total.rejets + total.sessionsManquantes === 0;
  return { ok, statut: ok ? "termine" : "verification_requise", ...total };
}

/** Une seule tentative. Une coupure ne prouve pas que le serveur a cessé le travail.
 * @param {{url?: string, secret?: string, ordonnanceur?: string, fetchFn?: typeof fetch, timeoutMs?: number}} options
 * @returns {Promise<ResultatReconciliation>} */
export async function declencherReconciliation({
  url, secret, ordonnanceur, fetchFn = fetch, timeoutMs = 305000,
} = {}) {
  if (ordonnanceur !== "github") return { ok: false, statut: "ordonnanceur_non_configure" };
  let base;
  try {
    base = new URL((url ?? "").trim());
    if (!ORIGINES.has(base.origin) || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error();
  } catch { return { ok: false, statut: "origine_non_autorisee" }; }
  if (typeof secret !== "string" || !secret.trim() || /[\r\n]/.test(secret)) return { ok: false, statut: "secret_non_configure" };
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 305000) return { ok: false, statut: "budget_invalide" };
  const controller = new AbortController();
  let timer;
  let expire = false;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchFn(new URL("/api/reconcile", base).href, {
          method: "POST", redirect: "error", cache: "no-store", credentials: "omit",
          referrerPolicy: "no-referrer", signal: controller.signal,
          headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
          body: "{}",
        });
        if (response.status !== 200) return { ok: false, statut: "http_non_sain", http: response.status };
        if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) return { ok: false, statut: "reponse_invalide" };
        const reader = response.body.getReader();
        const chunks = [];
        let taille = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            taille += value.byteLength;
            if (taille > TAILLE_MAX_REPONSE) {
              await reader.cancel();
              return { ok: false, statut: "reponse_trop_volumineuse" };
            }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(taille);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        let body;
        try { body = JSON.parse(new TextDecoder().decode(bytes)); }
        catch { return { ok: false, statut: "reponse_invalide" }; }
        return resumerReconciliation(body) ?? { ok: false, statut: "reponse_invalide" };
      })(),
      new Promise((resolveTimeout) => {
        timer = setTimeout(() => {
          expire = true;
          controller.abort();
          resolveTimeout({ ok: false, statut: "issue_incertaine" });
        }, timeoutMs);
      }),
    ]);
  } catch { return { ok: false, statut: expire ? "issue_incertaine" : "transport_incertain" }; }
  finally { clearTimeout(timer); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  declencherReconciliation({
    url: process.env.ZABELIE_URL,
    secret: process.env.RECONCILE_SECRET,
    ordonnanceur: process.env.ZABELIE_RECONCILE_SCHEDULER,
  }).then((result) => {
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    process.exitCode = result.ok ? 0 : 1;
  }).catch(() => { console.error("reconciliation_interrompue"); process.exitCode = 1; });
}
