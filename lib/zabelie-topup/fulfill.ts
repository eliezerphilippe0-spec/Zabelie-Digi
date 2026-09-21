/**
 * Orchestration du fulfillment de recharge — V-11.
 * Appelée APRÈS confirmation du paiement (retour MonCash, confirmation admin
 * Zelle) et par le réconciliateur (rattrapage). Règles :
 *   - transitions uniquement via zabelie_topup_transition (machine à états) ;
 *   - retry backoff exponentiel, max 3 tentatives, MÊME clé d'idempotence
 *     (order.id → customIdentifier fournisseur) ;
 *   - échec définitif après paiement confirmé → refund_pending + checkpoint
 *     humain (file « Remboursements » du back-office) — JAMAIS de
 *     remboursement automatique (contrainte BRH n°4 : moyen d'origine).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopupProvider } from "./provider";
import { reloadlyProvider, isReloadlyEnabled } from "./reloadly";
import { fulfillmentBackoffMs } from "./limits";

export function getTopupProvider(): TopupProvider | null {
  return isTopupEnabled() ? reloadlyProvider : null;
}

export function isTopupEnabled(): boolean {
  // A paid order must never be fulfilled by a simulated Sandbox top-up.
  // Independent of the sales flag: existing paid orders still need service.
  return process.env.RELOADLY_MODE === "production" && isReloadlyEnabled();
}

type TopupOrderRow = {
  id: string;
  operator: "digicel" | "natcom";
  beneficiary_phone: string;
  face_value_htg: number;
  status: string;
  attempts: number;
  product_id: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Tente de livrer une commande payée. Idempotente : rejouable sans risque
 * (delivered → no-op ; l'idempotence fournisseur couvre les timeouts).
 *
 * BL-135 (C-10) : `maxAttemptsThisCall` borne le nombre de tentatives faites
 * PAR CET APPEL (le budget total reste 3, cumulé via order.attempts en base
 * entre les appels). Le retour navigateur MonCash appelle avec 1 — sur une
 * commande fraîchement payée (attempts=0), le backoff est 0s : aucun sleep
 * synchrone dans ce handler serverless. S'il reste du budget après cet appel,
 * l'ordre reste `fulfillment_pending` et le réconciliateur (cron) reprend
 * avec la même clé d'idempotence — jamais d'échec prématuré.
 */
export async function fulfillTopupOrder(
  admin: SupabaseClient,
  orderId: string,
  provider: TopupProvider | null = getTopupProvider(),
  maxAttemptsThisCall: number = 3
): Promise<{ status: string; error?: string }> {
  const { data, error } = await admin
    .from("zabelie_topup_orders")
    .select("id, operator, beneficiary_phone, face_value_htg, status, attempts, product_id")
    .eq("id", orderId)
    .single();
  if (error || !data) return { status: "unknown", error: error?.message };
  const order = data as TopupOrderRow;

  if (order.status === "delivered") return { status: "delivered" };
  if (order.status !== "paid" && order.status !== "fulfillment_pending") {
    return { status: order.status };
  }
  if (!provider) {
    return { status: order.status, error: "Fournisseur topup non configuré" };
  }

  if (order.status === "paid") {
    await admin.rpc("zabelie_topup_transition", {
      p_order_id: orderId,
      p_to: "fulfillment_pending",
      p_detail: { provider: provider.name },
    });
  }

  const { data: product } = await admin
    .from("zabelie_topup_products")
    .select("provider_product_id")
    .eq("id", order.product_id)
    .single();

  let attempt = order.attempts;
  let attemptsThisCall = 0;
  let lastError = "";
  let budgetExhausted = false; // 3 tentatives TOTALES épuisées, ou erreur non-retryable

  while (attemptsThisCall < maxAttemptsThisCall) {
    const wait = fulfillmentBackoffMs(attempt);
    if (wait === null) {
      budgetExhausted = true;
      break; // 3 tentatives épuisées
    }
    if (wait > 0) await sleep(wait);

    const result = await provider.fulfillTopup({
      orderId: order.id, // clé d'idempotence transmise au fournisseur
      operator: order.operator,
      providerProductId: product?.provider_product_id ?? null,
      beneficiaryPhone: order.beneficiary_phone,
      faceValueHtg: order.face_value_htg,
    });

    attempt += 1;
    attemptsThisCall += 1;
    await admin
      .from("zabelie_topup_orders")
      .update({
        attempts: attempt,
        last_error: result.ok ? null : result.error,
        provider_ref: result.ok ? result.providerRef : undefined,
      })
      .eq("id", orderId);

    if (result.ok) {
      await admin.rpc("zabelie_topup_transition", {
        p_order_id: orderId,
        p_to: "delivered",
        p_detail: { provider_ref: result.providerRef, attempts: attempt },
      });
      return { status: "delivered" };
    }

    lastError = result.error;
    if (!result.retryable) {
      budgetExhausted = true;
      break;
    }
  }

  // Correctif audit : quand maxAttemptsThisCall == budget total (3, le
  // défaut cron/admin), la boucle peut sortir via `attemptsThisCall <
  // maxAttemptsThisCall` devenant faux AVANT de retomber sur le test
  // `wait === null` qui aurait posé budgetExhausted — sans ce filet, un
  // épuisement du budget total en 3 échecs « retryable » dans le même appel
  // laissait l'ordre en fulfillment_pending au lieu d'escalader vers
  // refund_pending, retardant le checkpoint humain de remboursement d'un
  // cycle cron entier.
  if (!budgetExhausted && fulfillmentBackoffMs(attempt) === null) {
    budgetExhausted = true;
  }

  if (!budgetExhausted) {
    // BL-135 : budget de CET appel épuisé, mais il reste des tentatives au
    // total → laisse fulfillment_pending, le réconciliateur reprendra.
    return { status: "fulfillment_pending", error: lastError || undefined };
  }

  // Échec définitif d'une commande PAYÉE → remboursement à préparer
  // (checkpoint humain, moyen de paiement d'origine uniquement).
  await admin.rpc("zabelie_topup_transition", {
    p_order_id: orderId,
    p_to: "failed",
    p_detail: { reason: "fulfillment_failed", error: lastError, attempts: attempt },
  });
  await admin.rpc("zabelie_topup_transition", {
    p_order_id: orderId,
    p_to: "refund_pending",
    p_detail: { requires_human_checkpoint: true },
  });
  return { status: "refund_pending", error: lastError };
}
