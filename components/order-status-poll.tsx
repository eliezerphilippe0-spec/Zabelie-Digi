"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePoll } from "@/lib/use-poll";

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
