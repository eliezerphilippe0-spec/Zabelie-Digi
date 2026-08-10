import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Balayage des DEUX SILENCES de la remise (0043 §6).
 *
 * Un seul passage traite les deux côtés, plus le filet structurel :
 *   • acheteur muet après une remise déclarée → réception prononcée, l'escrow
 *     se débloque et le vendeur sera payé ;
 *   • VENDEUR muet → « action requise », un humain tranche. C'est la moitié
 *     qu'on oublie : sans elle, une commande jamais honorée garderait l'argent
 *     de l'acheteur sur le compte marchand sans limite de durée (docs/17) ;
 *   • avis d'auto-réception jamais partis → escalade, pour que le garde de
 *     légitimité ne verrouille pas l'escrow indéfiniment ;
 *   • commandes physiques payées dont l'escrow n'est pas gelé → réparation
 *     (§6 bis), c'est-à-dire l'appel d'ouverture oublié ou mal ordonné.
 *
 * ⚠️ ORDRE DANS LA JOURNÉE. Ce cron doit passer AVANT `/api/maturation`
 * (13:00), qui exécute `mature_wallets()`. Un orphelin réparé à 12:30 est gelé
 * avant que la maturation ne regarde ; l'inverse paierait le vendeur d'une
 * commande dont personne ne sait si elle a été remise. `/api/reconcile` (12:00)
 * passe avant nous, ce qui laisse au filet des paiements fraîchement confirmés
 * à examiner — d'où les 6 h de grâce de `orphan_grace_hours`, qui évitent de
 * traiter comme un oubli une commande qui attendait légitimement ce passage.
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
 * Journal d'exécution — émis à CHAQUE passage, LES SIX COMPTEURS COMPRIS,
 * y compris quand ils valent tous zéro.
 *
 * Sans ligne systématique, « le cron n'a pas tourné » et « il a tourné, rien à
 * faire » produisent le même journal : rien. Et les compteurs sont nommés un
 * par un plutôt qu'agrégés : `orphelins_tardifs` à 1 est un incident (de
 * l'argent est parti sans qu'on sache si la remise a eu lieu), alors qu'un
 * total à 1 ne dit rien.
 */
function journal(champs: Record<string, unknown>) {
  console.log("[fulfillment/sweep]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

type Compteurs = {
  auto_recus?: number;
  action_requise?: number;
  rappels_dus?: number;
  avis_en_echec?: number;
  orphelins_repares?: number;
  orphelins_tardifs?: number;
};

async function handle(req: Request) {
  const debut = Date.now();
  if (!authorize(req)) {
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("zabelie_fulfillment_sweep");
    if (error) {
      journal({ issue: "echec", message: error.message, dureeMs: Date.now() - debut });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const c = (data ?? {}) as Compteurs;

    /* ── Les avis partent APRÈS le balayage, et l'ordre est un choix ────────
     * Le garde de légitimité du balayage retient l'auto-réception tant qu'un
     * avis n'est pas parti. Envoyer AVANT lèverait ce garde dans la seconde :
     * un avis expédié à 12:30:01 autoriserait la réception à 12:30:02, sur un
     * message que l'acheteur n'a pas encore ouvert. En envoyant après, tout
     * avis qui part aujourd'hui laisse au moins un passage complet — donc une
     * journée — avant de pouvoir servir à trancher un silence.
     *
     * Le cas « le fournisseur était en panne pendant sept jours » n'est pas
     * pour autant laissé en limbe : la borne dure du balayage a déjà fait
     * remonter la commande en file admin, chez un humain. */
    const { envoyerAvisDus } = await import("@/lib/fulfillment-notices");
    const avis = await envoyerAvisDus(admin);

    /* Purge de rétention (0056) : les avis ENVOYÉS depuis plus de 90 jours
     * sortent du registre — un avis parti ne sert plus qu'à l'audit, et
     * l'audit a un délai. Best-effort : un échec de purge ne doit pas faire
     * échouer un balayage qui a gelé et payé correctement — mais il se
     * journalise (purges: -1 = « la purge n'a pas pu tourner », distinct de
     * 0 = « tournée, rien à purger »). Tant que 0056 n'est pas appliquée en
     * base, c'est -1 à chaque passage : la dégradation prévue, visible. */
    let purges = -1;
    try {
      const { data: purgees, error: ePurge } = await admin.rpc(
        "zabelie_purge_sent_notices",
        { p_days: 90 }
      );
      if (!ePurge) purges = Number(purgees ?? 0);
    } catch {
      /* purges reste -1 — la ligne de journal ci-dessous le dit. */
    }

    journal({
      issue: "termine",
      auto_recus: c.auto_recus ?? 0,
      action_requise: c.action_requise ?? 0,
      rappels_dus: c.rappels_dus ?? 0,
      avis_en_echec: c.avis_en_echec ?? 0,
      orphelins_repares: c.orphelins_repares ?? 0,
      orphelins_tardifs: c.orphelins_tardifs ?? 0,
      avis_dus: avis.dus,
      avis_envoyes: avis.envoyes,
      avis_echecs: avis.echecs,
      avis_concurrents: avis.concurrents,
      avis_abandonnes: avis.abandonnes,
      purges,
      dureeMs: Date.now() - debut,
    });
    return NextResponse.json({ ...c, avis, purges });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "exception", message, dureeMs: Date.now() - debut });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
