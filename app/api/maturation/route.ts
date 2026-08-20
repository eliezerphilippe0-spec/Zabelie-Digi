import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Job de maturation : fait passer les soldes en attente arrivés à échéance
 * (J+7) vers le solde disponible. À déclencher par cron.
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
  console.log("[maturation]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
}

async function handle(req: Request) {
  const debut = Date.now();
  if (!authorize(req)) {
    journal({ issue: "non_autorise", secretConfigure: Boolean(process.env.CRON_SECRET) });
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    /* BAIL D'EXÉCUTION (`0060`) — un seul porteur à la fois.
     *
     * ⚠️ Ajouté le 2026-08-20. `lib/cron-lease.ts` a été écrit pour que « le
     * huitième cron en hérite sans y penser » — et il ne servait qu'à UNE
     * route sur huit. Le plan Hobby annonce par ailleurs une « flexible time
     * window » d'une heure : deux créneaux espacés de 30 minutes peuvent donc
     * se chevaucher, ou s'inverser.
     *
     * Fail-open si `0060` manque (voir `lib/cron-lease.ts`) : un bail est une
     * garantie ADDITIONNELLE, jamais une condition de correction. */
    const { avecBail } = await import("@/lib/cron-lease");
    const { bail, resultat } = await avecBail(
      admin,
      "maturation",
      `maturation-${debut}`,
      async () => {
        const { data, error } = await admin.rpc("mature_wallets");
        if (error) throw new Error(error.message);
        return data;
      },
      { journal: (champs) => journal({ issue: "bail", ...champs }) }
    );
    if (!bail.autorise) {
      journal({ issue: "ignore_bail_tenu", dureeMs: Date.now() - debut });
      return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
    }
    const data = resultat;
    // Purge RGPD des payloads opérateur clôturés & anciens (best-effort : ne doit
    // pas faire échouer la maturation).
    const { data: purged } = await admin.rpc("purge_payment_raw", { p_days: 90 });
    journal({ issue: "termine", matures: data ?? 0, purgees: purged ?? 0, dureeMs: Date.now() - debut });
    return NextResponse.json({ matured: data ?? 0, purged: purged ?? 0 });
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
