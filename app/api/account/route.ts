import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/account
 * Droit à l'effacement (RGPD Art. 17) de l'utilisateur connecté.
 *
 * Le schéma verrouille la suppression dure d'un profil ayant des commandes
 * (orders.buyer_id ... on delete restrict) — car les données comptables doivent
 * être conservées (exemption Art. 17(3)(b)). On procède donc en deux temps :
 *   1. Tentative de suppression complète (compte sans trace financière).
 *   2. Si elle échoue → ANONYMISATION : on efface les données personnelles du
 *      profil et on verrouille le compte, en préservant l'intégrité du registre.
 */
export async function DELETE() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();

  // 1. Tentative de suppression complète (cascade profiles → products → assets).
  //    Échoue si des commandes référencent le compte (on delete restrict).
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (!delErr) {
    return NextResponse.json({ ok: true, mode: "deleted" });
  }

  // Delete the new private collections and recipient contact data as well.
  const removals = await Promise.all([
    supabase.from("zabelie_favorites").delete().eq("user_id", user.id),
    supabase.from("zabelie_shop_follows").delete().eq("user_id", user.id),
  ]);
  if (removals.some(r => r.error)) return NextResponse.json({ error: t(lang, "collections.error") }, { status: 503 });
  // Paginate order IDs; do not silently leave contacts after PostgREST's cap.
  for (let offset = 0; ; offset += 500) {
    const { data: buyerOrders, error } = await admin.from("orders").select("id").eq("buyer_id", user.id).order("id").range(offset, offset + 499);
    if (error) return NextResponse.json({ error: t(lang, "collections.error") }, { status: 503 });
    if (buyerOrders?.length) {
      const removed = await admin.from("zabelie_order_recipients").delete().in("order_id", buyerOrders.map(o => o.id));
      if (removed.error) return NextResponse.json({ error: t(lang, "collections.error") }, { status: 503 });
    }
    if (!buyerOrders || buyerOrders.length < 500) break;
  }

  // 2. Anonymisation : on scrube les données personnelles du profil et on
  //    verrouille l'accès. Le service role est exempté du trigger de protection.
  const { error: scrubErr } = await admin
    .from("profiles")
    .update({
      display_name: "Compte supprimé",
      bio: null,
      avatar_url: null,
      country_code: null,
      region_code: null,
    })
    .eq("id", user.id);
  if (scrubErr) {
    return NextResponse.json({ error: scrubErr.message }, { status: 500 });
  }

  // E-mail neutralisé (unique) + compte banni pour empêcher toute reconnexion.
  const { error: authErr } = await admin.auth.admin.updateUserById(user.id, {
    email: `deleted+${user.id}@deleted.invalid`,
    user_metadata: {},
    ban_duration: "876000h", // ~100 ans
  });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, mode: "anonymized" });
}
