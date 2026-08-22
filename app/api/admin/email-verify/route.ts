import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { autoriserAdmin } from "@/lib/admin-gate";
import { verifierFournisseur } from "@/lib/zabelie-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/admin/email-verify` — LA question, posée au fournisseur.
 *
 * ⚠️ CE QUI LA SÉPARE DE `integrations.email` DANS `/api/admin/coherence` :
 * cette sonde-ci **sort du processus**. Celle de `coherence` lit une variable
 * d'environnement et rend un booléen de présence ; celle-ci interroge Resend
 * et rapporte ce que Resend a répondu. Les deux sont utiles et ne répondent
 * pas à la même question — d'où deux routes plutôt qu'un champ de plus :
 * `coherence` est appelée par un cron toutes les nuits, et lui ajouter un
 * appel réseau vers un tiers en ferait dépendre le contrôle du REGISTRE, qui
 * est comptable et ne doit dépendre de rien.
 *
 * Réservée à l'administration (`lib/admin-gate.ts`) : elle nomme un domaine
 * d'expédition et l'état d'un compte fournisseur. **Elle ne rend jamais la
 * clé**, ni un aperçu, ni sa longueur — `tests/email-verify.test.ts` E4 le
 * vérifie sur les quatre secrets du dépôt.
 */
export async function GET(req: Request) {
  if (!(await autoriserAdmin(req))) {
    return erreurTraduite("api.access.denied", 401);
  }
  const rapport = await verifierFournisseur();

  /* Journalisé DANS LES DEUX SENS — « n'a pas tourné » et « a tourné, tout va
   * bien » doivent se distinguer. C'est la règle d'observabilité, et c'est
   * aussi ce qui permet à quelqu'un qui n'ouvre jamais cette route d'être
   * quand même prévenu en croisant les journaux. */
  if (rapport.verdict === "ok") {
    console.info(`[email-verify] OK — ${rapport.explication}`);
  } else {
    console.error(`[email-verify] ${rapport.verdict.toUpperCase()} — ${rapport.explication}`);
  }

  return NextResponse.json(rapport, { headers: { "Cache-Control": "no-store" } });
}
