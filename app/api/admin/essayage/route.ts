import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getAdminUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { lireAction } from "@/lib/essayage/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/essayage
 *   { action: "ajouter" | "retirer", vendeur }               un vendeur pilote
 *   { action: "regler", plafond, quota, pause }              les réglages du pilote
 *
 * Essayage virtuel (docs/74 §2.7, tâche 5.1). Réservé au rôle admin avec double
 * authentification (`getAdminUser`). Chaque acte va au journal d'audit.
 * Retirer un vendeur ferme ses fiches au rendu suivant : la base ne les dit
 * plus éligibles (`zabelie_essayage_eligible`).
 */
export async function POST(req: Request) {
  const me = await getAdminUser();
  if (!me || me.role !== "admin") return erreurTraduite("api.access.denied", 403);

  let corps: unknown;
  try {
    corps = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }
  const acte = lireAction(corps);
  if (!acte) return erreurTraduite("api.params.invalid", 400);

  const admin = createAdminClient();
  const maintenant = new Date().toISOString();

  if (acte.action === "regler") {
    const { error } = await admin
      .from("zabelie_essayage_config")
      .update({ plafond_mois: acte.plafond, quota_jour: acte.quota, en_pause: acte.pause, modifie_le: maintenant })
      .eq("id", true);
    if (error) return erreurTraduite("api.write.failed", 503);
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: "essayage.reglages_modifier",
      targetType: "essayage",
      metadata: { plafond: acte.plafond, quota: acte.quota, pause: acte.pause },
    });
    return NextResponse.json({ ok: true });
  }

  if (acte.action === "ajouter") {
    const { data: profil, error: lecture } = await admin.from("profiles").select("id, role").eq("id", acte.vendeur).maybeSingle();
    if (lecture) return erreurTraduite("api.read.failed", 503);
    if (!profil || profil.role !== "creator") return erreurTraduite("api.account.notfound", 404);
    const { error } = await admin
      .from("zabelie_essayage_vendeurs")
      .upsert({ seller_id: acte.vendeur, actif: true, active_par: me.id, active_le: maintenant }, { onConflict: "seller_id" });
    if (error) return erreurTraduite("api.write.failed", 503);
    await journaliserActeAdmin(admin, { actorId: me.id, action: "essayage.vendeur_ajouter", targetType: "user", targetId: acte.vendeur });
    return NextResponse.json({ ok: true });
  }

  const { data: retire, error } = await admin
    .from("zabelie_essayage_vendeurs")
    .update({ actif: false })
    .eq("seller_id", acte.vendeur)
    .eq("actif", true)
    .select("seller_id");
  if (error) return erreurTraduite("api.write.failed", 503);
  if (!retire?.length) return erreurTraduite("api.account.notfound", 404);
  await journaliserActeAdmin(admin, { actorId: me.id, action: "essayage.vendeur_retirer", targetType: "user", targetId: acte.vendeur });
  return NextResponse.json({ ok: true });
}
