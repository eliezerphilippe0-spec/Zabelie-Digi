import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { isMissingTable } from "@/lib/product-media";
import { KYC_BUCKET } from "@/lib/kyc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Une URL signée vit 5 minutes : le temps de regarder, pas de partager. */
const SIGNATURE_SECONDES = 300;

/**
 * Revue KYC — réservée aux admins (docs/35 V-6).
 *   GET                            → dossiers en attente + URLs SIGNÉES
 *   POST { userId, action, note? } → 'approve' | 'reject'
 *
 * Les images ne sont jamais publiques : le bucket n'a aucune policy, et
 * l'admin obtient une URL signée à courte durée, à chaque consultation.
 * Chaque décision est journalisée dans `zabelie_admin_actions` (0055) — sur
 * un dossier d'identité, savoir QUI a décidé est le minimum.
 */
export async function GET() {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: subs, error } = await admin
    .from("zabelie_kyc_submissions")
    .select("user_id, status, submitted_at")
    .eq("status", "pending")
    .order("submitted_at");
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "Vérification non activée (0079 à appliquer).", dossiers: [] },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Lecture échouée" }, { status: 500 });
  }

  const dossiers = [];
  for (const s of subs ?? []) {
    const { data: docs } = await admin
      .from("zabelie_kyc_documents")
      .select("id, kind, storage_path")
      .eq("user_id", s.user_id)
      .order("created_at");
    const pieces = [];
    for (const d of docs ?? []) {
      const { data: signee } = await admin.storage
        .from(KYC_BUCKET)
        .createSignedUrl(d.storage_path, SIGNATURE_SECONDES);
      pieces.push({ id: d.id, kind: d.kind, url: signee?.signedUrl ?? null });
    }
    const { data: prof } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", s.user_id)
      .maybeSingle();
    dossiers.push({
      userId: s.user_id,
      nom: prof?.display_name ?? null,
      soumisLe: s.submitted_at,
      pieces,
    });
  }
  return NextResponse.json({ ok: true, dossiers });
}

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { userId?: string; action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const action = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : null;
  if (!body.userId || !action) {
    return NextResponse.json({ error: "userId et action requis" }, { status: 400 });
  }
  const note =
    typeof body.note === "string" && body.note.trim()
      ? body.note.trim().slice(0, 500)
      : null;
  // Un refus sans motif laisse le vendeur sans rien à corriger.
  if (action === "rejected" && !note) {
    return NextResponse.json(
      { error: "Motif de refus obligatoire — le vendeur doit savoir quoi corriger." },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("zabelie_kyc_submissions")
    .update({
      status: action,
      decided_at: new Date().toISOString(),
      decided_by: me.id,
      note_admin: note,
    })
    .eq("user_id", body.userId)
    .eq("status", "pending");
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: "Vérification non activée (0079 à appliquer)." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Décision refusée" }, { status: 422 });
  }

  await journaliserActeAdmin(admin, {
    actorId: me.id,
    action: action === "approved" ? "kyc.approve" : "kyc.reject",
    targetType: "profile",
    targetId: body.userId,
    reason: note ?? undefined,
  });

  return NextResponse.json({ ok: true, statut: action });
}
