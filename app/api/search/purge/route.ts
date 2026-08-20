import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Purge du capteur de demande (0047).
 *
 * `zabelie_purge_search_misses()` supprime les recherches sans résultat plus
 * anciennes que `zabelie_search_config.retention_days`. La fonction existait
 * depuis `0047` — SANS AUCUN APPELANT. Ses deux seules invocations du dépôt
 * étaient dans `supabase/tests/search_demand.test.sql` : la purge était
 * PROUVÉE correcte et n'avait jamais tourné une fois en production.
 *
 * Ce que ça rendait faux, et qui n'est pas une question d'hygiène : la table
 * stocke `term` EN CLAIR avec un `session_hash`. La promesse de l'en-tête de
 * `0047` — « une empreinte qui tourne chaque jour, jamais un suivi » — tient
 * parce que la rétention est bornée. Sans purge, la borne n'existe pas, et une
 * suite de recherches à faible volume finit par ressembler à un identifiant.
 * Le cron n'est donc PAS un confort : c'est le préalable à la pose de
 * `SEARCH_FINGERPRINT_SALT`, donc à l'activation de la collecte.
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
 * Journal d'exécution — émis à CHAQUE passage, y compris à zéro ligne purgée.
 *
 * C'est ce journal, et pas l'entrée dans `vercel.json`, qui répond à « la
 * purge a-t-elle tourné ». Un cron DÉCLARÉ n'est pas un cron EXÉCUTÉ : secret
 * absent, déploiement non promu, chemin renommé — tous ces cas laissent
 * l'entrée en place et ne produisent rien. Tant que cette ligne n'a pas été
 * LUE au moins une fois dans les journaux Vercel, `SEARCH_FINGERPRINT_SALT`
 * ne doit pas être posée (condition d'ouverture, `OPS_TODO.md`).
 */
function journal(champs: Record<string, unknown>) {
  console.log("[search/purge]", JSON.stringify({ at: new Date().toISOString(), ...champs }));
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
    const { bail, resultat: data } = await avecBail(
      admin,
      "search_purge",
      `search-${debut}`,
      async () => {
        const { data: d, error: e } = await admin.rpc("zabelie_purge_search_misses");
        if (e) throw new Error(e.message);
        return d;
      },
      { journal: (champs) => journal({ issue: "bail", ...champs }) }
    );
    if (!bail.autorise) {
      journal({ issue: "ignore_bail_tenu", dureeMs: Date.now() - debut });
      return NextResponse.json({ ignore: "bail_tenu" }, { status: 200 });
    }
    /* L'échec de la RPC est désormais levé DANS le travail sous bail, donc
       rattrapé par le `catch` du bas — qui journalise et rend 500. Garder ici
       un `if (error)` sur une valeur toujours nulle aurait été exactement le
       garde inatteignable que ce dépôt traque partout ailleurs. */
    const purged = data ?? 0;
    journal({ issue: "termine", purgees: purged, dureeMs: Date.now() - debut });
    return NextResponse.json({ purged });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur";
    journal({ issue: "exception", message, dureeMs: Date.now() - debut });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
