import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/user-status  { userId, action: 'suspend' | 'reactivate', reason? }
 * Suspension RÉVERSIBLE d'un compte (modération). Réservé au rôle admin.
 *
 * ⚠️ Cadre BRH : cette route ne fait AUCUNE opération monétaire. Le wallet et
 * l'escrow du vendeur restent intacts (la maturation J+7 suit son cours) — on
 * ne gèle jamais un solde dû. La remédiation financière d'une fraude passe par
 * /api/admin/refund (moyen d'origine + checkpoint humain), commande par commande.
 *
 * Effets : marqueur traçable sur le profil (qui/quand/pourquoi), ban auth
 * réversible (bloque la connexion), produits masqués du catalogue (policy RLS
 * 0017 — réapparaissent seuls à la réactivation).
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: { userId?: string; action?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  const { userId, action } = body;
  if (!userId || (action !== "suspend" && action !== "reactivate")) {
    return erreurTraduite("api.params.invalid", 400);
  }
  if (userId === me.id) {
    return erreurTraduite("api.selfsuspend", 400);
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, role, suspended_at")
    .eq("id", userId)
    .maybeSingle();
  if (!target) {
    return erreurTraduite("api.account.notfound", 404);
  }
  if (target.role === "admin") {
    return erreurTraduite("api.admin.protected", 400);
  }

  if (action === "suspend") {
    const reason = body.reason?.trim();
    if (!reason) {
      // Motif obligatoire : traçabilité de modération (équité, litiges, appels).
      return erreurTraduite("api.reason.required", 400);
    }

    const { error: updErr } = await admin
      .from("profiles")
      .update({
        suspended_at: new Date().toISOString(),
        suspended_reason: reason,
        suspended_by: me.id,
      })
      .eq("id", userId);
    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    // Ban auth RÉVERSIBLE (≈100 ans, levé à la réactivation).
    const { error: banErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: "876000h",
    });
    if (banErr) {
      return NextResponse.json(
        { error: `Profil suspendu mais ban auth échoué : ${banErr.message}` },
        { status: 500 }
      );
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: "user.suspend",
      targetType: "user",
      targetId: userId,
      reason,
    });
    return NextResponse.json({ ok: true, status: "suspended" });
  }

  // Réactivation : on efface le marqueur (les produits réapparaissent via la
  // policy) et on lève le ban. La raison historique vit dans les logs d'audit.
  const { error: updErr } = await admin
    .from("profiles")
    .update({ suspended_at: null, suspended_reason: null, suspended_by: null })
    .eq("id", userId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  const { error: unbanErr } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanErr) {
    return NextResponse.json(
      { error: `Profil réactivé mais levée du ban échouée : ${unbanErr.message}` },
      { status: 500 }
    );
  }
  await journaliserActeAdmin(admin, {
    actorId: me.id,
    action: "user.restore",
    targetType: "user",
    targetId: userId,
  });
  return NextResponse.json({ ok: true, status: "active" });
}
