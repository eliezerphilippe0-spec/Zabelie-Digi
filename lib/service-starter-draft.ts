import { KIND_SERVICE } from "./product-kind";
import type { ServiceStarter } from "./service-starters";

/** A different scope needs a fresh price and deadline from the seller. */
export function serviceStarterDraft(starter: ServiceStarter) {
  return { title: starter.title, kind: KIND_SERVICE, category: starter.category,
    categoryId: starter.categoryId, description: starter.description,
    serviceIncludes: starter.includes.join("\n"), priceHTG: "", deliveryDays: "" } as const;
}
