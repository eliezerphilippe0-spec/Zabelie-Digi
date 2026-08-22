import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureActive, messageSourcing, type TermeDemande } from "@/lib/search-demand";

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
    return erreurTraduite("api.access.denied", 401);
  }

  const url = new URL(req.url);
  const jours = Math.min(90, Math.max(1, Number(url.searchParams.get("jours") ?? 7)));
  const lang = url.searchParams.get("lang") === "fr" ? "fr" : "ht";

  // Les deux molettes. Au démarrage, presque aucun terme n'atteint 3 sessions
  // distinctes en 7 jours : sans elles, la sortie serait vide pendant des mois
  // et on croirait le capteur muet alors qu'il n'aurait fait que filtrer.
  // `?jours=30&min_sessions=1` est le mode d'observation des premiers temps.
  const brut = url.searchParams.get("min_sessions");
  const minSessions = brut === null ? null : Math.max(1, Number(brut) || 1);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_search_demand", {
      p_days: jours,
      p_min_sessions: minSessions,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const termes = (data ?? []) as TermeDemande[];

    // Journalisé même à zéro : sinon « le capteur n'a pas tourné » et « il a
    // tourné, personne n'a rien cherché » produisent le même vide.
    console.info(
      `[sourcing] ${termes.length} terme(s) non satisfait(s) sur ${jours} jour(s)` +
        (minSessions === null ? "" : ` — seuil forcé à ${minSessions}`)
    );

    const collecte = captureActive();
    if (!collecte) {
      console.warn(
        "[sourcing] collecte DÉSACTIVÉE (poivre absent) — une liste vide ne " +
          "veut donc rien dire sur la demande réelle"
      );
    }

    return NextResponse.json({
      jours,
      total: termes.length,
      // Sans ce champ, un journal vide se lit comme « personne ne cherche »
      // alors qu'il peut vouloir dire « on n'enregistre rien ». Les deux se
      // ressemblent trait pour trait, et un seul appelle une action.
      collecte: collecte ? "active" : "désactivée (SEARCH_FINGERPRINT_SALT absente)",
      // Le mode est ÉTIQUETÉ : une liste ouverte à 1 session mélange la
      // demande réelle avec les robots et le vendeur qui teste sa fiche.
      // Lire l'une pour l'autre, c'est aller démarcher un commerçant sur un
      // fantôme.
      filtre: minSessions === null ? "seuil de config" : `seuil forcé à ${minSessions}`,
      fiable: minSessions === null || minSessions >= 3,
      note:
        minSessions === null
          ? "Seuls les termes atteignant le seuil de sessions distinctes " +
            "(zabelie_search_config.min_sessions) apparaissent."
          : "MODE OUVERT — seuil abaissé : cette liste contient probablement " +
            "des robots et des vendeurs testant leur propre fiche. À lire " +
            "comme un signal faible, pas comme de la demande confirmée.",
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
