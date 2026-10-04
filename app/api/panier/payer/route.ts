import { NextResponse } from "next/server";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAccount } from "@/lib/auth";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { createPayment, resolveMonCashMode } from "@/lib/moncash";
import { createStripeCheckout, isStripeEnabled } from "@/lib/stripe";
import { createKobaraPayment, isKobaraEnabled, isKobaraProvider, kobaraCap, type KobaraProvider } from "@/lib/kobara";
import { railCap } from "@/lib/payment-utils";
import { couponApplies, normalizeCouponCode, type CouponRow } from "@/lib/zabelie-coupons";
import { inscrireContexteGroupe } from "@/lib/panier-groupe-contexte";
import { POST as checkoutArticle } from "@/app/api/checkout/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/panier/payer  { rail, kobaraProvider?, couponCode?, ageAttestation? }
 *
 * PAIEMENT GROUPÉ DU PANIER (0128) — un seul paiement pour plusieurs vendeurs.
 *
 * Le montage, et pourquoi il ne touche à aucune fonction d'argent :
 *
 *   1. un groupe est ouvert en base (`zabelie_group_create`, refusé tant que
 *      `zabelie_panier_config.paiement_groupe` est faux) ;
 *   2. CHAQUE article passe par le checkout EXISTANT, celui d'un produit
 *      unique — prix relu en base, coupon, flash, stock, âge, affiliation :
 *      rien n'est réécrit ici. Le premier article est la commande MENEUSE ;
 *   3. le groupe est scellé (`zabelie_group_seal`) : le total est figé
 *      DEPUIS LA BASE, jamais additionné ici ;
 *   4. l'opérateur est appelé UNE fois, sur la clé de la meneuse, pour ce
 *      total. Sa confirmation passe par les routes de retour, webhooks et
 *      réconciliateurs INCHANGÉS : `confirm_payment` reconnaît la meneuse et
 *      confirme chaque commande avec son propre montant.
 *
 * Tout échec avant l'opérateur ABANDONNE le groupe (`zabelie_group_abort`) :
 * commandes annulées, stock relâché. Aucune commande ne reste à mi-chemin.
 *
 * Aucun frais de plateforme : chaque commande garde sa commission ordinaire,
 * le groupement ne coûte rien de plus à personne (décision porteur).
 */

const RAILS_GROUPE = ["moncash", "kobara", "stripe"] as const;
type RailGroupe = (typeof RAILS_GROUPE)[number];

function railOuvert(rail: RailGroupe): boolean {
  if (rail === "stripe") return isStripeEnabled();
  if (rail === "kobara") return isKobaraEnabled();
  return true;
}

export async function POST(req: Request) {
  const lang = await getLang();
  let body: { rail?: unknown; kobaraProvider?: unknown; couponCode?: unknown; ageAttestation?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: t(lang, "api.json.invalid") }, { status: 400 });
  }

  const rail = String(body.rail ?? "moncash") as RailGroupe;
  if (!(RAILS_GROUPE as readonly string[]).includes(rail) || !railOuvert(rail)) {
    return NextResponse.json({ error: t(lang, "api.rail.unavailable") }, { status: 422 });
  }
  let kobaraProvider: KobaraProvider = "natcash";
  if (rail === "kobara" && body.kobaraProvider !== undefined) {
    if (!isKobaraProvider(body.kobaraProvider)) {
      return NextResponse.json({ error: t(lang, "api.rail.unavailable"), code: "kobara_provider_invalide" }, { status: 422 });
    }
    kobaraProvider = body.kobaraProvider as KobaraProvider;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: t(lang, "api.auth.required") }, { status: 401 });
  }
  const refus = await requireActiveAccount(user.id);
  if (refus) return refus;

  const admin = createAdminClient();
  if (!(await rateLimit(admin, `panier-payer:${user.id}`, 5))) {
    return NextResponse.json({ error: t(lang, "api.rate.limited") }, { status: 429 });
  }

  // Le drapeau, lu en base à chaque appel. Illisible = fermé.
  const { data: config, error: configErr } = await admin
    .from("zabelie_panier_config")
    .select("paiement_groupe, max_articles")
    .maybeSingle();
  if (configErr || !config || config.paiement_groupe !== true) {
    return NextResponse.json({ error: t(lang, "cart.pay.all.closed"), code: "panier_groupe_ferme" }, { status: 409 });
  }

  // Le panier, par le CLIENT DE SESSION : la RLS de 0058 ne rend que le sien.
  const { data: lignes, error: panierErr } = await supabase
    .from("zabelie_cart_items")
    .select("product_id, added_at, product:products(seller_id, title)")
    .order("added_at", { ascending: true });
  if (panierErr) {
    return NextResponse.json({ error: t(lang, "error.generic") }, { status: 503 });
  }
  type Ligne = { product_id: string; product: { seller_id: string; title: string } | null };
  const articles = ((lignes ?? []) as unknown as Ligne[]).filter((l) => l.product);
  if (articles.length < 2 || articles.length > config.max_articles) {
    return NextResponse.json(
      { error: t(lang, "cart.pay.all.count", { max: String(config.max_articles) }), code: "panier_taille" },
      { status: 422 }
    );
  }

  /* Le code promo ne vaut que pour les articles de SON vendeur (décision
   * porteur) : on le transmet aux seuls articles auxquels il s'applique, et le
   * checkout de chacun le revalide. Un code qui ne s'applique à rien est un
   * refus clair, jamais un paiement au prix plein en silence. */
  const couponPour = new Set<string>();
  let codePromo: string | null = null;
  if (typeof body.couponCode === "string" && body.couponCode.trim()) {
    codePromo = normalizeCouponCode(body.couponCode);
    const vendeurs = [...new Set(articles.map((a) => a.product!.seller_id))];
    const { data: coupons } = codePromo
      ? await admin
          .from("zabelie_coupons")
          .select("id, seller_id, product_id, percent, max_uses, uses, expires_at, active")
          .eq("code", codePromo)
          .in("seller_id", vendeurs)
      : { data: null };
    for (const a of articles) {
      const c = (coupons ?? []).find((r: CouponRow) => r.seller_id === a.product!.seller_id);
      if (c && couponApplies(c as CouponRow, a.product_id, a.product!.seller_id)) couponPour.add(a.product_id);
    }
    if (couponPour.size === 0) {
      return NextResponse.json({ error: t(lang, "api.coupon.invalid"), code: "coupon_invalid" }, { status: 422 });
    }
  }

  const { data: groupId, error: groupeErr } = await admin.rpc("zabelie_group_create", {
    p_buyer: user.id,
    p_rail: rail,
  });
  if (groupeErr || typeof groupId !== "string") {
    console.error("[panier/payer] groupe non ouvert", groupeErr?.message);
    return NextResponse.json({ error: t(lang, "cart.pay.all.closed"), code: "panier_groupe_ferme" }, { status: 409 });
  }

  const abandonner = () =>
    admin.rpc("zabelie_group_abort", { p_group: groupId }).then(undefined, () => undefined);

  // Chaque article par le checkout existant. Le premier est la meneuse.
  const entetes = new Headers(req.headers);
  entetes.delete("content-length");
  entetes.set("content-type", "application/json");
  for (const [i, a] of articles.entries()) {
    const requete = inscrireContexteGroupe(
      new Request(new URL("/api/checkout", req.url), {
        method: "POST",
        headers: entetes,
        body: JSON.stringify({
          productId: a.product_id,
          ...(couponPour.has(a.product_id) ? { couponCode: codePromo } : {}),
          ...(body.ageAttestation === true ? { ageAttestation: true } : {}),
        }),
      }),
      { groupId, meneuse: i === 0, rail, kobaraProvider }
    );
    const res = await checkoutArticle(requete);
    if (!res.ok) {
      await abandonner();
      const detail = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // L'article qui bloque est NOMMÉ : « paiement impossible » sur un panier
      // de six articles ne dit pas lequel retirer.
      const raison = typeof detail.error === "string" ? detail.error : t(lang, "api.order.failed");
      return NextResponse.json(
        { ...detail, error: t(lang, "cart.pay.all.blocked", { title: a.product!.title, raison }), productId: a.product_id },
        { status: res.status }
      );
    }
  }

  const { data: scelle, error: scelleErr } = await admin.rpc("zabelie_group_seal", { p_group: groupId });
  if (scelleErr || !scelle) {
    await abandonner();
    console.error("[panier/payer] scellement refusé", scelleErr?.message);
    return NextResponse.json({ error: t(lang, "api.order.failed") }, { status: 500 });
  }
  const meneuse = String(scelle.leader_order_id);
  const totalHtg = Number(scelle.total_htg);
  const usdCents = scelle.expected_usd_cents == null ? null : Number(scelle.expected_usd_cents);

  // Le plafond de l'opérateur porte sur ce qu'il encaisse : le TOTAL.
  const plafond = rail === "kobara" ? kobaraCap(kobaraProvider) : railCap(rail);
  if (plafond !== null && totalHtg > plafond) {
    await abandonner();
    return NextResponse.json(
      { error: t(lang, "cart.pay.all.cap", { cap: String(plafond) }), code: "plafond_rail" },
      { status: 422 }
    );
  }

  const titre = t(lang, "cart.pay.all.label", { n: String(articles.length) });
  try {
    if (rail === "stripe") {
      if (usdCents === null) throw new Error("montant USD absent");
      const { redirectUrl, sessionId } = await createStripeCheckout({ orderId: meneuse, usdCents, productTitle: titre });
      await admin.from("payments").update({ raw: { stripe_session_id: sessionId, groupe: groupId } }).eq("order_id", meneuse);
      return NextResponse.json({ redirectUrl, orderId: meneuse, groupId });
    }
    if (rail === "kobara") {
      const session = await createKobaraPayment({ orderId: meneuse, amountHtg: totalHtg, provider: kobaraProvider, description: titre });
      const { error: persistance } = await admin
        .from("payments")
        .update({
          raw: {
            kobara_payment_id: session.id,
            kobara_provider: kobaraProvider,
            kobara_mode: session.mode,
            kobara_mode_source: session.modeSource,
            groupe: groupId,
          },
        })
        .eq("order_id", meneuse);
      if (persistance) throw new Error("Kobara : session non enregistree.");
      return NextResponse.json({ redirectUrl: session.redirectUrl, orderId: meneuse, groupId });
    }
    const { redirectUrl, paymentToken, mode, gatewayHost } = await createPayment(meneuse, totalHtg);
    await admin
      .from("payments")
      .update({ raw: { payment_token: paymentToken, moncash_mode: mode, moncash_host: gatewayHost, groupe: groupId } })
      .eq("order_id", meneuse);
    return NextResponse.json({ redirectUrl, orderId: meneuse, groupId });
  } catch (e) {
    console.error("[panier/payer] échec opérateur", e instanceof Error ? e.message : "inconnu", {
      mode: rail === "moncash" ? resolveMonCashMode(process.env.MONCASH_MODE).mode : rail,
    });
    await abandonner();
    return NextResponse.json({ error: t(lang, "api.operator.down"), code: "provider_unavailable" }, { status: 502 });
  }
}
