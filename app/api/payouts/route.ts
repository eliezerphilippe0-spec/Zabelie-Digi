import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/collections";
import { erreurTraduite } from "@/lib/api-erreur";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { formatHTG } from "@/lib/sample-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payouts { amountHtg, expectedActorId } — demande du VENDEUR.
 * Chantier 0, lot 0.b (docs/19) : la voie de sortie dont l'absence est au cœur
 * du dossier BRH.
 *
 * Le portefeuille n'est JAMAIS fourni par le client : la fonction en base le
 * résout depuis l'utilisateur authentifié. Les contrôles métier (minimum,
 * plafond, délai, suspension, solde disponible) sont en base, sous verrou.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return erreurTraduite("api.auth.required", 401);

  let body: { amountHtg?: number; expectedActorId?: unknown };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  // L'écran doit encore appartenir à la session qui immobilisera ce solde.
  // L'identifiant attendu ne choisit jamais le propriétaire transmis à la RPC.
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.expectedActorId !== "string" || !UUID_RE.test(body.expectedActorId)) {
    return erreurTraduite("api.params.invalid", 422);
  }
  if (body.expectedActorId !== user.id) return erreurTraduite("api.auth.required", 403);

  const amount = Number(body.amountHtg);
  if (!Number.isInteger(amount) || amount <= 0) {
    return erreurTraduite("api.amount.invalid", 422);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_request_payout", {
    p_user_id: user.id,
    p_amount_htg: amount,
  });

  if (error) {
    console.error("payouts: échec demande", error);
    return erreurTraduite("api.payout.failed", 500);
  }

  if (!data?.ok) {
    // `reason` reste un code stable, renvoyé tel quel : l'écran s'en sert pour
    // proposer l'ACTION (le dépôt des pièces), pas pour traduire. La phrase,
    // elle, part déjà dans la langue du vendeur — le motif de
    // `lib/api-erreur.ts`, qui ne demande rien de plus aux écrans.
    //
    // ⚠️ Les nombres viennent de la RPC, avec les MÊMES replis qu'avant
    // (500, 100 000, 24 h, 0) : cette couche n'en décide aucun, elle les
    // formate comme le reste du tableau de bord (`formatHTG`).
    const lang = await getLang();
    const htg = (v: unknown, repli: number) => formatHTG(Number(v ?? repli));
    const messages: Record<string, string> = {
      montant_invalide: t(lang, "api.amount.invalid"),
      sous_minimum: t(lang, "api.payout.minimum", { min: htg(data?.min_htg, 500) }),
      au_dessus_plafond: t(lang, "api.payout.maximum", { max: htg(data?.max_htg, 100000) }),
      compte_suspendu: t(lang, "api.payout.suspended"),
      portefeuille_absent: t(lang, "api.payout.nobalance"),
      demande_en_cours: t(lang, "api.payout.pending"),
      delai_non_ecoule: t(lang, "api.payout.cooldown", { heures: String(data?.cooldown_hours ?? 24) }),
      solde_insuffisant:
        Number(data?.frais_ia_htg) > 0
          ? t(lang, "api.payout.balance.ia", {
              disponible: htg(data?.disponible_htg, 0),
              frais: htg(data.frais_ia_htg, 0),
            })
          : t(lang, "api.payout.balance", { disponible: htg(data?.disponible_htg, 0) }),
      // V-6 : le retrait est gardé par la vérification d'identité. Trois
      // messages distincts, parce que ce ne sont pas trois fois la même
      // action pour le vendeur : attendre, corriger, ou déposer.
      kyc_requis:
        data?.kyc_statut === "pending"
          ? t(lang, "api.payout.kyc.pending")
          : data?.kyc_statut === "rejected"
            ? t(lang, "api.payout.kyc.rejected")
            : t(lang, "api.payout.kyc.missing"),
    };
    return NextResponse.json(
      {
        error: messages[data?.reason as string] ?? t(lang, "api.payout.refused"),
        code: data?.reason,
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    payoutId: data.payout_id,
    balanceHtg: data.balance_htg,
    // Recouvrement de la dette IA effectué avec cette demande (0072) —
    // 0 tant que 0071/0072 ne sont pas appliquées ou sans dette.
    fraisIaReglesHtg: Number(data.frais_ia_regles_htg ?? 0),
  });
}
