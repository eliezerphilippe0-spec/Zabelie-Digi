import type { DigitalDetails } from "@/lib/digital-details";
import { isDownloadable, isService, type ProductKind } from "@/lib/product-kind";
import type { I18nKey } from "@/lib/i18n";

export type ReadinessProduct = {
  digitalDetails?: DigitalDetails;
  kind: ProductKind; description: string | null; cover_url: string | null;
  product_assets: { id: string }[] | null; delivery_days: number | null;
  service_includes: string[] | null;
};
/** Presence checks only, never an approval, identity check or quality score. */
export function sellerReadiness(product: ReadinessProduct, hasGalleryImage: boolean) {
  const checks: { key: I18nKey; complete: boolean }[] = [
    { key: "seller.ready.description", complete: Boolean(product.description?.trim()) },
    { key: "seller.ready.photo", complete: Boolean(product.cover_url?.trim()) || hasGalleryImage },
  ];
  if (isDownloadable(product.kind)) {
    checks.push({ key: "seller.ready.asset", complete: Boolean(product.product_assets?.length) });
    checks.push({ key: "digital.ready", complete: Boolean(product.digitalDetails?.contents && product.digitalDetails?.formats && product.digitalDetails?.compatibility && product.digitalDetails?.license) });
  }
  if (isService(product.kind)) {
    checks.push({ key: "seller.ready.delay", complete: typeof product.delivery_days === "number" && Number.isInteger(product.delivery_days) && product.delivery_days >= 0 });
    checks.push({ key: "seller.ready.includes", complete: Boolean(product.service_includes?.some((s) => s.trim())) });
  }
  return checks;
}
