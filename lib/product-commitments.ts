export type ProductCommitment = {
  product_id: string; zones: string; pickup: string; delivery_days: number | null;
  fees: "included" | "quote"; next_available: string | null; availability_confirmed_at: string | null;
};
export type CommitmentInput = Omit<ProductCommitment, "product_id" | "availability_confirmed_at"> & { confirmAvailability: boolean };

export function parseCommitment(value: unknown, now = Date.now()): CommitmentInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  if (typeof p.zones !== "string" || p.zones.trim().length > 300 ||
      typeof p.pickup !== "string" || p.pickup.trim().length > 180 ||
      (p.fees !== "included" && p.fees !== "quote") || typeof p.confirmAvailability !== "boolean") return null;
  if (p.delivery_days !== null && (!Number.isInteger(p.delivery_days) || Number(p.delivery_days) < 0 || Number(p.delivery_days) > 365)) return null;
  if (p.next_available !== null) {
    if (typeof p.next_available !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.next_available)) return null;
    const date = Date.parse(p.next_available + "T23:59:59Z");
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0, 10) !== p.next_available || !nextAvailabilityIsCurrent(p.next_available, now) || date > now + 366 * 86400_000) return null;
  }
  return { zones: p.zones.trim(), pickup: p.pickup.trim(), fees: p.fees,
    delivery_days: p.delivery_days as number | null, next_available: p.next_available as string | null,
    confirmAvailability: p.confirmAvailability };
}

export function availabilityNeedsReview(at: string | null, now = Date.now()): boolean {
  const timestamp = at ? Date.parse(at) : NaN;
  return !Number.isFinite(timestamp) || timestamp > now || now - timestamp > 7 * 86400_000;
}

/** Dates are local to the Haitian market, including the hours after UTC midnight. */
export function nextAvailabilityIsCurrent(date: string, now = Date.now()): boolean {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return date >= today;
}
