import { createHash } from "node:crypto";

/** A purchase attempt is separate from the payment confirmation key. */
export function validCheckoutKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Reuse orders' primary key as the database concurrency guard. The buyer
 * scope comes from the verified session, never from the request body.
 * No new order/payment table or client-controlled amount is needed.
 */
export function checkoutOrderId(buyerId: string, key: string): string {
  if (!validCheckoutKey(key)) throw new Error("Invalid checkout key");
  const hex = createHash("sha256").update(`zabelie:checkout:v1:${buyerId}:${key.toLowerCase()}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Resume only a stored, pending individual session at its operator's host. */
export function savedCheckoutRedirect(
  order: { status: string; group_id?: string | null },
  payment: { status: string; rail: string; raw: Record<string, unknown> | null } | null
): string | null {
  if (order.status !== "pending" || order.group_id || payment?.status !== "pending") return null;
  if (payment.rail === "zelle") return null;
  const raw = payment.raw?.checkout_redirect_url;
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname;
    const allowed = payment.rail === "stripe" ? host === "checkout.stripe.com"
      : payment.rail === "moncash" ? ["moncashbutton.digicelgroup.com", "sandbox.moncashbutton.digicelgroup.com"].includes(host)
      : payment.rail === "kobara" ? host === "kobara.app" || host.endsWith(".kobara.app") : false;
    return allowed ? url.href : null;
  } catch { return null; }
}
