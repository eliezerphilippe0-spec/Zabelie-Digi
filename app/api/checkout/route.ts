import { recommendationAttribution } from "@/lib/product-offers";
import { offerAttribution } from "@/lib/product-offers-server";
import { getKobaraAvailability } from "@/lib/payment-availability";
import { cookies } from "next/headers";
import { readSellerPricing } from "@/lib/seller-pricing-server";
import { attributedSource, SALE_SOURCE_COOKIE } from "@/lib/sale-attribution";
import { configService } from "@/lib/supabase/config";
import { digitalProductIsClean } from "@/lib/digital-file-security";
import { normalizeRecipient } from "@/lib/order-recipient";
import { readPurchasePrice } from "@/lib/purchase-price";
import { NextResponse } from "next/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { requireActiveAccount } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isDownloadable, isDigitalKind, isTrackedStockKind, isProductKind } from "@/lib/product-kind";
import { createPayment, resolveMonCashMode } from "@/lib/moncash";
import { createStripeCheckout, isStripeEnabled } from "@/lib/stripe";
import { isZelleEnabled } from "@/lib/zelle";
import {
  createKobaraPayment,
  isKobaraEnabled,
  isKobaraProvider,
  kobaraCap,
  type KobaraProvider,
} from "@/lib/kobara";
import {
  railCap,
  usdCentsFromHtg,
  railCountry,
  persistPaymentSession,
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
import { normaliserNumeroHaiti } from "@/lib/rechaj";
import { attestationAgeValide, lireAgeMinimum } from "@/lib/age-minimum";
import { contexteGroupe } from "@/lib/panier-groupe-contexte";
import { checkoutOrderId, checkoutIntentHash, checkoutStockIsHeld, validCheckoutKey, validCheckoutOrderId, savedCheckoutRedirect } from "@/lib/checkout-idempotency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/checkout  { productId, checkoutKey (UUID v4), rail? }
 * rail ∈ 'moncash' (défaut) | 'stripe' | 'zelle' (rails diaspora, V-10).
 * Crée une commande + un paiement (pending, clé d'idempotence) puis renvoie
 * l'URL de redirection du rail. Aucune livraison/crédit ici : tout passe par la
 * confirmation serveur-à-serveur (return/webhook/réconciliateur/admin →
 * confirm_payment). Le LEDGER reste en HTG ; pour les rails USD, le montant
 * est figé ici (expected_usd_cents) et vérifié en base à la confirmation.
 */

const RAILS = ["moncash", "stripe", "zelle", "kobara"] as const;

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
  /* ⚠️ C'EST ICI QUE LE RAIL KOBARA EXISTE OU N'EXISTE PAS.
   *
   * Tant que `KOBARA_SECRET_KEY` et `KOBARA_WEBHOOK_SECRET` sont absentes de
   * l'environnement, un appelant qui réclame `rail: "kobara"` reçoit 422 —
   * exactement comme aujourd'hui, avant que ce code existe. Fusionner ce lot
   * n'ouvre donc rien : c'est la pose des variables dans Vercel qui ouvre,
   * et elle appartient au porteur (règle dure n°5).
   *
   * L'étape 0 de `docs/03` §9.1 reste incomplète sur deux points juridiques
   * (statut BRH, détention des fonds). Ce garde est ce qui rend le lot
   * fusionnable malgré cela, et il ne doit pas être affaibli en un
   * `return true` « en attendant ». */
  if (rail === "kobara") return isKobaraEnabled();
  return true; // moncash = rail MVP, toujours proposé
}

export async function POST(req: Request) {
  const lang = await getLang();
  let productId: string | undefined;
  let railInput: unknown;
  let couponInput: unknown;
  let variantInput: unknown;
  let quantityInput: unknown;
  let rechajInput: unknown;
  let recipientInput: unknown;
  let providerInput: unknown;
  let offerInput: unknown;
  let recommendationInput: unknown;
  let ageAttestationInput: unknown;
  let checkoutKeyInput: unknown;
  let recoveryOnlyInput: unknown;
  let orderIdInput: unknown;
  try {
    ({
      productId,
      rail: railInput,
      couponCode: couponInput,
      variantId: variantInput,
      quantity: quantityInput,
      rechajNumero: rechajInput,
      recipient: recipientInput,
      kobaraProvider: providerInput,
      offerId: offerInput,
      recommendationSource: recommendationInput,
      ageAttestation: ageAttestationInput,
      checkoutKey: checkoutKeyInput,
      recoveryOnly: recoveryOnlyInput,
      orderId: orderIdInput,
    } = await req.json());
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }
  if (!productId && !(recoveryOnlyInput === true && validCheckoutOrderId(orderIdInput))) {
    return NextResponse.json({ error: t(lang, "api.status.invalid") }, { status: 400 });
  }

  /* PANIER GROUPÉ (0128) : la route du panier appelle ce checkout article par
   * article. Le contexte n'existe QUE pour une requête construite par elle
   * (`lib/panier-groupe-contexte.ts`) ; le rail et l'opérateur viennent alors
   * du contexte, pas du corps. */
  const groupe = contexteGroupe(req);
  const rail: Rail = groupe
    ? groupe.rail
    : (RAILS as readonly string[]).includes(String(railInput ?? "moncash"))
      ? ((railInput ?? "moncash") as Rail)
      : "moncash";
  if (!railEnabled(rail)) {
    return NextResponse.json(
      { error: t(lang, "api.rail.unavailable") },
      { status: 422 }
    );
  }

  /* KOBARA — l'opérateur derrière la passerelle, validé AVANT toute création.
   *
   * ⚠️ Liste FERMÉE (`isKobaraProvider`), jamais un `String(x)` transmis tel
   * quel. Ce champ part vers un tiers dans le corps d'une requête POST : une
   * valeur libre y serait une injection de paramètre chez un prestataire dont
   * on ne contrôle pas la validation. Ce qui n'est pas dans la liste n'existe
   * pas.
   *
   * Le défaut est `natcash` parce que c'est la seule chose que ce rail apporte
   * qui n'existe pas déjà : MonCash a son rail DIRECT ici, sans intermédiaire
   * et sans frais de passerelle (`docs/03` §9.1). Router MonCash par Kobara
   * reste possible — le porteur l'a demandé explicitement — mais ce n'est pas
   * ce qui arrive quand personne ne choisit. */
  let kobaraProvider: KobaraProvider = groupe?.kobaraProvider ?? "natcash";
  if (rail === "kobara" && !groupe) {
    if (providerInput !== undefined && !isKobaraProvider(providerInput)) {
      return NextResponse.json(
        { error: t(lang, "api.rail.unavailable"), code: "kobara_provider_invalide" },
        { status: 422 }
      );
    }
    if (providerInput !== undefined) kobaraProvider = providerInput as KobaraProvider;
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
  const accountRefusal = await requireActiveAccount(user.id, { legalAcceptance: recoveryOnlyInput !== true });
  if (accountRefusal) return accountRefusal;

  const admin = createAdminClient();

  // Débit borné AVANT tout effet (consommation coupon, session MonCash/Stripe
  // payante) : 10 checkouts/min par compte suffisent largement à un humain.
  // En groupe, le débit est borné UNE fois par la route du panier : dix
  // articles ne sont pas dix tentatives.
  if (!groupe && !(await rateLimit(admin, `checkout:${user.id}`, 10))) {
    return NextResponse.json(
      { error: t(lang, "api.rate.limited") },
      { status: 429 }
    );
  }

  type ExistingOrder = { id: string; product_id: string; amount_htg: number; status: string; group_id?: string | null; coupon_id?: string | null; coupon_code?: string | null };
  type ExistingPayment = { status: string; rail: string; raw: Record<string, unknown> | null };
  const conflict = () => NextResponse.json(
    { error: t(lang, "api.order.failed"), code: "checkout_attempt_conflict" },
    { status: 409, headers: { "Cache-Control": "private, no-store" } }
  );
  // Recovery observes the original purchase before mutable catalogue/price,
  // coupon or age validation. It never creates an order, payment or session.
  const resume = async (existing: ExistingOrder, payment: ExistingPayment | null, kind?: unknown) => {
    if (productId && existing.product_id !== productId) return conflict();
    const complete = ["paid", "delivered", "cancelled", "refunded"].includes(existing.status) ||
      (payment?.status === "failed" && payment.raw?.checkout_preparation_failed === true);
    if (!payment && existing.status === "pending" && !existing.group_id) {
      let originalKind = kind;
      if (!originalKind) {
        const { data: originalProduct, error } = await admin.from("products").select("kind").eq("id", existing.product_id).maybeSingle();
        if (error || !originalProduct) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
        originalKind = originalProduct.kind;
      }
      if (!isProductKind(originalKind)) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
      // Orders have no original variant/quantity. Without a payment owner or
      // reservation, a physical intent cannot safely be reconstructed.
      if (!isTrackedStockKind(originalKind)) {
        return NextResponse.json({ orderId: existing.id, deja: true, checkoutState: "retryable", retryAllowed: true },
          { headers: { "Cache-Control": "private, no-store" } });
      }
    }
    let redirectUrl = complete ? "/mes-achats" : savedCheckoutRedirect(existing, payment);
    let checkoutState = complete ? "complete" : "review";
    if (existing.status === "pending" && !existing.group_id && payment?.status === "pending") {
      if (payment.rail === "zelle" && payment.raw?.checkout_prepared === true) redirectUrl = `/paiement/zelle/${existing.id}`;
      if (redirectUrl) {
        let originalKind = kind;
        if (!originalKind) {
          const { data: originalProduct, error } = await admin.from("products").select("kind").eq("id", existing.product_id).maybeSingle();
          if (error || !originalProduct) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
          originalKind = originalProduct.kind;
        }
        if (!isProductKind(originalKind)) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
        if (isTrackedStockKind(originalKind)) {
          const { data: reservations, error } = await admin.from("zabelie_stock_reservations")
            .select("status, expires_at").eq("order_id", existing.id);
          // Existing sessions from before this fix may already have released
          // stock. Never expose those URLs or silently reserve another unit.
          if (error) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
          if (!checkoutStockIsHeld(reservations)) redirectUrl = null;
        }
        checkoutState = redirectUrl ? "ready" : "review";
      } else checkoutState = payment.rail === "zelle" ? "review" : "pending";
    }
    return NextResponse.json({ redirectUrl: redirectUrl ?? (checkoutState === "pending" ? `/paiement/en-attente?commande=${existing.id}` : "/mes-achats"),
      orderId: existing.id, orderStatus: existing.status, paymentStatus: payment?.status ?? null, deja: true, checkoutState }, { headers: { "Cache-Control": "private, no-store" } });
  };
  if (recoveryOnlyInput === true) {
    if (groupe || (!validCheckoutKey(checkoutKeyInput) && !validCheckoutOrderId(orderIdInput))) {
      return NextResponse.json({ error: t(lang, "api.checkout.refresh"), code: "checkout_key_required" }, { status: 400 });
    }
    const id = validCheckoutKey(checkoutKeyInput) ? checkoutOrderId(user.id, checkoutKeyInput) : orderIdInput as string;
    const { data: existing, error } = await admin.from("orders").select("*").eq("id", id).eq("buyer_id", user.id).maybeSingle();
    if (error) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    if (!existing) return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
    if (productId && existing.product_id !== productId) return conflict();
    const { data: payment, error: paymentError } = await admin.from("payments").select("status, rail, raw").eq("order_id", existing.id).maybeSingle();
    if (paymentError) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    return resume(existing, payment);
  }

  // Produit publié uniquement, prix = source de vérité serveur. Le comptage
  // d'assets est EMBARQUÉ dans la même requête (audit : c'était un second
  // aller-retour séquentiel sur chaque checkout « fichier » — latence 3G).
  const { data: product, error: prodErr } = await admin
    .from("products")
    .select(
      "id, title, price_htg, status, seller_id, kind, category_id, product_assets(count)"
    )
    .eq("id", productId)
    .eq("status", "published")
    .single();

  if (prodErr || !product) {
    return NextResponse.json({ error: t(lang, "api.product.notfound") }, { status: 404 });
  }
  if (product.seller_id === user.id) {
    return NextResponse.json({ error: t(lang, "api.checkout.selfPurchase"), code: "self_purchase" }, { status: 422 });
  }

  const sellerRefusal = await requireActiveAccount(product.seller_id);
  if (sellerRefusal) return sellerRefusal;

  const recipient = recipientInput == null ? null : normalizeRecipient(recipientInput);
  if (recipientInput != null && (!recipient || !isTrackedStockKind(product.kind))) {
    return NextResponse.json({ error: t(lang, "recipient.invalid"), code: "recipient_invalid" }, { status: 422 });
  }

  /* ── RECHARGE : le numéro, AVANT que la commande existe (0099) ───────────
   *
   * L'ordre importe plus que le contrôle lui-même. Refuser après la création
   * de la commande laisserait une ligne `pending` orpheline à chaque saisie
   * fautive ; refuser après le paiement serait le cas que cette table existe
   * pour rendre impossible — de l'argent encaissé sur une recharge dont
   * personne ne connaît la cible.
   *
   * `category_id` est nul sur l'immense majorité des fiches : l'aller-retour
   * SQL n'a lieu que pour celles qui portent un sous-rayon. La question n'est
   * pas posée au libellé mais à l'ASCENDANCE (`zabelie_est_rechaj`), sinon une
   * fiche rangée trois niveaux plus bas y échapperait.
   */
  let rechajNumero: string | null = null;
  if (product.category_id) {
    const { data: estRechaj } = await admin.rpc("zabelie_est_rechaj", {
      p_product: product.id,
    });
    if (estRechaj === true) {
      rechajNumero = normaliserNumeroHaiti(rechajInput);
      if (!rechajNumero) {
        return NextResponse.json(
          { error: t(lang, "api.rechaj.numero"), code: "rechaj_numero_invalide" },
          { status: 422 }
        );
      }
    }
  }

  /* ── ÂGE MINIMUM (0115) : l'attestation, AVANT que la commande existe ─────
   *
   * Décision porteur du 2026-09-23 : 18 ans pour le clairin. Le seuil est lu
   * en base par l'ascendance du rayon, jamais déduit d'un slug ici. Même ordre
   * que la recharge, pour la même raison : refuser après la création laisserait
   * une commande `pending` orpheline à chaque case oubliée.
   *
   * Fail-closed : une base qui ne répond pas n'autorise pas la vente (503).
   * L'attestation est une DÉCLARATION de l'acheteur ; la vérification réelle
   * est celle du vendeur à la remise, pièce d'identité à l'appui (politique
   * §9). Ce garde garantit que la question a été posée et la réponse gardée.
   */
  const lectureAge = await lireAgeMinimum(admin, product.id, Boolean(product.category_id));
  if (!lectureAge.ok) {
    return NextResponse.json(
      { error: t(lang, "api.order.failed"), code: "age_indisponible" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const ageMinimum = lectureAge.age;
  if (ageMinimum > 0 && !attestationAgeValide(ageAttestationInput)) {
    return NextResponse.json(
      {
        error: t(lang, "api.age.required").replace("{age}", String(ageMinimum)),
        code: "age_attestation_requise",
        ageMinimum,
      },
      { status: 422 }
    );
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
    if (!(await digitalProductIsClean(admin, product.id))) {
      return NextResponse.json(
        { error: t(lang, "security.filePending"), code: "file_security_pending" },
        { status: 503, headers: { "Cache-Control": "private, no-store", "Retry-After": "300" } }
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
  // Un article gratuit ne s'encaisse pas : il n'a rien à faire dans un
  // paiement groupé (et `zabelie_group_seal` refuse un montant nul).
  if (groupe && estGratuit) {
    return NextResponse.json(
      { error: t(lang, "cart.group.free"), code: "groupe_gratuit" },
      { status: 422 }
    );
  }
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
        checkoutState: "complete",
      });
    }
  }

  const purchase = await readPurchasePrice(admin, product, variantInput, quantityInput);
  if (!purchase.ok) {
    return NextResponse.json({ error: t(lang, "api.variant.invalid"), code: purchase.code }, { status: purchase.code === "price_unavailable" ? 503 : 422 });
  }
  const variantId = purchase.variantId;
  const currentPriceHtg = purchase.priceHTG;
  let finalPriceHtg = currentPriceHtg;
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
    finalPriceHtg = flash.prixFlashHtg * purchase.quantity;
    discountHtg = currentPriceHtg - finalPriceHtg;
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

    finalPriceHtg = discountedPriceHtg(currentPriceHtg, coupon.percent);
    discountHtg = currentPriceHtg - finalPriceHtg;
    couponCode = code;
    couponId = coupon.id;
  }

  // Plafond du rail : on bloque AVANT de créer la commande (message clair plutôt
  // qu'un échec brutal côté opérateur). Pas de plafond connu pour Stripe/Zelle.
  /* UN SEUL PLAFOND S'APPLIQUE, et lequel dépend du rail.
   *
   * ⚠️ Deux contrôles empilés se contredisaient dans ma première écriture :
   * `RAIL_CAPS.kobara` vaut 20 000 (le plus bas des deux opérateurs), donc un
   * paiement MonCash de 22 000 HTG via la passerelle était refusé par le
   * contrôle de rail AVANT que le contrôle de provider, plus permissif, ait pu
   * l'admettre. Le second n'aurait jamais rien élargi — il aurait seulement
   * donné l'illusion d'une borne exacte.
   *
   * Pour `kobara`, la borne qui fait foi est donc celle de l'OPÉRATEUR choisi,
   * et elle est la seule consultée. `RAIL_CAPS.kobara` reste défini pour les
   * appelants qui raisonnent par rail sans connaître le provider (et il est
   * volontairement conservateur), mais ce chemin-ci n'en dépend pas.
   *
   * Le libellé nommait par ailleurs « MonCash » en dur — sans conséquence tant
   * que MonCash était le seul rail plafonné, faux dès qu'un second en a un. */
  const plafond = rail === "kobara" ? kobaraCap(kobaraProvider) : railCap(rail);
  const operateurPlafonne = rail === "kobara" ? kobaraProvider : rail;
  if (plafond !== null && finalPriceHtg > plafond) {
    return NextResponse.json(
      {
        error: `Montant supérieur au plafond ${operateurPlafonne} (${plafond} HTG) par transaction.`,
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

  // Only signed server attribution selects marketplace pricing.
  // Omit the column before migration for rolling deployment compatibility.
  let pricing;
  try { pricing = await readSellerPricing(admin); } catch {
    return NextResponse.json({ error: t(lang, "api.order.failed"), code: "pricing_unavailable" }, { status: 503 });
  }
  const source = pricing ? attributedSource((await cookies()).get(SALE_SOURCE_COOKIE)?.value, product.id, configService().key) : null;

  // A public retry must keep its attempt key. The orders primary key stops
  // concurrent submissions in Postgres before any second operator call.
  // Grouped orders already have their server-only group concurrency guard.
  if (!groupe && !validCheckoutKey(checkoutKeyInput)) {
    return NextResponse.json(
      { error: t(lang, "api.checkout.refresh"), code: "checkout_key_required" },
      { status: 400, headers: { "Cache-Control": "private, no-store" } }
    );
  }
  const attemptOrderId = groupe ? null : checkoutOrderId(user.id, checkoutKeyInput as string);
  const intentHash = checkoutIntentHash({ productId: product.id, variantId, quantity: purchase.quantity,
    amountHtg: finalPriceHtg, couponId, couponCode, rail: finalPriceHtg === 0 ? RAIL_GRATIS : rail,
    provider: rail === "kobara" ? kobaraProvider : null, recipient, recharge: rechajNumero, ageMinimum });
  const samePaymentIntent = (payment: ExistingPayment) =>
    payment.raw?.checkout_intent_hash === undefined || payment.raw.checkout_intent_hash === intentHash;
  let repairingMissingPayment = false;

  // Commande (pending).
  let { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      ...(attemptOrderId ? { id: attemptOrderId } : {}),
      buyer_id: user.id,
      product_id: product.id,
      // Panier groupé (0128) : rattachée au groupe, seulement par le contexte serveur.
      ...(groupe ? { group_id: groupe.groupId } : {}),
      ...offerAttribution(offerInput),
      ...recommendationAttribution(recommendationInput),
      ...(source ? { zabelie_sale_source: source } : {}),
      // Le signal réel/sandbox ne dépend pas de l'activation de la tarification vendeur.
      zabelie_payment_is_live: rail === "moncash" ? resolveMonCashMode(process.env.MONCASH_MODE).mode === "production"
          : rail === "kobara" ? getKobaraAvailability() === "production"
          : rail === "stripe" ? Boolean(process.env.STRIPE_SECRET_KEY?.trim().startsWith("sk_live_"))
          : isZelleEnabled(),
      amount_htg: finalPriceHtg, // prix remisé figé — tous les garde-fous s'y appliquent
      coupon_code: couponCode,
      coupon_id: couponId, // BL-133 : consommé par confirm_payment, pas ici
      discount_htg: discountHtg,
      status: "pending",
      // Langue de l'achat : la relance d'un paiement abandonné (0124) la reprend.
      zabelie_lang: lang,
    })
    .select("id, amount_htg")
    .single();

  if (orderErr?.code === "23505" && attemptOrderId) {
    const { data: existing, error: existingError } = await admin.from("orders")
      // group_id is present only after 0128. Keep it when available without
      // requiring that migration for individual checkout retries.
      .select("*").eq("id", attemptOrderId).eq("buyer_id", user.id).maybeSingle();
    if (existingError || !existing) {
      return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    }
    const { data: payment, error: paymentError } = await admin.from("payments")
      .select("status, rail, raw").eq("order_id", existing.id).maybeSingle();
    if (paymentError) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    if (existing.product_id !== productId) return conflict();
    if (payment && !samePaymentIntent(payment)) return conflict();
    if (payment || existing.status !== "pending" || existing.group_id) return resume(existing, payment, product.kind);
    // No payment exists: no operator could have been invoked. Reuse the
    // immutable digital snapshot and exact original price/coupon. Only the
    // winner of payments' UNIQUE insertion below may reserve/call a provider.
    if (existing.amount_htg !== finalPriceHtg || (existing.coupon_id ?? null) !== couponId ||
        (existing.coupon_code ?? null) !== couponCode) return conflict();
    if (isTrackedStockKind(product.kind)) return conflict();
    order = existing;
    orderErr = null;
    repairingMissingPayment = true;
  }

  if (orderErr?.code === "ZB112") {
    return NextResponse.json({ error: t(lang, "api.product.notfound"), code: "seller_unavailable" }, { status: 409 });
  }
  if (orderErr || !order) {
    return NextResponse.json(
      { error: t(lang, "api.order.failed") },
      { status: 500 }
    );
  }

  const matchingMetadata = async (table: string, expected: Record<string, unknown>) => {
    const { data, error } = await admin.from(table).select(Object.keys(expected).join(",")).eq("order_id", order.id).maybeSingle();
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return false;
    const saved = data as unknown as Record<string, unknown>;
    return Object.entries(expected).every(([field, value]) => saved[field] === value);
  };

  // A historical missing-payment repair may add metadata that never reached
  // the database, but cannot erase or change any already recorded intention.
  // Presence matters too: an omitted gift/target/age is not a matching value.
  if (repairingMissingPayment) {
    const metadata: [string, Record<string, unknown> | null][] = [
      ["zabelie_order_recipients", recipient],
      ["zabelie_rechaj_cible", rechajNumero ? { msisdn: rechajNumero } : null],
      ["zabelie_order_age_attestations", ageMinimum > 0 ? { age_minimum: ageMinimum } : null],
    ];
    const reads = await Promise.all(metadata.map(async ([table, expected]) => {
      const { data, error } = await admin.from(table).select("*").eq("order_id", order.id).maybeSingle();
      return { data, error, expected };
    }));
    if (reads.some(({ error }) => error)) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    if (reads.some(({ data, expected }) => data && (!expected || typeof data !== "object" || Array.isArray(data) ||
      !Object.entries(expected).every(([field, value]) => (data as unknown as Record<string, unknown>)[field] === value)))) return conflict();
  }

  // Paiement (pending). idempotency_key = order.id (1 paiement/commande).
  /* Le rail est DÉDUIT du montant relu en base, jamais du champ envoyé par
   * l'appelant : un client qui réclamerait `gratis` sur un produit payant
   * obtient `moncash`, et un client qui réclamerait `moncash` sur un produit à
   * 0 obtient `gratis`. Dans les deux sens, c'est le prix qui commande. */
  const railEffectif = order.amount_htg === 0 ? RAIL_GRATIS : rail;
  /* En groupe, seule la meneuse porte le vrai rail : c'est sur SA clé que
   * l'opérateur encaisse le total. Les autres sont en rail `groupe`, qu'aucun
   * réconciliateur ne réclame — elles se confirment par la meneuse (0128). */
  const railPaiement = groupe && !groupe.meneuse ? "groupe" : railEffectif;

  const { error: payErr } = await admin.from("payments").insert({
    order_id: order.id,
    rail: railPaiement,
    idempotency_key: order.id,
    status: "pending",
    expected_usd_cents: expectedUsdCents,
    raw: { checkout_intent_hash: intentHash, ...(rail === "kobara" ? { kobara_provider: kobaraProvider } : {}) },
  });
  if (payErr) {
    if (payErr.code === "23505") {
      // Another preparation won the payment key. Never delete its order,
      // private metadata or immutable snapshot, and never call its provider.
      const { data: payment, error } = await admin.from("payments").select("status, rail, raw").eq("order_id", order.id).maybeSingle();
      if (error || !payment) return NextResponse.json({ error: t(lang, "api.payment.failed") }, { status: 503 });
      const { data: currentOrder, error: currentError } = await admin.from("orders").select("*").eq("id", order.id).eq("buyer_id", user.id).maybeSingle();
      if (currentError || !currentOrder) return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
      if (!samePaymentIntent(payment)) return conflict();
      return resume(currentOrder, payment, product.kind);
    }
    // Preserve the order/snapshot. A later validated retry can claim its
    // missing payment. A transport error may have committed the INSERT, so
    // do not delete anything or infer that an existing payment is absent.

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

  // Only the UNIQUE payment owner reaches private writes. No external
  // payment may start until every required detail has been persisted.
  if (recipient) {
    const { error: recipientError } = await admin.from("zabelie_order_recipients").insert({ order_id: order.id, ...recipient });
    if (recipientError && (recipientError.code !== "23505" || !(await matchingMetadata("zabelie_order_recipients", recipient)))) {
      console.error("[checkout] recipient save failed", { code: recipientError.code });
      return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 503 });
    }
  }

  /* La cible de recharge, AVANT l’opérateur et sans best-effort (0099).
   *
   * Ce n'est pas l'affiliation : un cookie d'affiliation cassé fait perdre une
   * commission, une cible manquante fait encaisser une commande indélivrable.
   * Un échec refuse le paiement. L'ordre reste reprenable : le supprimer
   * détruirait le snapshot acquis ou le travail d'une reprise concurrente.
   *
   * La contrainte `check` de la table est le second garde. Si elle refuse la
   * valeur, c'est que `normaliserNumeroHaiti` a laissé passer quelque chose —
   * on préfère le 500 bruyant au numéro faux écrit en silence. */
  if (rechajNumero) {
    const { error: cibleErr } = await admin
      .from("zabelie_rechaj_cible")
      .insert({ order_id: order.id, msisdn: rechajNumero });
    if (cibleErr && (cibleErr.code !== "23505" || !(await matchingMetadata("zabelie_rechaj_cible", { msisdn: rechajNumero })))) {
      console.error("[checkout] cible rechaj refusée", {
        orderId: order.id,
        code: cibleErr.code,
      });
      return NextResponse.json(
        { error: t(lang, "api.order.failed") },
        { status: 500 }
      );
    }
  }

  /* L'attestation d'âge, AVANT l’opérateur et sans best-effort (0115).
   *
   * Une commande restreinte sans trace de l'attestation serait une vente dont
   * personne ne peut dire que la question a été posée. Même traitement que la
   * cible de recharge : l'échec interdit tout démarrage de paiement. */
  if (ageMinimum > 0) {
    const { error: ageErr } = await admin
      .from("zabelie_order_age_attestations")
      .insert({ order_id: order.id, age_minimum: ageMinimum });
    if (ageErr && (ageErr.code !== "23505" || !(await matchingMetadata("zabelie_order_age_attestations", { age_minimum: ageMinimum })))) {
      console.error("[checkout] attestation d'age refusee", {
        orderId: order.id,
        code: ageErr.code,
      });
      return NextResponse.json(
        { error: t(lang, "api.order.failed") },
        { status: 500 }
      );
    }
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

  // Produit PHYSIQUE : réservation ATOMIQUE du stock (0036). Le stock est pris
  // ici, à la commande — pas à la livraison : deux acheteurs ne peuvent pas
  // acheter la même unité. La réservation expire seule (TTL 30 min) si le
  // paiement n'aboutit pas.
  if (variantId) {
    const qty = purchase.quantity;
    const { data: reservation, error: resErr } = await admin.rpc(
      "zabelie_reserve_stock",
      { p_variant_id: variantId, p_order_id: order.id, p_quantity: qty }
    );
    if (resErr || !reservation?.ok) {
      // Nothing has reached an operator. Mark this preparation terminal
      // rather than delete a key a concurrent retry might already be reading.
      await admin.from("payments").update({ status: "failed", raw: { checkout_intent_hash: intentHash, checkout_preparation_failed: true, reason: reservation?.reason ?? "stock_unavailable" } })
        .eq("order_id", order.id).eq("status", "pending");
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

  /* PANIER GROUPÉ : la commande et son paiement existent, le stock est pris.
   * L'opérateur sera appelé UNE fois, par la route du panier, pour le total
   * scellé en base. Rien d'autre ici. */
  if (groupe) {
    return NextResponse.json({ orderId: order.id, amountHtg: order.amount_htg });
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
      checkoutState: "complete",
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
      await persistPaymentSession(admin, order.id, { checkout_intent_hash: intentHash, stripe_session_id: sessionId, checkout_redirect_url: redirectUrl });
      return NextResponse.json({ redirectUrl, orderId: order.id, checkoutState: "ready" });
    }

    if (rail === "zelle") {
      // Pas d'API Zelle : page d'instructions (mémo + montant), confirmation
      // administrative ensuite — même confirm_payment idempotent.
      // A pending claim alone proves neither metadata nor stock preparation.
      await persistPaymentSession(admin, order.id, { checkout_intent_hash: intentHash, checkout_prepared: true });
      return NextResponse.json({
        redirectUrl: `/paiement/zelle/${order.id}`,
        orderId: order.id,
        checkoutState: "ready",
      });
    }

    if (rail === "kobara") {
      /* Passerelle tierce : session créée avec `Idempotency-Key = order.id`,
       * confirmation par webhook SIGNÉ uniquement (`/api/kobara/webhook`).
       * Le montant envoyé est `order.amount_htg` relu en base — jamais un
       * montant venu du client. */
      const session = await createKobaraPayment({
        orderId: order.id,
        amountHtg: order.amount_htg,
        provider: kobaraProvider,
        description: product.title,
      });
      /* Le MODE et sa SOURCE sont inscrits en base, pas seulement journalisés.
       *
       * C'est la leçon de MonCash reprise telle quelle : cinq paiements ont
       * échoué du 2026-08-11 au 2026-08-14 sans que rien en base ne permette
       * de distinguer « le rail encaissait en bac à sable » de « l'acheteur a
       * renoncé ». Il avait fallu qu'un humain clique et lise la barre
       * d'adresse. `mode_source = "invalide"` dit en plus qu'une valeur
       * malformée a été écrite dans Vercel — un espace de fin collé depuis un
       * presse-papier, par exemple.
       *
       *   select raw->>'kobara_mode', raw->>'kobara_mode_source', count(*)
       *     from payments where rail = 'kobara' group by 1, 2; */
      await persistPaymentSession(admin, order.id, {
        checkout_intent_hash: intentHash,
        kobara_payment_id: session.id,
        kobara_provider: kobaraProvider,
        kobara_mode: session.mode,
        kobara_mode_source: session.modeSource,
        checkout_redirect_url: session.redirectUrl,
      });
      return NextResponse.json({ redirectUrl: session.redirectUrl, orderId: order.id, checkoutState: "ready" });
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
    await persistPaymentSession(admin, order.id, {
      checkout_intent_hash: intentHash,
      payment_token: paymentToken,
      moncash_mode: mode,
      moncash_host: gatewayHost,
      checkout_redirect_url: redirectUrl,
    });

    return NextResponse.json({ redirectUrl, orderId: order.id, checkoutState: "ready" });
  } catch (e) {
    // BL-114 (C-3, pattern erreurs typées façon Stripe) : le détail opérateur
    // (statut HTTP, corps brut MonCash) reste dans les logs serveur — jamais
    // renvoyé au client (fuite d'infos + intraduisible FR/KR).
    console.error("checkout: échec opérateur", e);
    // Creation or persistence can lose their response after committing.
    // Keep the reservation for this possibly payable session; only formal
    // provider expiry/reconciliation or the stock TTL may release it.
    return NextResponse.json(
      {
        error: t(lang, "api.operator.down"),
        code: "provider_unavailable",
        orderId: order.id,
        checkoutState: "pending",
      },
      { status: 502 }
    );
  }
}
