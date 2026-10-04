import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Preserve accounting history; a failed Auth operation never proves that
 * anonymization is required. Close the storefront before scrubbing contacts.
 *
 * PIÈCES D'IDENTITÉ (2026-10-04). Un compte qui a déposé des pièces n'est
 * JAMAIS supprimé entièrement : il est anonymisé, comme un vendeur qui a
 * vendu. Supprimer le profil effaçait en cascade les lignes
 * `zabelie_kyc_documents` mais PAS les fichiers du bucket privé — orphelins,
 * hors de toute purge. Et la politique promet « 5 ans après la décision »
 * (0126) : c'est la purge planifiée qui les retire, pas la fermeture du
 * compte. `0127` interdit en base la suppression d'un profil qui a des
 * pièces, quel que soit le chemin. */
export async function DELETE() {
  const lang = await getLang();
  const unavailable = () => NextResponse.json({ error: t(lang, "api.unavailable") }, { status: 503 });
  const supabase = await createClient();
  const { data: { user }, error: identityError } = await supabase.auth.getUser();
  if (identityError || !user) return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  const admin = createAdminClient();

  const [purchases, sales, kyc] = await Promise.all([
    admin.from("orders").select("id", { count: "exact", head: true }).eq("buyer_id", user.id),
    admin.from("orders").select("id,products!inner(seller_id)", { count: "exact", head: true }).eq("products.seller_id", user.id),
    admin.from("zabelie_kyc_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  if (purchases.error || sales.error || kyc.error) return unavailable();
  if (typeof purchases.count !== "number" || typeof sales.count !== "number" || typeof kyc.count !== "number") return unavailable();
  if (purchases.count === 0 && sales.count === 0 && kyc.count === 0) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) return unavailable(); // Includes a concurrent order: retry rechecks history.
    await supabase.auth.signOut({ scope: "global" });
    return NextResponse.json({ ok: true, mode: "deleted" });
  }

  const { data: closed, error: scrubError } = await admin.from("profiles").update({
    display_name: "Compte supprimé",
    bio: null,
    avatar_url: null,
    country_code: null,
    region_code: null,
    zone_id: null,
    pwen_repe: null,
    boutik_slug: null,
    suspended_at: new Date().toISOString(),
    suspended_reason: "account_closed",
    suspended_by: null,
  }).eq("id", user.id).select("id").maybeSingle();
  if (scrubError || !closed) return unavailable();

  /* DOSSIER D'IDENTITÉ EN ATTENTE (2026-10-04). La purge des pièces compte
   * depuis la DÉCISION (`zabelie_kyc_docs_expires`) : un dossier resté
   * `pending` à la fermeture ne serait jamais décidé, donc jamais purgé. On le
   * clôt ici, motif explicite, ce qui lance le délai de conservation annoncé
   * (5 ans, 0126). Idempotent : un nouvel essai ne retrouve plus de `pending`. */
  const { error: kycError } = await admin.from("zabelie_kyc_submissions").update({
    status: "rejected",
    decided_at: new Date().toISOString(),
    decided_by: null,
    note_admin: "Compte fermé avant décision",
  }).eq("user_id", user.id).eq("status", "pending");
  if (kycError) return unavailable();

  const removals = await Promise.all([
    admin.from("zabelie_favorites").delete().eq("user_id", user.id),
    admin.from("zabelie_shop_follows").delete().eq("user_id", user.id),
  ]);
  if (removals.some(r => r.error)) return unavailable();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await admin.from("orders").select("id").eq("buyer_id", user.id).order("id").range(offset, offset + 499);
    if (error || !data) return unavailable();
    if (data.length) {
      const removed = await admin.from("zabelie_order_recipients").delete().in("order_id", data.map(o => o.id));
      if (removed.error) return unavailable();
    }
    if (data.length < 500) break;
  }

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: `deleted+${user.id}@deleted.invalid`,
    email_confirm: true,
    // Auth merges metadata: an empty object would retain the previous values.
    user_metadata: Object.fromEntries(Object.keys(user.user_metadata ?? {}).map(key => [key, null])),
    ban_duration: "876000h",
  });
  if (authError) return unavailable();
  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ok: true, mode: "anonymized" });
}
