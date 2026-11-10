import { resolveMonCashMode } from "@/lib/moncash";
import { isKobaraEnabled, resolveKobaraMode } from "@/lib/kobara";
import type { I18nKey } from "@/lib/i18n";

export type MonCashAvailability = "production" | "sandbox" | "unavailable";
export const MONCASH_AVAILABILITY_LABELS: Record<MonCashAvailability, I18nKey> = {
  production: "availability.moncash.production",
  sandbox: "availability.moncash.sandbox",
  unavailable: "availability.moncash.unavailable",
};

/** Server-only configuration signal, not a successful-payment or merchant-approval proof.
 * No credentials are returned, logged, or sent to the browser. */
export function getMonCashAvailability(env: NodeJS.ProcessEnv = process.env): MonCashAvailability {
  if (env.KOBARA_MONCASH?.trim() === "true" && getKobaraAvailability(env) === "production") return "production";
  try {
    const { mode } = resolveMonCashMode(env.MONCASH_MODE);
    if (!env.MONCASH_CLIENT_ID?.trim() || !env.MONCASH_CLIENT_SECRET?.trim()) return "unavailable";
    return mode;
  } catch {
    return "unavailable";
  }
}

/**
 * LE RAIL MONCASH DIRECT PEUT-IL ÊTRE PROPOSÉ ? (audit du 2026-11-10, P0-2)
 *
 * Faux dans UN seul cas : le déploiement de PRODUCTION (`VERCEL_ENV`) dont la
 * configuration ne permet pas de créer un paiement — identifiants absents, ou
 * `MONCASH_MODE` absent, vide ou invalide (ce que `garderProduction` refuse
 * déjà, mais APRÈS la création de la commande et la réservation du stock).
 * Le bouton s'affichait quand même ; l'acheteur cliquait, une commande
 * naissait, puis 502. Ici, on ne propose pas ce qu'on ne peut pas encaisser.
 *
 * ⚠️ Hors production, TOUJOURS vrai, et c'est voulu : le local, les Preview et
 * six configurations e2e tournent sans identifiants et se servent du 502 de
 * l'opérateur comme simulation de panne. Même découpe que `garderProduction`
 * (`lib/moncash.ts`) : `VERCEL_ENV`, jamais `NODE_ENV`, qui vaut aussi
 * « production » sur un build de Preview ou de test.
 *
 * ⚠️ Ce n'est PAS « MonCash encaisse » : un mode `sandbox` explicite avec ses
 * identifiants reste proposable. Masquer le bouton en phase de test est une
 * décision d'affichage commercial, qui revient au porteur. Et ce n'est pas
 * `getMonCashAvailability` : celle-ci rend « production » dès que MonCash
 * passe par Kobara, ce qui ne dit rien du rail DIRECT.
 */
export function monCashDirectProposable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV !== "production") return true;
  try {
    const { source } = resolveMonCashMode(env.MONCASH_MODE);
    return source === "explicite" && Boolean(env.MONCASH_CLIENT_ID?.trim()) && Boolean(env.MONCASH_CLIENT_SECRET?.trim());
  } catch {
    return false;
  }
}

export function getKobaraAvailability(env: NodeJS.ProcessEnv = process.env): MonCashAvailability {
  if (!isKobaraEnabled(env.KOBARA_SECRET_KEY ?? "", env.KOBARA_WEBHOOK_SECRET ?? "")) return "unavailable";
  const { mode, source } = resolveKobaraMode(env.KOBARA_MODE);
  if (source !== "explicite" || !env.KOBARA_SECRET_KEY?.trim().startsWith(`kbr_sk_${mode}_`)) return "unavailable";
  if (mode === "live") return "production";
  // The default public host rejects sandbox keys; no sandbox host is guessed.
  try {
    const base = new URL(env.KOBARA_API_BASE || "https://api.kobara.app");
    return base.protocol === "https:" && base.hostname !== "api.kobara.app" ? "sandbox" : "unavailable";
  } catch { return "unavailable"; }
}

export function getNatCashAvailabilityKey(env: NodeJS.ProcessEnv = process.env): I18nKey {
  const state = getKobaraAvailability(env);
  return state === "production" ? "availability.natcash.production" :
    state === "sandbox" ? "availability.natcash.sandbox" : "footer.natcash";
}

export type EtatPaiement = "active" | "test" | "soon" | "off";

/** Pastille du pied de page. « Actif » UNIQUEMENT en production — jamais par défaut. */
export function etatDisponibilite(d: MonCashAvailability, sinon: "soon" | "off"): EtatPaiement {
  return d === "production" ? "active" : d === "sandbox" ? "test" : sinon;
}
