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

/**
 * Journal d'exécution — émis à CHAQUE passage, y compris quand il n'y a rien
 * à faire.
 *
 * ⚠️ AJOUTÉ LE 2026-08-20, ET LE POURQUOI COMPTE. Relevé du tableau de bord :
 * les huit crons sont bien enregistrés et actifs, mais leur EXÉCUTION est
 * inobservable — la rétention Hobby efface les journaux avant qu'on puisse
 * les relire, et cette route-ci n'émettait **rien du tout**. Réussite, passage
 * à vide et échec produisaient le même silence.
 *
 * Les trois routes muettes étaient les trois qui touchent à l'argent :
 * réconciliation des paiements, maturation des soldes, expiration des points.
 * `CLAUDE.md` pose pourtant la règle : « un cron journalise chaque passage, y
 * compris à zéro. Sinon "n'a pas tourné" et "a tourné, rien trouvé"
 * produisent le même vide. »
 *
 * `secretConfigure` sur le refus est délibéré : il distingue « quelqu'un a
 * frappé sans jeton » de « CRON_SECRET n'est pas posée », qui se ressemblent
 * dans un 401 et n'appellent pas le même geste.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[points/expire]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function handle(req: Request) {
  const debut = Date.now();
  if (!authorize(req)) {
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data: batches, error } = await admin.rpc("expire_points_batch_job");
    if (error) {
      journal({ issue: "echec", message: error.message, dureeMs: Date.now() - debut });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    // Best-effort : l'échec de l'expiration des coupons ne doit pas masquer
    // celle des points (elle sera reprise au prochain tick).
    const { data: coupons } = await admin.rpc("expire_coupons_job");
    journal({ issue: "termine", lots: batches ?? 0, coupons: coupons ?? 0, dureeMs: Date.now() - debut });
    return NextResponse.json({
      expiredBatches: batches ?? 0,
      expiredCoupons: coupons ?? 0,
    });
  } catch (e) {
    journal({ issue: "exception", message: e instanceof Error ? e.message : "Erreur", dureeMs: Date.now() - debut });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
