import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { erreurAvecLangue } from "@/lib/api-erreur";
import { essayageActif, lireEnvEssayage } from "@/lib/essayage/flags";
import { lireFournisseur } from "@/lib/essayage/fournisseur";
import { baseEssayage } from "@/lib/essayage/base";
import { suivreEssai } from "@/lib/essayage/serveur";
import { ENTETES_ESSAYAGE, reponseSuivi } from "@/lib/essayage/reponses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Contexte = { params: Promise<{ id: string }> };

/**
 * GET /api/essayage/[id]  → { etat: en_cours | reussi (image) | echec | expire }
 *
 * Le sondage de la feuille d'essayage, toutes les 2 secondes pendant
 * 60 secondes au plus (tâche 4.4). Seul l'auteur de l'essai le lit : la base
 * filtre par acheteur (`lib/essayage/base.ts`), et l'essai d'un autre est le
 * même 404 qu'un essai inexistant. L'image n'est rendue qu'une fois, puis
 * effacée chez le fournisseur.
 */
export async function GET(_req: Request, ctx: Contexte) {
  const lang = await getLang();
  const env = lireEnvEssayage();
  if (!essayageActif(env)) return erreurAvecLangue(lang, "api.feature.off", 404);
  const fournisseur = lireFournisseur(env);
  if (!fournisseur) return erreurAvecLangue(lang, "api.feature.off", 404);
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return erreurAvecLangue(lang, "api.auth.required", 401);
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `essayage:suivi:${user.id}`, 60, 60))) return erreurAvecLangue(lang, "api.rate.limited", 429);

  let r;
  try {
    r = reponseSuivi(await suivreEssai({ base: baseEssayage(admin), fournisseur }, user.id, id));
  } catch {
    console.error("[essayage] suivi interrompu");
    return erreurAvecLangue(lang, "api.unavailable", 503);
  }
  return NextResponse.json(r.cle ? { error: t(lang, r.cle), ...r.corps } : r.corps, { status: r.statut, headers: ENTETES_ESSAYAGE });
}
