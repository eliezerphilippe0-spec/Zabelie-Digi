export type OperationKind = "payment_pending" | "payment_review" | "handover" | "support" | "refund" | "payout" | "stripe_dispute";
export type Operation = {
  kind: OperationKind; id: string; order_id: string | null; reference: string | null;
  amount_htg: number | null; rail: string | null; since: string;
  stripe_status?: string | null; stripe_event_type?: string | null; payment_intent_id?: string | null;
  freeze_active?: boolean | null; freeze_enabled?: boolean | null; requires_review?: boolean | null;
};
export const operationLabels: Record<OperationKind, string> = {
  payment_pending: "Paiement à vérifier", payment_review: "Paiement reçu, commande à examiner",
  handover: "Remise à traiter", support: "Dossier client", refund: "Retour des fonds à justifier", payout: "Versement vendeur en attente",
  stripe_dispute: "Litige Stripe à examiner",
};
export function operationHref(row: Operation): string {
  if (row.order_id) return "/assistance/commande/" + encodeURIComponent(row.order_id);
  if (row.kind === "stripe_dispute") return "/admin/operations";
  return "/admin/paiements-vendeurs";
}
export type MarketMetrics = {
  days: number; orders: number; paid: number; pending: number; repeat_buyers: number; buyers: number;
  first_sale_median_hours: number | null;
  markets: { category: string; zone: string; products: number; sellers: number; paid: number }[];
};
