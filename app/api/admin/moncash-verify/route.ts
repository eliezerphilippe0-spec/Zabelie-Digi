import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { autoriserAdmin } from "@/lib/admin-gate";
import { verifierMonCash } from "@/lib/moncash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/moncash-verify` — LA question, posée à MonCash.
 *
 * Jumelle de `/api/admin/email-verify`, et pour la même raison : la sonde
 * existante (`sondeMonCash`, servie par `/api/admin/coherence`) lit
 * `MONCASH_MODE` et rend un verdict sur la CONFIGURATION. Celle-ci sort du
 * processus et rapporte ce que MonCash a répondu. Les deux sont utiles et ne
 * répondent pas à la même question — d'où deux routes plutôt qu'un champ de
 * plus : `coherence` est appelée par un cron chaque nuit, et lui ajouter un
 * appel réseau vers un tiers ferait dépendre le contrôle du REGISTRE, qui est
 * comptable, de la disponibilité de Digicel.
 *
 * Réservée à l'administration (`lib/admin-gate.ts`) : elle nomme un hôte et
 * l'état d'un compte marchand. **Elle ne rend jamais un secret** — ni le
 * client secret, ni le jeton obtenu ; `tests/moncash-verify.test.ts` le
 * vérifie sur le JSON sérialisé.
 */
export async function GET(req: Request) {
  if (!(await autoriserAdmin(req))) {
    return erreurTraduite("api.access.denied", 401);
  }
  const rapport = await verifierMonCash();

  /* Journalisé DANS LES DEUX SENS — « n'a pas tourné » et « a tourné, tout va
   * bien » doivent se distinguer. Sans la branche `ok`, un silence dans les
   * journaux serait ambigu, et c'est exactement le défaut d'observabilité que
   * ce dépôt traque. */
  if (rapport.verdict === "ok") {
    console.info(`[moncash-verify] OK — ${rapport.explication}`);
  } else {
    console.error(`[moncash-verify] ${rapport.verdict.toUpperCase()} — ${rapport.explication}`);
  }

  return NextResponse.json(rapport, { headers: { "Cache-Control": "no-store" } });
}
