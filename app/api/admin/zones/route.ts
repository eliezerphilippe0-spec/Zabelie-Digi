import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { slugifierZone } from "@/lib/zones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/zones — les trois actes d'administration des zones
 * (PR-Z4, `docs/33` §4). Chaque acte est journalisé dans
 * `zabelie_admin_actions` (0055) — c'est la vérif de la spec.
 *
 *   { action: "create_zone", level, parentId?, code?, slug, labelKr, labelFr }
 *   { action: "set_active",  zoneId, active }
 *   { action: "decide",      requestId, decision: "accept"|"reject", note? }
 *
 * Les gardes de fond vivent en BASE et valent aussi pour service-role :
 * hiérarchie ZB069 (0069), décision unique et contenu intouchable ZB070
 * (0070), slug unique par parent. On traduit leurs refus, on ne les
 * réimplémente pas.
 */

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let body: {
    action?: string;
    level?: string;
    parentId?: string;
    code?: string;
    slug?: string;
    labelKr?: string;
    labelFr?: string;
    zoneId?: string;
    active?: boolean;
    requestId?: string;
    decision?: string;
    note?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── create_zone ───────────────────────────────────────────────────────────
  if (body.action === "create_zone") {
    const { level, parentId, code, slug, labelKr, labelFr } = body;
    if (!level || !slug || !labelKr?.trim() || !labelFr?.trim()) {
      return NextResponse.json(
        { error: "level, slug, labelKr et labelFr requis" },
        { status: 400 },
      );
    }
    const { data, error } = await admin
      .from("zabelie_zones")
      .insert({
        level,
        parent_id: parentId || null,
        code: code || null,
        slug,
        label_kr: labelKr.trim(),
        label_fr: labelFr.trim(),
      })
      .select("id")
      .single();
    if (error) {
      const status = error.message.includes("ZB069") || error.code === "23505" ? 400 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: "zone.create",
      targetType: "zabelie_zones",
      targetId: data.id,
      metadata: { level, slug, parentId: parentId ?? null },
    });
    return NextResponse.json({ ok: true, id: data.id });
  }

  // ── set_active ────────────────────────────────────────────────────────────
  if (body.action === "set_active") {
    if (!body.zoneId || typeof body.active !== "boolean") {
      return NextResponse.json({ error: "zoneId et active requis" }, { status: 400 });
    }
    const { error } = await admin
      .from("zabelie_zones")
      .update({ is_active: body.active })
      .eq("id", body.zoneId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: body.active ? "zone.activate" : "zone.deactivate",
      targetType: "zabelie_zones",
      targetId: body.zoneId,
    });
    return NextResponse.json({ ok: true });
  }

  // ── decide ────────────────────────────────────────────────────────────────
  if (body.action === "decide") {
    const { requestId, decision } = body;
    if (!requestId || (decision !== "accept" && decision !== "reject")) {
      return NextResponse.json(
        { error: "requestId et decision ('accept' | 'reject') requis" },
        { status: 400 },
      );
    }
    const { data: demande, error: dErr } = await admin
      .from("zabelie_zone_requests")
      .select("id, komin_id, nom_propose, status")
      .eq("id", requestId)
      .maybeSingle();
    if (dErr || !demande) {
      return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
    }

    let zoneCreee: string | null = null;
    if (decision === "accept") {
      // Le katye naît D'ABORD — si sa création échoue (slug en conflit,
      // hiérarchie), la demande reste en attente : jamais une acceptation
      // sans zone derrière.
      const { data: katye, error: kErr } = await admin
        .from("zabelie_zones")
        .insert({
          level: "katye",
          parent_id: demande.komin_id,
          slug: slugifierZone(demande.nom_propose),
          label_kr: demande.nom_propose,
          label_fr: demande.nom_propose,
        })
        .select("id")
        .single();
      if (kErr) {
        const status = kErr.code === "23505" || kErr.message.includes("ZB069") ? 409 : 500;
        return NextResponse.json({ error: kErr.message }, { status });
      }
      zoneCreee = katye.id;
    }

    const { error: uErr } = await admin
      .from("zabelie_zone_requests")
      .update({
        status: decision === "accept" ? "accepted" : "rejected",
        note_admin: body.note?.trim() || null,
        zone_creee: zoneCreee,
      })
      .eq("id", requestId);
    if (uErr) {
      // ZB070 = déjà décidée entre-temps. Si un katye venait de naître pour
      // rien, on le dit — l'admin le voit et tranche, on n'efface pas en
      // silence une zone potentiellement déjà référencée.
      const status = uErr.message.includes("ZB070") ? 409 : 500;
      return NextResponse.json(
        { error: uErr.message, zoneCreee },
        { status },
      );
    }
    await journaliserActeAdmin(admin, {
      actorId: me.id,
      action: decision === "accept" ? "zone.request.accept" : "zone.request.reject",
      targetType: "zabelie_zone_requests",
      targetId: requestId,
      reason: body.note?.trim() || undefined,
      metadata: { zoneCreee, nom: demande.nom_propose },
    });
    return NextResponse.json({ ok: true, zoneCreee });
  }

  return NextResponse.json({ error: "action inconnue" }, { status: 400 });
}
