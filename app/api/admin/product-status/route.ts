import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = ["draft", "published", "archived"] as const;

/**
 * POST /api/admin/product-status  { productId, status }
 * Modération : change le statut d'un produit. Réservé au rôle admin.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  let body: { productId?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const { productId, status } = body;
  if (!productId || !status || !ALLOWED.includes(status as (typeof ALLOWED)[number])) {
    return NextResponse.json(
      { error: "productId et status valide requis" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("products")
    .update({ status })
    .eq("id", productId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "product.set_status",
    targetType: "product",
    targetId: productId,
    metadata: { status },
  });
  return NextResponse.json({ ok: true, status });
}
