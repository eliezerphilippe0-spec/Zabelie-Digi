export type OperationKind = "payment_pending" | "payment_review" | "handover" | "support" | "refund" | "payout";
export type Operation = { kind: OperationKind; id: string; order_id: string | null; reference: string | null; amount_htg: number; rail: string | null; since: string };
export const operationLabels: Record<OperationKind, string> = {
  payment_pending: "Paiement à vérifier", payment_review: "Paiement reçu, commande à examiner",
  handover: "Remise à traiter", support: "Dossier client", refund: "Retour des fonds à justifier", payout: "Versement vendeur en attente",
};
export function operationHref(row: Operation): string {
  if (row.order_id) return "/assistance/commande/" + encodeURIComponent(row.order_id);
  return "/admin/paiements-vendeurs";
}
export type MarketMetrics = {
  days: number; orders: number; paid: number; pending: number; repeat_buyers: number; buyers: number;
  first_sale_median_hours: number | null;
  markets: { category: string; zone: string; products: number; sellers: number; paid: number }[];
};
