import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Job d'expiration des points (Règle 4, docs/CASHBACK-GARDE-FOUS.md) : marque
 * les lots échus (FIFO) et débite le solde via le ledger, puis expire les
 * coupons de récompense périmés (cosmétique). Prérequis ABSOLU au premier
 * point attribué : sans ce cron, rien n'expire réellement.
 *   - GET  → cron Vercel (Authorization: Bearer $CRON_SECRET)
 *   - POST → appel manuel (Authorization: Bearer $RECONCILE_SECRET)
 */
function authorize(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  return false;
}

async function handle(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data: batches, error } = await admin.rpc("expire_points_batch_job");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Best-effort : l'échec de l'expiration des coupons ne doit pas masquer
    // celle des points (elle sera reprise au prochain tick).
    const { data: coupons } = await admin.rpc("expire_coupons_job");
    return NextResponse.json({
      expiredBatches: batches ?? 0,
      expiredCoupons: coupons ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
