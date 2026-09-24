import { catalogueUniverse } from "@/lib/catalogue-universes";

export const CATALOGUE_SORTS = ["recent", "prix-croissant", "prix-decroissant", "ventes"] as const;
export type CatalogueSort = (typeof CATALOGUE_SORTS)[number];
export type CatalogueSearch = Partial<Record<"univers" | "q" | "cat" | "sous" | "page" | "zd" | "zk" | "zq" | "min" | "max" | "tri", string | string[]>>;
const scalar = (value: string | string[] | undefined) => typeof value === "string" ? value.trim() : undefined;
const amount = (value: string | undefined) => value && /^\d{1,10}$/.test(value) && Number(value) <= 2_147_483_647 ? Number(value) : undefined;

/** Whitelist at the URL boundary; arrays and partial numbers never become filters. */
export function parseCatalogueSearch(raw: CatalogueSearch) {
  const univers = catalogueUniverse(scalar(raw.univers));
  const pageRaw = scalar(raw.page);
  const page = pageRaw && /^\d{1,6}$/.test(pageRaw) ? Math.max(1, Number(pageRaw)) : 1;
  const sortRaw = scalar(raw.tri);
  const sort: CatalogueSort = CATALOGUE_SORTS.find((value) => value === sortRaw) ?? "recent";
  const minPrice = amount(scalar(raw.min));
  const maxPrice = amount(scalar(raw.max));
  return {
    univers, page, sort, minPrice, maxPrice,
    q: scalar(raw.q)?.slice(0, 160) || undefined,
    cat: scalar(raw.cat)?.slice(0, 160) || undefined,
    sous: scalar(raw.sous)?.slice(0, 160) || undefined,
    // Downloadable files have no handover zone, including through a forged URL.
    zd: univers === "numerique" ? undefined : scalar(raw.zd),
    zk: univers === "numerique" ? undefined : scalar(raw.zk),
    zq: univers === "numerique" ? undefined : scalar(raw.zq),
    priceRangeInvalid: minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice,
  };
}

export function catalogueCanonical(raw: CatalogueSearch) {
  const f = parseCatalogueSearch(raw);
  const params = new URLSearchParams();
  if (f.univers) params.set("univers", f.univers);
  if (f.cat && f.cat !== "Tout") params.set("cat", f.cat);
  if (f.sous) params.set("sous", f.sous);
  if (f.page > 1) params.set("page", String(f.page));
  return `/catalogue${params.size ? `?${params}` : ""}`;
}

export function catalogueIsWorkingView(raw: CatalogueSearch) {
  const f = parseCatalogueSearch(raw);
  return Boolean(f.q || f.zd || f.zk || f.zq || raw.min !== undefined || raw.max !== undefined || f.sort !== "recent");
}

/** Shared GET navigation. A null patch explicitly clears a filter. */
export function catalogueHref(raw: CatalogueSearch, patch: Partial<Record<keyof CatalogueSearch, string | number | null>> = {}): string {
  const merged: CatalogueSearch = { ...raw };
  for (const [key, value] of Object.entries(patch)) {
    const name = key as keyof CatalogueSearch;
    if (value === null) delete merged[name];
    else if (value !== undefined) merged[name] = String(value);
  }
  const f = parseCatalogueSearch(merged);
  const params = new URLSearchParams();
  if (f.univers) params.set("univers", f.univers);
  if (f.q) params.set("q", f.q);
  if (f.cat && f.cat !== "Tout") params.set("cat", f.cat);
  if (f.sous) params.set("sous", f.sous);
  if (f.zd) params.set("zd", f.zd);
  if (f.zk) params.set("zk", f.zk);
  if (f.zq) params.set("zq", f.zq);
  if (f.minPrice !== undefined) params.set("min", String(f.minPrice));
  if (f.maxPrice !== undefined) params.set("max", String(f.maxPrice));
  if (f.sort !== "recent") params.set("tri", f.sort);
  if (f.page > 1) params.set("page", String(f.page));
  return params.size ? "/catalogue?" + params.toString() : "/catalogue";
}
