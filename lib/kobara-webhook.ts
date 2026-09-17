import type { KobaraMode } from "./kobara";

export type KobaraWebhookPayment = {
  id: string;
  amount: number;
  currency: "HTG";
  environment: KobaraMode;
  orderId: string | null;
  provider: string | null;
  providerRef: string;
};

type Result =
  | { ok: true; payment: KobaraWebhookPayment }
  | { ok: false; code: string; ignored?: boolean };

/** Only call after verifying the signature over the original HTTP body. */
export function readKobaraWebhook(event: unknown, headerEnvironment: string | null, mode: KobaraMode): Result {
  if (!event || typeof event !== "object" || Array.isArray(event)) return { ok: false, code: "corps_illisible" };
  const e = event as Record<string, unknown>;
  const p = e.data as Record<string, unknown> | undefined;
  if (headerEnvironment !== mode || e.environment !== mode || !p || p.environment !== mode) {
    return { ok: false, code: "environnement_incompatible" };
  }
  if (e.event_type !== "payment.succeeded") return { ok: false, code: "evenement_ignore", ignored: true };
  const id = typeof p.id === "string" ? p.id : typeof p.payment_id === "string" ? p.payment_id : null;
  if (!id || (p.id && p.payment_id && p.id !== p.payment_id)) return { ok: false, code: "payment_id_invalide" };
  if (typeof p.amount !== "number" || !Number.isSafeInteger(p.amount) || p.amount <= 0) {
    return { ok: false, code: "montant_illisible" };
  }
  if (p.currency !== "HTG") return { ok: false, code: "devise_inattendue" };
  if (p.status !== "succeeded") return { ok: false, code: "statut_inattendu" };
  const metadata = p.metadata as Record<string, unknown> | undefined;
  return { ok: true, payment: {
    id, amount: p.amount, currency: "HTG", environment: mode,
    orderId: typeof metadata?.order_id === "string" ? metadata.order_id : null,
    provider: typeof p.provider === "string" ? p.provider : null,
    providerRef: typeof p.provider_reference === "string" ? p.provider_reference : id,
  } };
}
