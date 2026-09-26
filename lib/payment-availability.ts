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
