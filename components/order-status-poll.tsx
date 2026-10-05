"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePoll } from "@/lib/use-poll";
import { useRef, useState } from "react";
import { appelSession } from "@/lib/appel-session";
import type { IssueAppel } from "@/lib/appel-session";
import type { MarketplaceCopy } from "@/lib/marketplace-copy";

/** Reuses an existing buyer-owned order; this action never prepares a payment. */
export function OrderPaymentRecovery({ orderId, labels }: {
  orderId: string;
  labels: Pick<MarketplaceCopy, "resumeAttempt" | "checkingAttempt" | "attemptUnavailable" | "paymentPending" | "paymentReview">;
}) {
  const router = useRouter();
  const submitting = useRef(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<"pending" | "review" | null>(null);
  async function resume() {
    if (submitting.current) return;
    submitting.current = true;
    setChecking(true);
    setError(false);
    setNotice(null);
    let issue: IssueAppel<{ redirectUrl?: string; checkoutState?: "ready" | "pending" | "review" | "complete" | "retryable" }>;
    try {
      issue = await appelSession("/api/checkout", { orderId, recoveryOnly: true });
    } catch { setError(true); return; }
    finally { submitting.current = false; setChecking(false); }
    if (issue.etat === "connexion") { router.push(issue.vers); return; }
    if (issue.etat === "ok" && (issue.data?.checkoutState === "pending" || issue.data?.checkoutState === "review")) {
      setNotice(issue.data.checkoutState);
      return;
    }
    if (issue.etat !== "ok" || typeof issue.data?.redirectUrl !== "string" || !issue.data.redirectUrl || !["ready", "complete"].includes(issue.data.checkoutState ?? "")) { setError(true); return; }
    if (issue.data.checkoutState === "complete" && !issue.data.redirectUrl.startsWith("/")) { setError(true); return; }
    const destination = issue.data.redirectUrl;
    if (destination.startsWith("/")) router.push(destination);
    else window.location.href = destination;
  }
  return <div>
    <button type="button" onClick={resume} disabled={checking} className="inline-flex min-h-11 items-center rounded-xl border border-line px-3 text-sm disabled:opacity-50">
      {checking ? labels.checkingAttempt : labels.resumeAttempt}
    </button>
    {notice && <p role="status" className="mt-2 text-sm text-mist">{notice === "pending" ? labels.paymentPending : labels.paymentReview}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-danger-text">{labels.attemptUnavailable}</p>}
  </div>;
}

/**
 * BL-132 (FRONT-4) : pilote silencieusement la page « en attente » — dès que
 * confirm_payment (S2S) a tranché, redirige vers succès/échec. Ne fait
 * confiance qu'à la ligne `orders` (jamais écrite côté client, RLS lecture
 * seule) — jamais au polling lui-même comme preuve de paiement.
 */
export function OrderStatusPoll({ orderId }: { orderId: string }) {
  const router = useRouter();

  // 10 s × 24 ticks ≈ 4 min (data chère, 3G) ; le réconciliateur prend le relais.
  usePoll({
    intervalMs: 10000,
    maxTicks: 24,
    resetKey: orderId,
    onTick: async (signal) => {
      const supabase = createClient();
      const { data } = await supabase
        .from("orders")
        .select("status, products(slug)")
        .eq("id", orderId)
        .abortSignal(signal)
        .maybeSingle();
      if (signal.aborted || !data) return false;
      if (data.status === "paid" || data.status === "delivered") {
        router.push(`/paiement/succes?commande=${orderId}`);
        return true;
      }
      if (
        data.status === "cancelled" ||
        data.status === "refunded" ||
        // Correctif audit : `disputed` (montant incohérent, posé par
        // confirm_payment) était absent — l'acheteur restait bloqué sur
        // cette page jusqu'à l'arrêt silencieux du polling, sans jamais
        // savoir que son paiement avait été rejeté.
        data.status === "disputed"
      ) {
        const prod = data.products as unknown as
          | { slug?: string }
          | { slug?: string }[]
          | null;
        const slug = Array.isArray(prod) ? prod[0]?.slug : prod?.slug;
        const raison = data.status === "disputed" ? "montant" : "non_confirme";
        router.push(
          `/paiement/echec?raison=${raison}${slug ? `&produit=${encodeURIComponent(slug)}` : ""}`
        );
        return true;
      }
      return false;
    },
  });

  return null;
}
