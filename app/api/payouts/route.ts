import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payouts  { amountHtg }  — demande de retrait par le VENDEUR.
 * Chantier 0, lot 0.b (docs/19) : la voie de sortie dont l'absence est au cœur
 * du dossier BRH.
 *
 * Le portefeuille n'est JAMAIS fourni par le client : la fonction en base le
 * résout depuis l'utilisateur authentifié. Tous les contrôles (minimum,
 * plafond, délai, suspension, solde disponible) sont en base, sous verrou.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  let body: { amountHtg?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const amount = Number(body.amountHtg);
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json(
      { error: "Montant invalide (entier positif en HTG)" },
      { status: 422 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_request_payout", {
    p_user_id: user.id,
    p_amount_htg: amount,
  });

  if (error) {
    console.error("payouts: échec demande", error);
    return NextResponse.json({ error: "Demande impossible" }, { status: 500 });
  }

  if (!data?.ok) {
    // `reason` est un code stable : le client l'affiche dans la langue du
    // vendeur (FR/KR), le texte serveur n'est qu'un repli.
    const messages: Record<string, string> = {
      montant_invalide: "Montant invalide.",
      sous_minimum: `Le minimum est de ${data?.min_htg ?? 500} HTG.`,
      au_dessus_plafond: `Le maximum par demande est de ${data?.max_htg ?? 100000} HTG.`,
      compte_suspendu: "Compte suspendu — retrait indisponible.",
      portefeuille_absent: "Aucun portefeuille pour ce compte.",
      demande_en_cours: "Une demande est déjà en cours de traitement.",
      delai_non_ecoule: `Une nouvelle demande est possible après ${data?.cooldown_hours ?? 24} h.`,
      solde_insuffisant: `Solde disponible insuffisant (${data?.disponible_htg ?? 0} HTG).`,
    };
    return NextResponse.json(
      {
        error: messages[data?.reason as string] ?? "Demande refusée.",
        code: data?.reason,
      },
      { status: 422 }
    );
  }

  return NextResponse.json({
    ok: true,
    payoutId: data.payout_id,
    balanceHtg: data.balance_htg,
  });
}
