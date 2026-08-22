import { NextResponse } from "next/server";
import { erreurTraduite } from "@/lib/api-erreur";
import { getCurrentUser } from "@/lib/auth";
import { journaliserActeAdmin } from "@/lib/admin-audit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = ["moncash", "especes", "virement", "autre"] as const;
type PayoutMethod = (typeof METHODS)[number];

/**
 * POST /api/admin/payouts
 *   { walletId, amountHtg, method, reference, note?, paidAt? }
 *
 * Chantier 0, lot 0.a (docs/19) : enregistre un règlement vendeur DÉJÀ EFFECTUÉ
 * hors plateforme (virement MonCash direct contre reçu). Ce n'est pas un
 * décaissement — c'est l'inscription au registre d'un paiement réel, sans quoi
 * le solde vendeur afficherait une dette déjà payée.
 *
 * Tout le contrôle est en base (zabelie_record_manual_payout) : verrou du
 * portefeuille, refus si le montant dépasse le solde DISPONIBLE (le solde en
 * attente n'est pas décaissable), idempotence sur la référence du reçu,
 * écriture au grand livre append-only.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return erreurTraduite("api.access.denied", 403);
  }

  let body: {
    walletId?: string;
    amountHtg?: number;
    method?: string;
    reference?: string;
    note?: string | null;
    paidAt?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return erreurTraduite("api.json.invalid", 400);
  }

  if (!body.walletId) {
    return erreurTraduite("api.params.invalid", 400);
  }

  // Montant : entier strictement positif (le ledger est en gourdes entières).
  const amount = Number(body.amountHtg);
  if (!Number.isInteger(amount) || amount <= 0) {
    return erreurTraduite("api.amount.invalid", 422);
  }

  const method = String(body.method ?? "moncash");
  if (!(METHODS as readonly string[]).includes(method)) {
    return erreurTraduite("api.method.unknown", 422);
  }

  // Référence du reçu : c'est elle qui rend le règlement opposable, et elle
  // sert de clé d'idempotence — un formulaire resoumis ne paie pas deux fois.
  const reference = String(body.reference ?? "").trim().slice(0, 120);
  if (!reference) {
    return erreurTraduite("api.receipt.required", 422);
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("zabelie_record_manual_payout", {
    p_wallet_id: body.walletId,
    p_amount_htg: amount,
    p_method: method as PayoutMethod,
    p_reference: reference,
    p_recorded_by: user.id,
    p_note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : null,
    p_paid_at: body.paidAt || null,
  });

  if (error) {
    // Le détail base (solde insuffisant, etc.) est utile à l'admin : il est
    // seul destinataire de cet endpoint.
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  await journaliserActeAdmin(admin, {
    actorId: user.id,
    action: "payout.record_manual",
    targetType: "wallet",
    targetId: body.walletId,
    metadata: { amountHtg: amount, method, duplicate: Boolean(data?.duplicate) },
  });
  return NextResponse.json({
    ok: true,
    duplicate: Boolean(data?.duplicate),
    payoutId: data?.payout_id,
    balanceHtg: data?.balance_htg,
  });
}
