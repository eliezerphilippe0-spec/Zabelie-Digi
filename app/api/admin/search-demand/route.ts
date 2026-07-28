import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { messageSourcing, type TermeDemande } from "@/lib/search-demand";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/search-demand?jours=7
 *
 * Ce que les gens ont cherché et qu'on n'avait pas — avec, pour chaque terme,
 * un message prêt à coller dans WhatsApp.
 *
 * C'est le livrable du lot S. Pas un tableau de bord : une liste de messages.
 * Un CSV finit dans un dossier ; un message part. La sortie est en Kreyòl par
 * défaut, parce que c'est la langue dans laquelle on recrute un commerçant.
 *
 * Accès : cron Vercel (Bearer $CRON_SECRET), appel manuel (Bearer
 * $RECONCILE_SECRET), ou administrateur connecté — même porte que le contrôle
 * de cohérence.
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

export async function GET(req: Request) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const url = new URL(req.url);
  const jours = Math.min(90, Math.max(1, Number(url.searchParams.get("jours") ?? 7)));
  const lang = url.searchParams.get("lang") === "fr" ? "fr" : "ht";

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_search_demand", { p_days: jours });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const termes = (data ?? []) as TermeDemande[];

    // Journalisé même à zéro : sinon « le capteur n'a pas tourné » et « il a
    // tourné, personne n'a rien cherché » produisent le même vide.
    console.info(
      `[sourcing] ${termes.length} terme(s) non satisfait(s) sur ${jours} jour(s)`
    );

    return NextResponse.json({
      jours,
      total: termes.length,
      // Rappel de lecture pour qui ouvre cette sortie sans contexte : un
      // terme absent n'est pas forcément inexistant — il peut être sous le
      // seuil de sessions distinctes, qui écarte les robots et les vendeurs
      // qui testent leur propre fiche.
      note:
        "Seuls les termes atteignant le seuil de sessions distinctes " +
        "(zabelie_search_config.min_sessions) apparaissent.",
      termes: termes.map((t) => ({
        ...t,
        message: messageSourcing(t, { jours, lang }),
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}
