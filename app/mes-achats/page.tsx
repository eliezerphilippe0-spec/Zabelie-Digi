import { RecipientDetails } from "@/components/recipient-details";
import type { OrderRecipient } from "@/lib/order-recipient";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { ReviewForm } from "@/components/review-form";
import { FulfillmentAction } from "@/components/fulfillment-actions";
import { getReviewedOrderIds } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG, type ProductKind } from "@/lib/sample-data";
import { isDownloadable, pickByKind } from "@/lib/product-kind";
import { isMissingColumn } from "@/lib/products";
import { cleEtatRemise, estEtatRemise, lireLimiteRemise, type EtatRemise } from "@/lib/fulfillment";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang, type I18nKey } from "@/lib/i18n";

/**
 * Où en est la remise, pour un produit qui ne se télécharge PAS.
 * Rien n'est promis au nom de Zabelie : la plateforme ne livre pas.
 */
function remiseLabel(kind: ProductKind | undefined, lang: Lang): string | null {
  if (!kind) return null;
  /* ⚠️ C'ÉTAIT DU FRANÇAIS EN DUR, dans une application kreyòl-first à quatre
   * langues — trouvé le 2026-08-27 en analysant les pages. Un acheteur kreyòl
   * lisait « Remise à convenir avec le vendeur » sur SA page d'achats.
   * Les clés sont les mêmes que celles des groupes du panier : un seul
   * vocabulaire pour la remise, deux écrans. */
  const cle = pickByKind<I18nKey | null>(kind, {
    file: null,
    service: "purchases.mode.service",
    physical: "purchases.mode.physical",
  });
  return cle ? t(lang, cle) : null;
}

import { PURCHASE_PAGE_SIZE, PURCHASE_VIEWS, purchaseView, purchaseKind, purchasePage, purchaseHref, purchaseIsConfirmed, purchaseStatusKey, purchaseViewKeys } from "@/lib/purchase-center";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes achats — Zabelie", robots: { index: false, follow: false } };

type OrderRow = {
  id: string;
  /** null tant que la migration 0042 n'est pas appliquée (code avant schéma). */
  order_ref: string | null;
  status: string;
  amount_htg: number;
  created_at: string;
  product: { title: string; slug: string; kind: ProductKind } | null;
};

async function Shell({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{t(lang, "purchases.title")}</h1>
        <p className="mt-3 max-w-2xl text-sm text-mist">{t(lang, "purchases.intro")}</p>
        {children}
        <Link href="/aide#probleme" className="mt-6 inline-flex min-h-11 items-center text-sm text-mist underline hover:text-cloud">
          {t(lang, "aide.problem.title")}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function MesAchatsPage({ searchParams }: {
  searchParams: Promise<{ vue?: string | string[]; page?: string | string[] }>;
}) {
  const [params, lang] = await Promise.all([searchParams, getLang()]);
  const view = purchaseView(params.vue);
  const page = purchasePage(params.page);
  const kind = purchaseKind(view);
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <p className="mt-4 text-sm text-mist">
          {t(lang, "purchases.unavailable")}
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // i18n (revue 2026-08-10, UX-03) : ce mur est la destination du bouton
    // le plus visible de l'en-tête — il était écrit en dur en français, servi
    // tel quel à un visiteur kreyòl. La dette du reste de la page (libellés
    // de commandes) est au registre OPS_TODO ; ce bloc-ci est le premier
    // écran que voit un anonyme, il ne pouvait pas attendre.
    const langAnon = await getLang();
    return (
      <Shell>
        <p className="mt-4 text-sm text-mist">{t(langAnon, "purchases.login.b")}</p>
        <Link
          href={`/connexion?next=${encodeURIComponent(purchaseHref(view, page))}`}
          className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
        >
          {t(langAnon, "nav.login")}
        </Link>
      </Shell>
    );
  }

  // Session client + explicit buyer scope. Filter before pagination; keep
  // archived/inaccessible product joins in the complete order history.
  const buyerId = user.id;
  // Archived/draft products must remain visible inside the authenticated buyer’s history.
  // Every service-role query below is explicitly scoped to this verified buyer id.
  const orderReader = createAdminClient();
  function queryOrders(withReference: boolean) {
    const relation = kind ? "product:products!inner(title, slug, kind)" : "product:products(title, slug, kind)";
    let query = orderReader.from("orders")
      .select(`id, ${withReference ? "order_ref," : ""} status, amount_htg, created_at, ${relation}`)
      .eq("buyer_id", buyerId);
    if (kind) query = query.eq("product.kind", kind);
    return query.order("created_at", { ascending: false }).order("id", { ascending: false })
      .range((page - 1) * PURCHASE_PAGE_SIZE, page * PURCHASE_PAGE_SIZE);
  }
  let result = await queryOrders(true);
  if (isMissingColumn(result.error)) result = await queryOrders(false);
  if (result.error) {
    console.error("[purchases] order history unavailable", { code: result.error.code });
    return <Shell><div role="alert" className="mt-6 rounded-2xl border border-line p-5">
      <p>{t(lang, "purchases.load.error")}</p>
      <Link href={purchaseHref(view, page)} className="mt-3 inline-flex min-h-11 items-center underline">{t(lang, "purchases.retry")}</Link>
    </div></Shell>;
  }
  const allRows = (result.data ?? []) as unknown as OrderRow[];
  const hasNext = allRows.length > PURCHASE_PAGE_SIZE;
  const orders = allRows.slice(0, PURCHASE_PAGE_SIZE);
  const reviewed = await getReviewedOrderIds(orders.filter((o) => purchaseIsConfirmed(o.status)).map((o) => o.id));

  const { data: recipients, error: recipientReadError } = orders.length
    ? await supabase.from("zabelie_order_recipients").select("order_id,full_name,phone,locality,note").in("order_id", orders.map(o => o.id))
    : { data: [], error: null };
  const recipientByOrder = new Map((recipients ?? []).map(r => [r.order_id, r as OrderRecipient]));

  /* ── Suivi de remise (0043) ───────────────────────────────────────────────
   * Lu avec le client de SESSION : la RLS de `zabelie_fulfillment` n'ouvre la
   * ligne qu'à l'acheteur de la commande et au vendeur du produit. Aucun
   * service role ici — ce serait contourner la garantie qu'on vient d'écrire.
   *
   * La requête se dégrade si la table n'existe pas : même règle que le repli
   * `order_ref` ci-dessus, le code peut devancer le schéma sur une base en
   * retard (Preview, base de développement), et une page d'achats ne tombe pas
   * pour un suivi absent. */
  type SuiviRow = {
    order_id: string;
    status: EtatRemise;
    shipped_at: string | null;
    shipment_note: string | null;
  };
  let suivis = new Map<string, SuiviRow>();
  if (orders.length > 0) {
    const { data: suiviData } = await supabase
      .from("zabelie_fulfillment")
      .select("order_id, status, shipped_at, shipment_note")
      .in(
        "order_id",
        orders.map((o) => o.id)
      );
    suivis = new Map(
      ((suiviData ?? []) as unknown as SuiviRow[])
        .filter((s) => estEtatRemise(s.status))
        .map((s) => [s.order_id, s])
    );
  }

  // Le délai d'auto-réception vit dans une table révoquée au navigateur : seul
  // le service role la lit, et UNIQUEMENT pour cet entier — aucune requête sur
  // des données d'utilisateur ne passe par ce client ici.
  const joursReception =
    suivis.size > 0
      ? await lireLimiteRemise(createAdminClient(), "auto_receive_days", 7)
      : 7;

  function blocRemise(suivi: SuiviRow | undefined, lg: Lang) {
    if (!suivi) return null;
    const echeance =
      suivi.status === "shipped" && suivi.shipped_at
        ? new Date(
            new Date(suivi.shipped_at).getTime() + joursReception * 86_400_000
          ).toLocaleDateString("fr-HT")
        : null;
    return (
      <div className="mt-1 flex flex-col items-end gap-1">
        <span className="text-xs text-mist">{t(lg, cleEtatRemise(suivi.status))}</span>
        {suivi.shipment_note && (
          <span className="max-w-xs text-right text-[11px] text-mist">
            {t(lg, "ship.note", { note: suivi.shipment_note })}
          </span>
        )}
        {echeance && (
          <span className="max-w-xs text-right text-[11px] text-mist">
            {t(lg, "ship.deadline", { date: echeance })}
          </span>
        )}
        {/* Les deux gestes n'existent QU'À l'état `shipped` — et le second doit
            exister AVANT l'échéance : sans lui, la seule protection de
            l'acheteur serait de ne rien faire, or ne rien faire est le geste
            qui paie le vendeur. */}
        {suivi.status === "shipped" && (
          <div className="flex flex-col items-end gap-2">
            <FulfillmentAction
              orderId={suivi.order_id}
              variante="received"
              labels={{
                cta: t(lg, "ship.received.cta"),
                erreur: t(lg, "ship.error.generic"),
                reseau: t(lg, "error.network"),
              }}
            />
            <FulfillmentAction
              orderId={suivi.order_id}
              variante="notReceived"
              labels={{
                cta: t(lg, "ship.notreceived.cta"),
                placeholder: t(lg, "ship.notreceived.ph"),
                erreur: t(lg, "ship.error.generic"),
                reseau: t(lg, "error.network"),
              }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Shell>
      <nav aria-label={t(lang, "purchases.views")} className="mt-8 flex flex-wrap gap-2">
        {PURCHASE_VIEWS.map((v) => <Link key={v} href={purchaseHref(v)} aria-current={v === view ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${v === view ? "border-brand bg-brand text-on-brand" : "border-line text-mist hover:text-cloud"}`}>
          {t(lang, purchaseViewKeys[v])}
        </Link>)}
      </nav>
      {view === "numerique" && <p className="mt-4 text-sm text-mist">{t(lang, "purchases.library.hint")}</p>}
      {orders.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line p-6">
          <p className="text-sm text-mist">{t(lang, page > 1 ? "purchases.page.empty" : "purchases.empty")}</p>
          <Link href={page > 1 ? purchaseHref(view) : "/catalogue"} className="mt-3 inline-flex min-h-11 items-center text-cloud underline">
            {t(lang, page > 1 ? "purchases.first" : "purchases.empty.cta")}
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-4">
          {orders.map((o) => {
            const confirmed = purchaseIsConfirmed(o.status);
            return <li key={o.id} className="rounded-2xl border border-line bg-surface/60 p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 text-xs text-mist">
                <span>{new Date(o.created_at).toLocaleDateString(lang === "ht" ? "fr-HT" : lang)} · <span className="numeric select-all">{o.order_ref || o.id}</span></span>
                <span className={`rounded-full border border-line px-3 py-1 font-semibold ${confirmed ? "text-success-text" : "text-mist"}`}>{t(lang, purchaseStatusKey(o.status))}</span>
              </div>
              <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div className="min-w-0">
                  <p className="break-words font-semibold">{o.product?.title ?? t(lang, "purchases.product.unavailable")}</p>
                  <p className="numeric mt-2 text-sm text-mist">{formatHTG(o.amount_htg)}</p>
                  {o.product && <Link href={`/produit/${o.product.slug}#contacter-vendeur`} className="mt-2 inline-flex min-h-11 items-center text-sm underline">{t(lang, "purchases.product.open")}</Link>}
                  {recipientByOrder.has(o.id) && <RecipientDetails recipient={recipientByOrder.get(o.id)!} lang={lang}/>}
                  {recipientReadError && <p className="mt-2 text-xs text-mist">{t(lang, "recipient.unavailable")}</p>}
                  {o.status === "pending" && <p className="mt-2 max-w-lg text-sm text-mist">{t(lang, "purchases.pending.hint")}</p>}
                  <Link href="/aide#probleme" className="block w-fit py-3 text-xs text-mist underline">{t(lang, "purchases.help")}</Link>
                </div>
                <div className="flex flex-col items-start gap-3 sm:items-end">
                  {confirmed && (o.product && isDownloadable(o.product.kind) ? (
                    <Link href={`/mes-achats/${o.id}`} className="inline-flex min-h-11 items-center rounded-xl bg-brand px-5 py-2 font-semibold text-on-brand">{t(lang, "studio.open")}</Link>
                  ) : suivis.has(o.id) ? blocRemise(suivis.get(o.id), lang) : remiseLabel(o.product?.kind, lang) && (
                    <span className="text-sm text-mist">{remiseLabel(o.product?.kind, lang)}</span>
                  ))}
                  {confirmed && (reviewed.has(o.id) ? (
                    <span className="text-xs text-success-text">{t(lang, "order.reviewed")}</span>
                  ) : (
                    <ReviewForm orderId={o.id} labels={{ cta: t(lang, "purchases.review"), success: t(lang, "purchases.review.success"), error: t(lang, "error.generic"), network: t(lang, "error.network"), stars: t(lang, "purchases.review.stars"), placeholder: t(lang, "purchases.review.placeholder"), submit: t(lang, "purchases.review.submit"), cancel: t(lang, "purchases.review.cancel") }} />
                  ))}
                </div>
              </div>
            </li>;
          })}
        </ul>
      )}
      {(page > 1 || hasNext) && <nav aria-label={t(lang, "purchases.pages")} className="mt-6 flex items-center justify-between gap-4">
        {page > 1 ? <Link href={purchaseHref(view, page - 1)} className="inline-flex min-h-11 items-center underline">{t(lang, "purchases.previous")}</Link> : <span />}
        <span className="text-sm text-mist">{t(lang, "purchases.page", { page: String(page) })}</span>
        {hasNext && <Link href={purchaseHref(view, page + 1)} className="inline-flex min-h-11 items-center underline">{t(lang, "purchases.next")}</Link>}
      </nav>}
    </Shell>
  );
}
