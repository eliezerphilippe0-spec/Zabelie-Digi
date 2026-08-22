import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { isMissingTable } from "@/lib/product-media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Points de retrait (docs/37, migration 0082) — administration.
 *   GET  — l'inventaire complet (actifs ET fermés : l'acheteur ne voit que
 *          les actifs via RLS, l'admin voit tout via service-role).
 *   POST { action: "create", nom, adresse, telefon?, zoneId? }
 *   POST { action: "set_active", id, active }
 * Chaque acte est journalisé dans zabelie_admin_actions (0055).
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return erreurTraduite("api.access.denied", 401);
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zabelie_pickup_points")
    .select("id, nom, adresse, telefon, actif, position, created_at")
    .order("position")
    .order("created_at");
  if (error) {
    if (isMissingTable(error)) {
      console.error(
        "[admin/pickup-points] MIGRATION 0082 NON APPLIQUÉE — " +
          "zabelie_pickup_points introuvable :",
        error.code
      );
      return erreurTraduite("api.feature.off", 503, { points: [] });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, points: data ?? [] });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return erreurTraduite("api.access.denied", 401);
  }

  let body: {
    action?: string;
    nom?: string;
    adresse?: string;
    telefon?: string;
    zoneId?: string;
    id?: string;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  const admin = createAdminClient();

  if (body.action === "create") {
    if (!body.nom?.trim() || !body.adresse?.trim()) {
      return erreurTraduite("api.params.invalid", 400);
    }
    const { data, error } = await admin
      .from("zabelie_pickup_points")
      .insert({
        nom: body.nom.trim(),
        adresse: body.adresse.trim(),
        telefon: body.telefon?.trim() || null,
        zone_id: body.zoneId || null,
      })
      .select("id")
      .single();
    if (error) {
      if (isMissingTable(error)) {
        console.error(
          "[admin/pickup-points] MIGRATION 0082 NON APPLIQUÉE — " +
            "zabelie_pickup_points introuvable :",
          error.code
        );
        return erreurTraduite("api.feature.off", 503);
      }
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: "pickup.create",
      targetType: "zabelie_pickup_points",
      targetId: data.id,
      metadata: { nom: body.nom.trim() },
    });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.action === "set_active") {
    if (!body.id || typeof body.active !== "boolean") {
      return erreurTraduite("api.params.invalid", 400);
    }
    const { error } = await admin
      .from("zabelie_pickup_points")
      .update({ actif: body.active })
      .eq("id", body.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: body.active ? "pickup.open" : "pickup.close",
      targetType: "zabelie_pickup_points",
      targetId: body.id,
    });
    return NextResponse.json({ ok: true });
  }

  return erreurTraduite("api.params.invalid", 400);
}
