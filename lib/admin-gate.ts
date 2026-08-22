import { getCurrentUser } from "@/lib/auth";

/**
 * LE GARDE D'ADMINISTRATION — extrait de `app/api/admin/coherence/route.ts`
 * le 2026-08-22, au moment où une SECONDE route en a eu besoin.
 *
 * Trois façons d'entrer, et elles ne se valent pas :
 *   • `CRON_SECRET` — Vercel appelle ses crons avec ce jeton ;
 *   • `RECONCILE_SECRET` — un exploitant en ligne de commande ;
 *   • une session dont le rôle est `admin`.
 *
 * ⚠️ EXTRAIT PLUTÔT QUE RECOPIÉ, et c'est la seule raison de ce fichier. Une
 * règle d'autorisation dupliquée diverge toujours, et c'est toujours la copie
 * la plus récente qui reste en arrière — la même leçon que
 * `tests/messagerie.test.ts` M4 énonce à propos des policies.
 *
 * ⚠️ CE QUE CE FICHIER NE FAIT PAS : les SEPT autres routes du dépôt qui
 * portent une variante de ce garde (`maturation`, `reconcile`, `search/purge`,
 * `fulfillment/sweep`, `points/expire`, `kyc/purge`, `stock/expire`,
 * `admin/search-demand`) ne sont PAS réécrites ici. Elles fonctionnent, aucun
 * défaut n'y a été mesuré, et les réécrire pour répondre à « vérifie
 * RESEND_API_KEY » serait exactement la dérive que `CLAUDE.md` décrit : une
 * chaîne de tours dont chacun appelle le suivant sans que personne ne remonte
 * à la question de départ. La classe est NOMMÉE ici ; elle se traitera quand
 * elle coûtera quelque chose.
 *
 * ⚠️ COMPARAISON DE JETON — la valeur est forcément LUE. C'est ce qui a fait
 * partir rouge la première version du garde `I3` de
 * `tests/integrations-sonde.test.ts` : un test qui interdit de déréférencer un
 * secret interdit du même coup l'authentification. Ce qui doit rester
 * impossible, c'est qu'une valeur atteigne une RÉPONSE.
 */
export async function autoriserAdmin(req: Request): Promise<boolean> {
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const cron = process.env.CRON_SECRET;
  const manual = process.env.RECONCILE_SECRET;
  if (cron && bearer === cron) return true;
  if (manual && (bearer === manual || req.headers.get("x-reconcile-secret") === manual))
    return true;
  const user = await getCurrentUser();
  return user?.role === "admin";
}
