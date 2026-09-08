import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { digitalAccessAllowed, releaseAllowed, type DigitalRelease } from "@/lib/digital-studio";

export async function getPublicDigitalRelease(productId: string) {
  if (!isSupabaseConfigured()) return null;
  const admin = createAdminClient();
  const { data: product } = await admin.from("products").select("status").eq("id", productId).maybeSingle();
  if (product?.status !== "published") return null;
  // Deliberately omit payload. No private lessons or storage paths in public props.
  const { data } = await admin.from("zabelie_digital_releases").select("id,version,title,manifest,details,created_at")
    .eq("product_id", productId).order("version", { ascending: false }).limit(1).maybeSingle();
  return data as Pick<DigitalRelease, "id" | "version" | "title" | "manifest" | "details" | "created_at"> | null;
}
export async function getDigitalAccess(orderId: string, requestedRelease?: string) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient();
  const { data: order } = await admin.from("orders").select("id,buyer_id,product_id,status").eq("id", orderId).maybeSingle();
  if (!digitalAccessAllowed(user.id, order)) return null;
  return resolveDigitalRelease(admin, orderId, requestedRelease);
}
/** Caller must have checked buyer ownership AND paid/delivered before calling. */
export async function resolveDigitalRelease(admin: ReturnType<typeof createAdminClient>, orderId: string, requestedRelease?: string) {
  const { data: entitlement } = await admin.from("zabelie_digital_entitlements").select("release_id").eq("order_id", orderId).maybeSingle();
  if (!entitlement) return null;
  const { data: originalData } = await admin.from("zabelie_digital_releases").select("*").eq("id", entitlement.release_id).maybeSingle();
  if (!originalData) return null;
  const original = originalData as DigitalRelease;
  let release = original;
  if (requestedRelease && requestedRelease !== original.id) {
    const { data } = await admin.from("zabelie_digital_releases").select("*").eq("id", requestedRelease).maybeSingle();
    if (!data || !releaseAllowed(original, data as DigitalRelease)) return null;
    release = data as DigitalRelease;
  }
  return { original, release };
}
