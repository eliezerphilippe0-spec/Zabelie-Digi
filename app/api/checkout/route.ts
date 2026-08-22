import { NextResponse } from "next/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { getSuspension } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadable, isDigitalKind } from "@/lib/product-kind";
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

/**
 * RAIL GRATUIT (`0087`) — jamais choisi par le client, toujours DÉDUIT du prix
 * lu en base. Il ne figure donc pas dans `RAILS` : personne ne peut le demander.
 *
 * ⚠️ C'est la propriété qui rend ce rail sûr. Un rail « gratis » que l'appelant
 * pourrait réclamer serait une porte ouverte sur toute commande ; celui-ci
 * s'impose de lui-même quand, et seulement quand, `orders.amount_htg` vaut 0 —
 * une valeur que seul le serveur écrit, depuis `products.price_htg`.
 */
const RAIL_GRATIS = "gratis" as const;
type Rail = (typeof RAILS)[number];

function railEnabled(rail: Rail): boolean {
  if (rail === "stripe") return isStripeEnabled();
  if (rail === "zelle") return isZelleEnabled();
  return true; // moncash = rail MVP, toujours proposé
}

export async function POST(req: Request) {
  const lang = await getLang();
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
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: t(lang, "api.status.invalid") }, { status: 400 });
  }

  const rail: Rail = (RAILS as readonly string[]).includes(String(railInput ?? "moncash"))
    ? ((railInput ?? "moncash") as Rail)
    : "moncash";
  if (!railEnabled(rail)) {
    return NextResponse.json(
      { error: t(lang, "api.rail.unavailable") },
      { status: 422 }
    );
  }

  // Acheteur authentifié.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }

  // Compte suspendu (modération) : action bloquée même si la session est
  // encore active (le ban auth ne coupe la session qu'au refresh du token).
  if (await getSuspension(user.id)) {
    return NextResponse.json(
      { error: t(lang, "api.suspended") },
      { status: 403 }
    );
  }

  const admin = createAdminClient();

  // Débit borné AVANT tout effet (consommation coupon, session MonCash/Stripe
  // payante) : 10 checkouts/min par compte suffisent largement à un humain.
  if (!(await rateLimit(admin, `checkout:${user.id}`, 10))) {
    return NextResponse.json(
      { error: t(lang, "api.rate.limited") },
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
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
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
          error: t(lang, "api.deliverable.missing"),
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
  /* ── RAIL GRATUIT (0087) : périmètre NUMÉRIQUE ────────────────────────────
   *
   * Un produit affiché à 0 s'acquiert sans paiement (voir plus bas). Un
   * produit PHYSIQUE à 0, lui, est refusé — et ce n'est pas une prudence de
   * principe : la base le dit déjà pour les articles à variantes,
   * `zabelie_product_variants.price_htg > 0` (0036). Ce garde étend la même
   * règle au physique sans variante, qui passait entre les mailles.
   *
   * Ce qu'un physique gratuit signifierait vraiment : « le vendeur expédie à
   * ses frais ». C'est un arbitrage commercial du porteur, pas une décision
   * d'implémentation — et le découvrir après avoir reçu la commande serait le
   * découvrir trop tard. */
  const estGratuit = product.price_htg === 0;
  if (estGratuit && !isDigitalKind(product.kind)) {
    return NextResponse.json(
      {
        error:
          t(lang, "api.free.physical"),
        code: "gratuit_physique_refuse",
      },
      { status: 422 }
    );
  }

  /* Acquisition gratuite DÉJÀ FAITE : on rend la commande existante au lieu
   * d'en créer une seconde. Sans ce contrôle, rien n'empêche d'acquérir cent
   * fois le même produit à 0 — cent commandes, cent paiements, cent lignes de
   * suivi, cent écritures d'escrow à zéro. Aucun risque d'argent, mais un
   * registre noyé, et c'est le registre qui sert à tout ici.
   *
   * ⚠️ Il reste une course possible : deux clics simultanés peuvent produire
   * deux commandes. C'est assumé — pour un produit gratuit, le pire est une
   * ligne en double, pas un double débit. Le fermer complètement demanderait
   * un index unique partiel, qui viendra si le besoin apparaît. */
  if (product.price_htg === 0) {
    const { data: deja } = await admin
      .from("orders")
      .select("id")
      .eq("buyer_id", user.id)
      .eq("product_id", product.id)
      .in("status", ["paid", "delivered"])
      .limit(1)
      .maybeSingle();
    if (deja) {
      return NextResponse.json({
        redirectUrl: "/mes-achats",
        orderId: deja.id,
        gratuit: true,
        deja: true,
      });
    }
  }

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
          error: t(lang, "api.coupon.flash"),
          code: "flash_non_cumulable",
        },
        { status: 422 }
      );
    }
    if (await flashEpuisee(admin, product.id, flash)) {
      return NextResponse.json(
        { error: t(lang, "api.flash.exhausted"),
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
        { error: t(lang, "api.coupon.invalid"), code: "coupon_invalid" },
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
        { error: t(lang, "api.usd.rate") },
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
      { error: t(lang, "api.order.failed") },
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
  /* Le rail est DÉDUIT du montant relu en base, jamais du champ envoyé par
   * l'appelant : un client qui réclamerait `gratis` sur un produit payant
   * obtient `moncash`, et un client qui réclamerait `moncash` sur un produit à
   * 0 obtient `gratis`. Dans les deux sens, c'est le prix qui commande. */
  const railEffectif = order.amount_htg === 0 ? RAIL_GRATIS : rail;

  const { error: payErr } = await admin.from("payments").insert({
    order_id: order.id,
    rail: railEffectif,
    idempotency_key: order.id,
    status: "pending",
    expected_usd_cents: expectedUsdCents,
  });
  if (payErr) {
    // BL-122 (C-4a) : un order sans ligne payment serait invisible du
    // réconciliateur (il scanne payments) — on le retire, best-effort.
    await admin.from("orders").delete().eq("id", order.id);

    /* ⚠️ LE RAIL GRATUIT ÉCHOUE **ICI**, PAS PLUS BAS — corrigé le 2026-08-22.
     *
     * Le repli `ZB087` avait été placé au moment de `confirm_payment`, et
     * annoncé au porteur ainsi : « le rail est dormant, pas cassé, il
     * journalise ZB087 et rend 503 ». C'était FAUX, et il l'a découvert en
     * essayant d'acheter : tant que `0087` n'est pas appliquée,
     * `payment_rail` ne connaît pas la valeur `gratis`, l'INSERTION échoue à
     * cette ligne, et le message rendu était « Création paiement échouée » —
     * générique, muet sur la cause, et jamais le garde prévu.
     *
     * La leçon est celle du dépôt, retournée contre son auteur : le mode de
     * panne avait été RAISONNÉ au lieu d'être PARCOURU. Un repli écrit pour un
     * chemin qu'on n'a pas emprunté se place au mauvais endroit, et son
     * silence ressemble exactement à celui qu'il devait supprimer. */
    const railGratuitIndisponible =
      railEffectif === RAIL_GRATIS &&
      /invalid input value for enum|payment_rail/i.test(payErr.message ?? "");

    console.error(
      "[checkout] creation paiement echouee",
      JSON.stringify({
        at: new Date().toISOString(),
        code: railGratuitIndisponible ? "ZB087" : "paiement_insert",
        rail: railEffectif,
        order_id: order.id,
        message: payErr.message ?? "",
      })
    );

    if (railGratuitIndisponible) {
      return NextResponse.json(
        {
          error:
            t(lang, "api.free.closed"),
          code: "ZB087",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: t(lang, "api.payment.failed") },
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

  /* ── ACQUISITION GRATUITE (0087) ──────────────────────────────────────────
   *
   * Aucun opérateur n'est appelé : il n'y a rien à encaisser. On confirme
   * directement, par la MÊME fonction que tous les rails payants — commission
   * 0, escrow 0, commande `paid`, et l'accès au livrable s'ouvre par le chemin
   * ordinaire (`/api/download` exige `status = paid`).
   *
   * ⚠️ `p_amount: 0` N'EST PAS UNE FORMALITÉ, c'est le garde. `confirm_payment`
   * lève si `p_amount <> orders.amount_htg`. Si une commande non nulle
   * atteignait cette branche — par une régression de la condition ci-dessus,
   * par exemple — LA BASE la refuserait. Le contrôle est fail-closed et il
   * n'est pas dans cette route : c'est ce qui le rend digne de confiance.
   *
   * ⚠️ Et il ne peut pas être contourné par une remise : `prix_flash_htg > 0`
   * (0080) et `discount_percentage between 1 and 90` avec plancher à 10 HTG
   * (0021/0031, `lib/zabelie-coupons.ts`) rendent `amount_htg = 0`
   * atteignable UNIQUEMENT depuis un produit affiché à 0. Vérifié, pas supposé. */
  if (order.amount_htg === 0) {
    const { error: gratisErr } = await admin.rpc("confirm_payment", {
      p_idempotency_key: order.id,
      p_provider_ref: `gratis:${order.id}`,
      p_raw: {
        rail: RAIL_GRATIS,
        note: "produit affiche a 0 HTG — aucun mouvement de fonds",
        confirme_a: new Date().toISOString(),
      },
      p_amount: 0,
    });

    if (gratisErr) {
      /* Le cas le plus probable ici est que `0087` ne soit pas appliquée : la
         valeur d'énumération `gratis` manque et l'insertion du paiement a déjà
         échoué plus haut. On journalise le motif exact plutôt que de rendre un
         « échec » muet — sans cette ligne, « migration absente » et « fonction
         d'argent en panne » produisent le même silence. */
      console.error(
        "[gratis]",
        JSON.stringify({
          at: new Date().toISOString(),
          code: "ZB087",
          order_id: order.id,
          message: gratisErr.message,
        })
      );
      await admin.from("payments").delete().eq("order_id", order.id);
      await admin.from("orders").delete().eq("id", order.id);
      return NextResponse.json(
        { error: t(lang, "api.free.closed"), code: "ZB087" },
        { status: 503 }
      );
    }

    /* Suivi de remise — APRÈS `confirm_payment`, jamais avant : l'escrow
       n'existe pas encore et le gel ne toucherait aucune ligne (0043 §6 bis).
       Un produit gratuit se remet comme un autre : un fichier se télécharge,
       un service se rend. Ne rien ouvrir ici priverait l'acheteur du seul
       canal où réclamer, pour la seule raison qu'il n'a pas payé.
       ⚠️ Cet appel manquait à ma première écriture — c'est
       `tests/fulfillment-appelants.test.ts` qui l'a dit, pas moi. */
    const { ouvrirSuiviLivraison } = await import("@/lib/fulfillment");
    await ouvrirSuiviLivraison(admin, order.id, "checkout/gratis");

    // Pas de redirection opérateur : l'acheteur va directement à ses achats.
    return NextResponse.json({
      redirectUrl: "/mes-achats",
      orderId: order.id,
      gratuit: true,
    });
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
    const { redirectUrl, paymentToken, mode, gatewayHost } = await createPayment(
      order.id,
      order.amount_htg
    );
    /* ⚠️ LE MODE ET L'HÔTE SONT INSCRITS EN BASE, PAS SEULEMENT JOURNALISÉS.
     *
     * Cinq paiements ont échoué du 2026-08-11 au 2026-08-14 sur
     * `moncash_unknown_48h`, et rien en base ne permettait de distinguer
     * « le rail encaissait en bac à sable » de « l'acheteur a renoncé ». Il a
     * fallu qu'un humain clique et lise la barre d'adresse pour trancher —
     * confirmé le 2026-08-21 : c'était bien `sandbox`.
     *
     * Un journal Vercel s'efface et ne se croise avec rien. Une colonne se
     * requête, six semaines plus tard, sur les paiements qui ont échoué :
     *   select raw->>'moncash_mode', count(*) from payments group by 1;
     * C'est le corollaire d'observabilité du dépôt appliqué au rail d'argent :
     * l'absence de signal doit être un signal, et ici elle n'en était pas un. */
    await admin
      .from("payments")
      .update({
        raw: {
          payment_token: paymentToken,
          moncash_mode: mode,
          moncash_host: gatewayHost,
        },
      })
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
        error: t(lang, "api.operator.down"),
        code: "provider_unavailable",
      },
      { status: 502 }
    );
  }
}
