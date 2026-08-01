import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPayment } from "@/lib/moncash";
import { isZelleEnabled } from "@/lib/zelle";
import { usdCentsFromHtg } from "@/lib/payment-utils";
import { normalizeHaitiPhone } from "@/lib/zabelie-topup/phone";
import { isTopupEnabled } from "@/lib/zabelie-topup/fulfill";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import {
  isTopupFirstPartyEnabled,
  TOPUP_CLOSED_BODY,
  TOPUP_CLOSED_STATUS,
} from "@/lib/topup-flag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/zabelie/topup/orders  { productId, phone, phoneConfirm, rail }
 * Crée une commande de recharge (V-11). Règles BRH appliquées ICI, avant toute
 * création : prix résolu serveur depuis le catalogue (jamais du client),
 * plafonds par tx/jour + velocity check (Postgres), double saisie du numéro.
 * Rails : moncash (HTG) | zelle (USD, semi-manuel). NatCash ⛔ (règle dure).
 * Aucune livraison ici — fulfillment uniquement après confirmation du paiement.
 */
export async function POST(req: Request) {
  // Creation de commande = VENTE. Fermee AVANT tout le reste, avant meme la
  // lecture du corps : rien ne doit etre ecrit ni facture. 410 et non 503 —
  // la ressource a existe et ne reviendra pas. Voir lib/topup-flag.ts.
  if (!isTopupFirstPartyEnabled()) {
    return NextResponse.json(TOPUP_CLOSED_BODY, { status: TOPUP_CLOSED_STATUS });
  }
  if (!isTopupEnabled()) {
    return NextResponse.json(
      { error: "Service de recharge non configuré." },
      { status: 503 }
    );
  }

  let body: {
    productId?: string;
    phone?: string;
    phoneConfirm?: string;
    rail?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const rail = body.rail === "zelle" ? "zelle" : "moncash";
  if (rail === "zelle" && !isZelleEnabled()) {
    return NextResponse.json(
      { error: "Zelle n'est pas disponible." },
      { status: 422 }
    );
  }
  if (!body.productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  // Numéro bénéficiaire : normalisation + DOUBLE SAISIE (erreur = perte sèche).
  const phone = normalizeHaitiPhone(body.phone ?? "");
  const phoneConfirm = normalizeHaitiPhone(body.phoneConfirm ?? "");
  if (!phone) {
    return NextResponse.json(
      { error: "Numéro haïtien invalide (8 chiffres, mobile 3X/4X)." },
      { status: 422 }
    );
  }
  if (phone !== phoneConfirm) {
    return NextResponse.json(
      { error: "Les deux saisies du numéro ne correspondent pas." },
      { status: 422 }
    );
  }

  // Acheteur authentifié (KYC-lite : compte + numéro bénéficiaire, rien de plus).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Débit borné AVANT toute création (chaque commande déclenche une session
  // MonCash payante) — complète les plafonds BRH, qui bornent les montants
  // mais pas la cadence des appels eux-mêmes.
  if (!(await rateLimit(admin, `topup:${user.id}`, 5))) {
    return NextResponse.json(
      { error: "Trop de tentatives — réessayez dans une minute." },
      { status: 429 }
    );
  }

  // Produit actif — prix/coût figés côté serveur.
  const { data: product } = await admin
    .from("zabelie_topup_products")
    .select("id, operator, face_value_htg, cost_htg, price_htg, active")
    .eq("id", body.productId)
    .eq("active", true)
    .single();
  if (!product) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  // Rail USD : montant figé maintenant, vérifié en base à la confirmation.
  let expectedUsdCents: number | null = null;
  if (rail === "zelle") {
    const rate = Number(process.env.USD_HTG_RATE);
    try {
      expectedUsdCents = usdCentsFromHtg(product.price_htg, rate);
    } catch {
      return NextResponse.json(
        { error: "Taux USD non configuré (USD_HTG_RATE)." },
        { status: 422 }
      );
    }
  }

  // BL-137 (ALERTE BRH, C-9) : plafonds (montant/tx, jour HAÏTIEN — pas UTC,
  // vélocité bénéficiaires/heure) vérifiés ET la commande créée dans le MÊME
  // appel atomique (verrou par acheteur en base) — ferme la fenêtre de course
  // entre la lecture du cumul et l'insertion (auparavant bornée seulement
  // par le rate-limit, jamais par la base).
  const { data: reserved, error: reserveErr } = await admin.rpc(
    "zabelie_topup_reserve_order",
    {
      p_buyer_id: user.id,
      p_product_id: product.id,
      p_beneficiary_phone: phone,
      p_operator: product.operator,
      p_face_value_htg: product.face_value_htg,
      p_amount_htg: product.price_htg,
      p_cost_htg: product.cost_htg,
      p_rail: rail,
      p_expected_usd_cents: expectedUsdCents,
    }
  );
  if (reserveErr || !reserved) {
    return NextResponse.json({ error: "Création commande échouée" }, { status: 500 });
  }
  if (!reserved.ok) {
    const msg =
      reserved.reason === "per_tx"
        ? `Montant supérieur au plafond par transaction (${reserved.cap_htg} HTG).`
        : reserved.reason === "per_day"
          ? `Plafond journalier atteint (${reserved.cap_htg} HTG par jour).`
          : "Trop de numéros différents rechargés en peu de temps. Réessayez plus tard.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  const order = { id: reserved.order_id as string, amount_htg: reserved.amount_htg as number };

  try {
    if (rail === "zelle") {
      await admin.rpc("zabelie_topup_transition", {
        p_order_id: order.id,
        p_to: "payment_pending",
        p_detail: { rail, expected_usd_cents: expectedUsdCents },
      });
      return NextResponse.json({
        redirectUrl: `/rechaj/${order.id}`,
        orderId: order.id,
      });
    }

    // MonCash — orderId envoyé = notre topup order.id (clé de rapprochement).
    const { redirectUrl, paymentToken } = await createPayment(
      order.id,
      order.amount_htg
    );
    await admin.rpc("zabelie_topup_transition", {
      p_order_id: order.id,
      p_to: "payment_pending",
      p_detail: { rail, payment_token: paymentToken },
    });
    return NextResponse.json({ redirectUrl, orderId: order.id });
  } catch (e) {
    // BL-114 (C-3) : détail opérateur loggé serveur, jamais renvoyé au client.
    console.error("topup: échec opérateur", e);
    return NextResponse.json(
      {
        error: "Paiement momentanément indisponible. Réessayez dans un instant.",
        code: "provider_unavailable",
      },
      { status: 502 }
    );
  }
}
