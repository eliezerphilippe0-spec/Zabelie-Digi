import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadable } from "@/lib/product-kind";
import { createPayment } from "@/lib/moncash";
import { createStripeCheckout, isStripeEnabled } from "@/lib/stripe";
import { isZelleEnabled } from "@/lib/zelle";
import {
  withinRailCap,
  railCap,
  usdCentsFromHtg,
  railCountry,
} from "@/lib/payment-utils";
import {
  normalizeCouponCode,
  couponApplies,
  discountedPriceHtg,
  type CouponRow,
} from "@/lib/zabelie-coupons";
import {
  backfillCountry,
  countryFromRequest,
} from "@/lib/geo/country-backfill";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { offreFlashActive, flashEpuisee } from "@/lib/flash";
import { attribuerCommande, REF_COOKIE, CODE_RE } from "@/lib/affiliation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout  { productId, rail? }
 * rail ∈ 'moncash' (défaut) | 'stripe' | 'zelle' (rails diaspora, V-10).
 * Crée une commande + un paiement (pending, clé d'idempotence) puis renvoie
 * l'URL de redirection du rail. Aucune livraison/crédit ici : tout passe par la
 * confirmation serveur-à-serveur (return/webhook/réconciliateur/admin →
 * confirm_payment). Le LEDGER reste en HTG ; pour les rails USD, le montant
 * est figé ici (expected_usd_cents) et vérifié en base à la confirmation.
 */

const RAILS = ["moncash", "stripe", "zelle"] as const;
type Rail = (typeof RAILS)[number];

function railEnabled(rail: Rail): boolean {
  if (rail === "stripe") return isStripeEnabled();
  if (rail === "zelle") return isZelleEnabled();
  return true; // moncash = rail MVP, toujours proposé
}

export async function POST(req: Request) {
  let productId: string | undefined;
  let railInput: unknown;
  let couponInput: unknown;
  let variantInput: unknown;
  let quantityInput: unknown;
  try {
    ({
      productId,
      rail: railInput,
      couponCode: couponInput,
      variantId: variantInput,
      quantity: quantityInput,
    } = await req.json());
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "productId requis" }, { status: 400 });
  }

  const rail: Rail = (RAILS as readonly string[]).includes(String(railInput ?? "moncash"))
    ? ((railInput ?? "moncash") as Rail)
    : "moncash";
  if (!railEnabled(rail)) {
    return NextResponse.json(
      { error: "Ce moyen de paiement n'est pas disponible." },
      { status: 422 }
    );
  }

  // Acheteur authentifié.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Authentification requise" }, { status: 401 });
  }

  // Compte suspendu (modération) : action bloquée même si la session est
  // encore active (le ban auth ne coupe la session qu'au refresh du token).
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: "Compte suspendu — action non autorisée." },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Débit borné AVANT tout effet (consommation coupon, session MonCash/Stripe
  // payante) : 10 checkouts/min par compte suffisent largement à un humain.
  if (!(await rateLimit(admin, `checkout:${user.id}`, 10))) {
    return NextResponse.json(
      { error: "Trop de tentatives — réessayez dans une minute." },
      { status: 429 }
    );
  }

  // Produit publié uniquement, prix = source de vérité serveur. Le comptage
  // d'assets est EMBARQUÉ dans la même requête (audit : c'était un second
  // aller-retour séquentiel sur chaque checkout « fichier » — latence 3G).
  const { data: product, error: prodErr } = await admin
    .from("products")
    .select("id, title, price_htg, status, seller_id, kind, product_assets(count)")
    .eq("id", productId)
    .eq("status", "published")
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: "Produit introuvable" }, { status: 404 });
  }

  // BL-103 (FRONT-2) : on ne vend JAMAIS un fichier sans livrable. Les
  // nouveaux « fichier » naissent en brouillon jusqu'à l'upload, mais les
  // produits publiés avant ce garde peuvent exister sans asset → refus clair
  // plutôt qu'un acheteur MonCash floué (confiance = tout, sur ce marché).
  // Formulé en positif dès l'origine : un `physical` échappait donc au garde,
  // ce qui est le bon résultat mais par accident. `isDownloadable` le rend
  // délibéré — et le contrôle d'exhaustivité alertera à la prochaine valeur
  // ajoutée à l'énumération.
  if (isDownloadable(product.kind, product.id)) {
    const assets = product.product_assets as unknown as
      | { count: number }[]
      | null;
    if (!assets?.[0]?.count) {
      return NextResponse.json(
        {
          error: "Ce produit n'a pas encore de fichier à livrer.",
          code: "produit_incomplet",
        },
        { status: 409 }
      );
    }
  }

  // Code promo (optionnel) : validation en LECTURE côté serveur, prix figé.
  // L'acheteur qui saisit un code attend la remise — un code invalide est un
  // refus clair (422), jamais une facturation au prix plein en silence.
  // BL-133 (C-2) : la consommation ATOMIQUE du quota n'a plus lieu ici —
  // elle est déclenchée par confirm_payment, une fois le paiement CONFIRMÉ
  // (sinon tout échec après coup — 3G coupée, session MonCash abandonnée —
  // brûlait un usage pour une vente qui n'a jamais eu lieu).
  let finalPriceHtg = product.price_htg;
  let couponCode: string | null = null;
  let couponId: string | null = null;
  let discountHtg = 0;

  /* Vente flash (0080) — la fenêtre est relue ICI, au moment de créer la
   * commande, jamais crue depuis l'affichage : une offre expirée entre la
   * fiche et le clic facture le prix normal, explicitement. Le prix flash
   * devient `amount_htg`, donc commission et garde-fous s'y appliquent sans
   * qu'aucune fonction d'argent ne change. */
  const flash = await offreFlashActive(admin, product.id);
  if (flash) {
    if (typeof couponInput === "string" && couponInput.trim()) {
      // Deux remises empilées feraient un prix que ni le vendeur ni la
      // config n'ont jamais approuvé. Refus explicite, jamais silencieux.
      return NextResponse.json(
        {
          error: "Code promo non cumulable avec une vente flash.",
          code: "flash_non_cumulable",
        },
        { status: 422 }
      );
    }
    if (await flashEpuisee(admin, product.id, flash)) {
      return NextResponse.json(
        { error: "Offre flash épuisée — le prix normal s'applique de nouveau.",
          code: "flash_epuisee" },
        { status: 409 }
      );
    }
    finalPriceHtg = flash.prixFlashHtg;
    discountHtg = product.price_htg - flash.prixFlashHtg;
  }

  if (!flash && typeof couponInput === "string" && couponInput.trim()) {
    const code = normalizeCouponCode(couponInput);
    // `code: "coupon_invalid"` permet au client d'afficher le message dans la
    // langue de l'acheteur (FR/KR) — le texte serveur n'est qu'un repli.
    const rejected = () =>
      NextResponse.json(
        { error: "Code promo invalide ou expiré.", code: "coupon_invalid" },
        { status: 422 }
      );
    if (!code) return rejected();

    const { data: coupon } = await admin
      .from("zabelie_coupons")
      .select("id, seller_id, product_id, percent, max_uses, uses, expires_at, active")
      .eq("seller_id", product.seller_id)
      .eq("code", code)
      .maybeSingle();
    if (!coupon || !couponApplies(coupon as CouponRow, product.id, product.seller_id)) {
      return rejected();
    }

    finalPriceHtg = discountedPriceHtg(product.price_htg, coupon.percent);
    discountHtg = product.price_htg - finalPriceHtg;
    couponCode = code;
    couponId = coupon.id;
  }

  // Plafond du rail : on bloque AVANT de créer la commande (message clair plutôt
  // qu'un échec brutal côté opérateur). Pas de plafond connu pour Stripe/Zelle.
  if (!withinRailCap(finalPriceHtg, rail)) {
    return NextResponse.json(
      {
        error: `Montant supérieur au plafond MonCash (${railCap(rail)} HTG) par transaction.`,
      },
      { status: 422 }
    );
  }

  // Backfill best-effort du pays ACHETEUR (dashboard /admin/geo), uniquement si
  // vide. Priorité au signal fort du rail (MonCash → compte haïtien), repli sur
  // la géo-IP (rails diaspora Stripe/Zelle → pays du payeur). Non bloquant.
  await backfillCountry(
    admin,
    user.id,
    railCountry(rail) ?? countryFromRequest(req),
  );

  // Rails USD : montant figé MAINTENANT (garde-fou vérifié en base ensuite).
  let expectedUsdCents: number | null = null;
  if (rail === "stripe" || rail === "zelle") {
    const rate = Number(process.env.USD_HTG_RATE);
    try {
      expectedUsdCents = usdCentsFromHtg(finalPriceHtg, rate);
    } catch {
      return NextResponse.json(
        { error: "Taux USD non configuré (USD_HTG_RATE)." },
        { status: 422 }
      );
    }
  }

  // Commande (pending).
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      buyer_id: user.id,
      product_id: product.id,
      amount_htg: finalPriceHtg, // prix remisé figé — tous les garde-fous s'y appliquent
      coupon_code: couponCode,
      coupon_id: couponId, // BL-133 : consommé par confirm_payment, pas ici
      discount_htg: discountHtg,
      status: "pending",
    })
    .select("id, amount_htg")
    .single();

  if (orderErr || !order) {
    return NextResponse.json(
      { error: "Création commande échouée" },
      { status: 500 }
    );
  }

  // Affiliation (0081) : attribution FIGÉE maintenant, jamais au paiement
  // (leçon Jumia, docs/37). Best-effort par contrat — un cookie cassé est
  // ignoré, jamais un checkout bloqué.
  const refCookie = req.headers
    .get("cookie")
    ?.match(new RegExp(`${REF_COOKIE}=([a-z0-9]{6,16})`))?.[1];
  await attribuerCommande(admin, {
    orderId: order.id,
    productId: product.id,
    buyerId: user.id,
    sellerId: product.seller_id,
    code: refCookie && CODE_RE.test(refCookie) ? refCookie : null,
  });

  // Paiement (pending). idempotency_key = order.id (1 paiement/commande).
  const { error: payErr } = await admin.from("payments").insert({
    order_id: order.id,
    rail,
    idempotency_key: order.id,
    status: "pending",
    expected_usd_cents: expectedUsdCents,
  });
  if (payErr) {
    // BL-122 (C-4a) : un order sans ligne payment serait invisible du
    // réconciliateur (il scanne payments) — on le retire, best-effort.
    await admin.from("orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: "Création paiement échouée" },
      { status: 500 }
    );
  }

  // Produit PHYSIQUE : réservation ATOMIQUE du stock (0036). Le stock est pris
  // ici, à la commande — pas à la livraison : deux acheteurs ne peuvent pas
  // acheter la même unité. La réservation expire seule (TTL 30 min) si le
  // paiement n'aboutit pas.
  const variantId = typeof variantInput === "string" ? variantInput : null;
  if (variantId) {
    const qty = Number.isInteger(quantityInput) ? (quantityInput as number) : 1;
    const { data: reservation, error: resErr } = await admin.rpc(
      "zabelie_reserve_stock",
      { p_variant_id: variantId, p_order_id: order.id, p_quantity: qty }
    );
    if (resErr || !reservation?.ok) {
      // Rien n'est vendu : on retire la commande et son paiement, sinon le
      // réconciliateur traînerait un pending qui ne peut plus aboutir.
      await admin.from("payments").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
      const reason = reservation?.reason as string | undefined;
      return NextResponse.json(
        {
          error:
            reason === "stock_insuffisant"
              ? "Stock insuffisant pour cette quantité."
              : "Article indisponible.",
          code: reason ?? "stock_indisponible",
          disponible: reservation?.disponible,
        },
        { status: 409 }
      );
    }
  }

  try {
    if (rail === "stripe") {
      // Session Stripe Checkout ; confirmation via webhook signé uniquement.
      const { redirectUrl, sessionId } = await createStripeCheckout({
        orderId: order.id,
        usdCents: expectedUsdCents as number,
        productTitle: product.title,
      });
      await admin
        .from("payments")
        .update({ raw: { stripe_session_id: sessionId } })
        .eq("order_id", order.id);
      return NextResponse.json({ redirectUrl, orderId: order.id });
    }

    if (rail === "zelle") {
      // Pas d'API Zelle : page d'instructions (mémo + montant), confirmation
      // administrative ensuite — même confirm_payment idempotent.
      return NextResponse.json({
        redirectUrl: `/paiement/zelle/${order.id}`,
        orderId: order.id,
      });
    }

    // MonCash. orderId envoyé = notre order.id (clé de rapprochement).
    const { redirectUrl, paymentToken } = await createPayment(
      order.id,
      order.amount_htg
    );
    await admin
      .from("payments")
      .update({ raw: { payment_token: paymentToken } })
      .eq("order_id", order.id);

    return NextResponse.json({ redirectUrl, orderId: order.id });
  } catch (e) {
    // BL-114 (C-3, pattern erreurs typées façon Stripe) : le détail opérateur
    // (statut HTTP, corps brut MonCash) reste dans les logs serveur — jamais
    // renvoyé au client (fuite d'infos + intraduisible FR/KR).
    console.error("checkout: échec opérateur", e);
    // La session de paiement n'a pas pu être créée : on relibère
    // immédiatement le stock au lieu d'attendre l'expiration du TTL.
    if (variantId) {
      await admin
        .rpc("zabelie_release_stock", { p_order_id: order.id })
        .then(undefined, () => undefined);
    }
    return NextResponse.json(
      {
        error: "Paiement momentanément indisponible. Réessayez dans un instant.",
        code: "provider_unavailable",
      },
      { status: 502 }
    );
  }
}
