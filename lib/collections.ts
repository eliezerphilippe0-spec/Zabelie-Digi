export const COLLECTIONS = {
  favorites: { table: "zabelie_favorites", column: "product_id", href: "/favoris" },
  shops: { table: "zabelie_shop_follows", column: "seller_id", href: "/boutiques-suivies" },
} as const;
export type CollectionKind = keyof typeof COLLECTIONS;
export function collectionKind(value: unknown): CollectionKind | null {
  return value === "favorites" || value === "shops" ? value : null;
}
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
