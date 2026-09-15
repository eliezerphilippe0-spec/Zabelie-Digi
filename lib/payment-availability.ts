import { resolveMonCashMode } from "@/lib/moncash";
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
  try {
    const { mode } = resolveMonCashMode(env.MONCASH_MODE);
    if (!env.MONCASH_CLIENT_ID?.trim() || !env.MONCASH_CLIENT_SECRET?.trim()) return "unavailable";
    return mode;
  } catch {
    return "unavailable";
  }
}
