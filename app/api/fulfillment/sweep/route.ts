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
 * Journal d'exécution — émis à CHAQUE passage, LES HUIT COMPTEURS COMPRIS,
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

    /* BAIL D'EXÉCUTION (0060) — un seul porteur à la fois.
     *
     * Ce balayage est déjà sûr en concurrence : ses quatre boucles portent
     * `for update skip locked`. Le bail n'y change rien et ne prétend pas le
     * contraire — il rend la sûreté structurelle plutôt que dépendante du SQL
     * écrit en dessous, et il RÉVÈLE les chevauchements, qui aujourd'hui font
     * le travail deux fois sans que rien ne le dise.
     *
     * Fail-open si `0060` n'est pas appliquée : voir `lib/cron-lease.ts`. Un
     * cron qui gèle des escrows ne s'abstient pas parce qu'une table de
     * verrous manque. */
    const { avecBail } = await import("@/lib/cron-lease");
    const detenteur = `sweep-${debut}`;
    const { bail, resultat } = await avecBail(
      admin,
      "fulfillment_sweep",
      detenteur,
      async () => {
        const { data, error } = await admin.rpc("zabelie_fulfillment_sweep");
        if (error) throw new Error(error.message);
        return data;
      },
      { journal: (champs) => journal({ issue: "bail", ...champs }) }
    );

    if (!bail.autorise) {
      journal({ issue: "ignore_bail_tenu", dureeMs: Date.now() - debut });
      return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
    }

    // L'échec de la RPC est désormais levé DANS le travail sous bail, donc
    // rattrapé par le `catch` du bas — qui journalise et rend 500. Garder ici
    // un `if (error)` sur une valeur toujours nulle aurait été exactement le
    // garde inatteignable que ce dépôt traque partout ailleurs.
    const c = (resultat ?? {}) as Compteurs;

    /* ── Le balayage DIGITAL, dans le même passage ──────────────────────────
     * `zabelie_fulfillment_sweep` filtre sur `kind = 'physical'` : les
     * commandes d'un `fichier` sans livrable n'étaient vues par personne, et
     * mûrissaient au chronomètre (voir l'en-tête de `0059`). Fonction séparée
     * plutôt qu'une branche de plus : la première est adjacente à l'argent, et
     * on ne rouvre pas 180 lignes de money-path pour en ajouter vingt.
     *
     * Un échec ici ne fait PAS échouer le passage physique, qui a déjà réussi
     * et dont les avis partent plus bas — mais il est journalisé, sans quoi
     * « la sonde n'a pas tourné » et « elle n'a rien trouvé » se ressemblent.
     * Schéma en retard (`0059` non appliquée) : même traitement. */
    let digital: { fichiers_signales?: number; fichiers_leves?: number } = {};
    const { data: dData, error: dErr } = await admin.rpc(
      "zabelie_fichier_sans_livrable_sweep"
    );
    if (dErr) {
      journal({ issue: "echec_digital", message: dErr.message });
    } else {
      digital = (dData ?? {}) as typeof digital;
    }

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

    journal({
      issue: "termine",
      auto_recus: c.auto_recus ?? 0,
      action_requise: c.action_requise ?? 0,
      rappels_dus: c.rappels_dus ?? 0,
      avis_en_echec: c.avis_en_echec ?? 0,
      orphelins_repares: c.orphelins_repares ?? 0,
      orphelins_tardifs: c.orphelins_tardifs ?? 0,
      fichiers_signales: digital.fichiers_signales ?? 0,
      fichiers_leves: digital.fichiers_leves ?? 0,
      avis_dus: avis.dus,
      avis_envoyes: avis.envoyes,
      avis_echecs: avis.echecs,
      avis_concurrents: avis.concurrents,
      avis_abandonnes: avis.abandonnes,
      dureeMs: Date.now() - debut,
    });
    return NextResponse.json({ ...c, ...digital, avis });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "exception", message, dureeMs: Date.now() - debut });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
