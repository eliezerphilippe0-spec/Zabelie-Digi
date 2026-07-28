import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { evaluerArrondi } from "@/lib/rounding-probe";

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

    // Sonde d'arrondi : la constante `ROUNDING_IN_FORCE` s'accorde-t-elle avec
    // ce que le journal des migrations dit avoir été appliqué ? Elle ne touche
    // pas au verdict du registre — un désaccord d'annonce n'est pas un écart
    // comptable — mais elle ne doit pas non plus passer sous silence.
    const { data: journal, error: erreurJournal } = await admin
      .from("zabelie_schema_migrations")
      .select("filename");
    const arrondi = evaluerArrondi({
      lignes: (journal as { filename: string }[] | null) ?? null,
      erreur: erreurJournal,
    });
    if (arrondi.statut === "desaccord") {
      console.error("[coherence] ARRONDI — annonce et base divergent", arrondi.message);
    } else if (arrondi.statut === "indetermine") {
      // Journalisé même quand il n'y a rien à dire : sinon « la sonde n'a pas
      // tourné » et « la sonde n'a rien trouvé » produisent le même vide.
      console.warn("[coherence] ARRONDI — indéterminé :", arrondi.raison);
    }

    // Intégrité des index d'expression du capteur de demande (0047).
    //
    // Ce contrôle ne peut PAS être utile en CI : la base de test a un index
    // fraîchement construit et une fonction fraîchement définie, ils
    // s'accorderont toujours. La dérive qu'il existe pour attraper ne naît
    // qu'ici — quand une migration remplace `zabelie_search_normalize` sans
    // réindexer. Non branché sur la vraie base, il ne serait qu'un détecteur
    // de fumée posé dans un tiroir, dont la seule fonction serait de rassurer.
    let indexRecherche: { ok: boolean; detail: string } | { statut: string } = {
      statut: "indéterminé",
    };
    const { data: integrite, error: erreurIntegrite } = await admin.rpc(
      "zabelie_search_index_integrity"
    );
    if (erreurIntegrite) {
      // `0047` pas encore appliquée : la fonction n'existe pas. Ce n'est pas
      // une panne, mais ça ne doit pas passer pour un contrôle réussi.
      indexRecherche = { statut: `indéterminé — ${erreurIntegrite.message}` };
      console.warn("[coherence] INDEX RECHERCHE — indéterminé :", erreurIntegrite.message);
    } else {
      const ligne = (Array.isArray(integrite) ? integrite[0] : integrite) as
        | { ok: boolean; detail: string }
        | undefined;
      if (ligne) {
        indexRecherche = ligne;
        if (!ligne.ok) {
          console.error("[coherence] INDEX RECHERCHE PÉRIMÉ —", ligne.detail);
        } else {
          // Journalisé même quand tout va bien : sinon « le contrôle n'a pas
          // tourné » et « il a tourné, rien à signaler » se ressemblent.
          console.info("[coherence] index recherche alignés sur la fonction");
        }
      }
    }

    return NextResponse.json({ ...data, arrondi, indexRecherche });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 500 }
    );
  }
}

export const GET = handle;
export const POST = handle;
