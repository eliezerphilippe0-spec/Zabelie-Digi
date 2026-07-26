import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Contrôle de cohérence du registre (chantier 0, lot 0.c.1 — docs/19 §3.1).
 * Vérifie l'identité Σ(grand livre) = disponible + en attente, portefeuille par
 * portefeuille. Un écart = un solde qui a bougé hors du grand livre : à savoir
 * AVANT de régler un vendeur, pas après.
 *
 * Accès : cron Vercel (Bearer $CRON_SECRET), appel manuel (Bearer
 * $RECONCILE_SECRET), ou administrateur connecté.
 *
 * ⚠️ Purement interne : ne dit rien du solde RÉEL du compte marchand MonCash
 * (contrôle de solvabilité, docs/19 §3.2 — manuel tant qu'aucun endpoint de
 * solde n'existe côté Digicel).
 */
async function authorize(req: Request): Promise<boolean> {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  const user = await getCurrentUser();
  return user?.role === "admin";
}

async function handle(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_solvency_report");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Un écart ne doit pas passer inaperçu : trace dans les logs serveur, que
    // l'appel vienne du cron ou d'un humain. (L'alerte e-mail suppose une
    // adresse de destination à configurer — décision porteur.)
    if (data && data.ok === false) {
      console.error(
        "[coherence] ÉCART REGISTRE détecté",
        JSON.stringify({
          ecarts: data.ecarts,
          ecart_total_htg: data.ecart_total_htg,
        })
      );
    }

    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
