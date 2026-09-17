/** Only public listing summaries are stored, never HTML, sessions or orders. */
export const OFFLINE_KEY = "zabelie:public-listings:v1";
export const OFFLINE_LIMIT = 20;
export const OFFLINE_MAX_AGE = 7 * 86400_000;
export type OfflineListing = { slug: string; title: string; priceHTG: number; viewedAt: number };

export function readOfflineListings(raw: string | null, now = Date.now()): OfflineListing[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.filter((p): p is OfflineListing => {
      if (!p || typeof p !== "object" || typeof p.slug !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,199}$/.test(p.slug) || seen.has(p.slug) ||
        typeof p.title !== "string" || !p.title.trim() || p.title.length > 200 ||
        !Number.isSafeInteger(p.priceHTG) || p.priceHTG < 0 ||
        !Number.isSafeInteger(p.viewedAt) || p.viewedAt > now || now - p.viewedAt > OFFLINE_MAX_AGE) return false;
      seen.add(p.slug);
      return true;
    }).slice(0, OFFLINE_LIMIT).map(({ slug, title, priceHTG, viewedAt }) => ({ slug, title, priceHTG, viewedAt }));
  } catch { return []; }
}

export function rememberListing(raw: string | null, listing: Omit<OfflineListing, "viewedAt">, now = Date.now()): OfflineListing[] {
  return readOfflineListings(JSON.stringify([{ ...listing, viewedAt: now },
    ...readOfflineListings(raw, now).filter(p => p.slug !== listing.slug)]), now);
}
