import type { I18nKey } from "@/lib/i18n";
import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, type ProductKind } from "@/lib/product-kind";

export const PURCHASE_PAGE_SIZE = 20;
export const PURCHASE_VIEWS = ["tout", "numerique", "objets", "prestations"] as const;
export type PurchaseView = typeof PURCHASE_VIEWS[number];
export function purchaseView(value: unknown): PurchaseView {
  return PURCHASE_VIEWS.find((v) => v === value) ?? "tout";
}
export function purchaseKind(view: PurchaseView): ProductKind | null {
  return ({ tout: null, numerique: KIND_FILE, objets: KIND_PHYSICAL, prestations: KIND_SERVICE } as const)[view];
}
export function purchasePage(value: unknown): number {
  return typeof value === "string" && /^[1-9]\d{0,4}$/.test(value) ? Number(value) : 1;
}
export function purchaseHref(view: PurchaseView, page = 1): string {
  const params = new URLSearchParams();
  if (view !== "tout") params.set("vue", view);
  if (page > 1) params.set("page", String(page));
  return `/mes-achats${params.size ? `?${params}` : ""}`;
}
/** Mirrors download/review server guards; unknown states never unlock actions. */
export function purchaseIsConfirmed(status: string): boolean {
  return status === "paid" || status === "delivered";
}
export function purchaseStatusKey(status: string): I18nKey {
  switch (status) {
    case "pending": return "purchases.status.pending";
    case "paid": return "purchases.status.paid";
    case "delivered": return "purchases.status.delivered";
    case "cancelled": return "purchases.status.cancelled";
    case "refunded": return "purchases.status.refunded";
    case "disputed": return "purchases.status.disputed";
    default: return "purchases.status.unknown";
  }
}
export const purchaseViewKeys: Record<PurchaseView, I18nKey> = {
  tout: "purchases.view.all", numerique: "purchases.view.digital",
  objets: "purchases.view.physical", prestations: "purchases.view.services",
};
