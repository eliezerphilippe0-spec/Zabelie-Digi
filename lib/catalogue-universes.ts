import { KIND_FILE, KIND_PHYSICAL, KIND_SERVICE, type ProductKind } from "@/lib/product-kind";
import type { I18nKey } from "@/lib/i18n";

export const CATALOGUE_UNIVERSES = {
  objets: { kind: KIND_PHYSICAL, title: "universe.physical", description: "universe.physical.body" },
  numerique: { kind: KIND_FILE, title: "universe.digital", description: "universe.digital.body" },
  services: { kind: KIND_SERVICE, title: "universe.services", description: "universe.services.body" },
} satisfies Record<string, { kind: ProductKind; title: I18nKey; description: I18nKey }>;
export type CatalogueUniverse = keyof typeof CATALOGUE_UNIVERSES;

export function catalogueUniverse(value: unknown): CatalogueUniverse | undefined {
  return typeof value === "string" && Object.hasOwn(CATALOGUE_UNIVERSES, value)
    ? value as CatalogueUniverse : undefined;
}
export function universeHref(universe: CatalogueUniverse): string {
  return `/catalogue?univers=${universe}`;
}
