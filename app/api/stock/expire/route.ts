import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Expiration des réservations de stock (chantier B, 0036).
 * Une réservation dont le paiement n'a pas abouti dans le TTL configuré
 * (30 min par défaut) est relibérée : l'unité redevient vendable.
 *
 * Sans ce cron, un panier abandonné immobiliserait le stock indéfiniment —
 * sur un catalogue de pièces détachées où le vendeur n'a souvent qu'une ou
 * deux unités, c'est du chiffre d'affaires perdu en silence.
 *
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
 * à libérer.
 *
 * Sans ligne systématique, « le cron n'a pas tourné » (secret absent, cron non
 * déclaré, déploiement cassé) et « il a tourné, rien à libérer » produisent le
 * même journal : rien. Vérifier `CRON_SECRET` une fois à la main ne protège
 * pas dans six semaines ; un signal régulier, si. Même principe que le défaut
 * observable de `lib/product-kind.ts` : l'absence de signal doit être un
 * signal.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[stock/expire]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function handle(req: Request) {
  const debut = Date.now();
  if (!authorize(req)) {
    // Journalisé aussi : un cron mal configuré se voit ici, pas dans le silence.
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_expire_stock_reservations");
    if (error) {
      journal({ issue: "echec", message: error.message, dureeMs: Date.now() - debut });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const released = data ?? 0;
    journal({ issue: "termine", liberees: released, dureeMs: Date.now() - debut });
    return NextResponse.json({ released });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "exception", message, dureeMs: Date.now() - debut });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
