import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { DownloadButton } from "@/components/download-button";
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
import { t, type Lang } from "@/lib/i18n";

/**
 * Où en est la remise, pour un produit qui ne se télécharge PAS.
 * Rien n'est promis au nom de Zabelie : la plateforme ne livre pas.
 */
function remiseLabel(kind: ProductKind | undefined): string | null {
  if (!kind) return null;
  return pickByKind(kind, {
    file: null,
    service: "Service · mise en relation",
    physical: "Remise à convenir avec le vendeur",
  });
}

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes achats — Zabelie" };

type OrderRow = {
  id: string;
  /** null tant que la migration 0042 n'est pas appliquée (code avant schéma). */
  order_ref: string | null;
  status: string;
  amount_htg: number;
  created_at: string;
  product: { title: string; slug: string; kind: ProductKind } | null;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">Mes achats</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export default async function MesAchatsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <p className="mt-4 text-sm text-mist">
          Base non configurée (mode démo). Connecte Supabase pour voir tes achats.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Shell>
        <p className="mt-4 text-sm text-mist">
          Connecte-toi pour voir tes achats.
        </p>
        <Link
          href="/connexion"
          className="mt-4 inline-block rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-ink"
        >
          Se connecter
        </Link>
      </Shell>
    );
  }

  // 0042 pas encore appliquée → la colonne manque : on redemande sans elle.
  // Règle du dépôt : le code devance le schéma, une requête se dégrade,
  // elle ne tombe pas (même motif que le filtre de stock du catalogue).
  const first = await supabase
    .from("orders")
    .select(
      "id, order_ref, status, amount_htg, created_at, product:products(title, slug, kind)"
    )
    .eq("buyer_id", user.id)
    .in("status", ["paid", "delivered"])
    .order("created_at", { ascending: false });
  let rows = first.data;
  if (isMissingColumn(first.error)) {
    const retry = await supabase
      .from("orders")
      .select(
        "id, status, amount_htg, created_at, product:products(title, slug, kind)"
      )
      .eq("buyer_id", user.id)
      .in("status", ["paid", "delivered"])
      .order("created_at", { ascending: false });
    rows = (retry.data ?? []).map((o) => ({ ...o, order_ref: null }));
  }

  const orders = (rows ?? []) as unknown as OrderRow[];
  const reviewed = await getReviewedOrderIds(orders.map((o) => o.id));
  const lang = await getLang();

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
      {orders.length === 0 ? (
        <p className="mt-4 text-sm text-mist">
          Aucun achat pour l'instant.{" "}
          <Link href="/catalogue" className="text-cloud underline">
            Explorer le catalogue
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {orders.map((o) => (
            <li
              key={o.id}
              className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-surface/60 p-4"
            >
              <div>
                <p className="text-sm font-semibold">
                  {o.product?.title ?? "Produit"}
                </p>
                <p className="text-xs text-mist">
                  {formatHTG(o.amount_htg)} ·{" "}
                  {new Date(o.created_at).toLocaleDateString("fr-HT")}
                  {/* Le numéro que l'acheteur lit au vendeur au téléphone. */}
                  {o.order_ref && (
                    <>
                      {" · "}
                      <span className="numeric select-all">{o.order_ref}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                {/* Un bouton « Télécharger » s'affichait pour tout produit
                    non-service — donc aussi pour une pièce détachée, et il
                    menait à une erreur après paiement. Seul un `fichier` se
                    télécharge ; les autres types disent où en est la remise,
                    sans rien promettre au nom de Zabelie. */}
                {o.product && isDownloadable(o.product.kind) ? (
                  <DownloadButton orderId={o.id} />
                ) : suivis.has(o.id) ? (
                  // Un suivi existe : il DIT où en est la remise, et il rend
                  // le libellé statique inutile — « remise à convenir » sous un
                  // « le vendeur déclare avoir remis » serait une contradiction
                  // affichée à l'acheteur.
                  blocRemise(suivis.get(o.id), lang)
                ) : (
                  remiseLabel(o.product?.kind) && (
                    <span className="text-xs text-mist">
                      {remiseLabel(o.product?.kind)}
                    </span>
                  )
                )}
                {reviewed.has(o.id) ? (
                  <span className="text-xs text-success-text">Avis déposé ✓</span>
                ) : (
                  <ReviewForm orderId={o.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
