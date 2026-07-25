import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { AdminProductRow } from "@/components/admin-product-row";
import { AdminSellerRow } from "@/components/admin-seller-row";
import { AdminRefundButton } from "@/components/admin-refund-button";
import { AdminZelleConfirmButton } from "@/components/admin-zelle-confirm-button";
import {
  AdminTopupZelleButton,
  AdminTopupRefundButton,
  AdminTopupSyncButton,
} from "@/components/admin-topup-buttons";
import { formatHaitiPhone } from "@/lib/zabelie-topup/phone";
import { formatUsd, zelleMemo } from "@/lib/payment-utils";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration — Zabelie" };

function Shell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16">
        <h1 className="text-3xl font-extrabold tracking-tight">{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

type ProductRow = {
  id: string;
  title: string;
  status: string;
  seller: { display_name: string } | { display_name: string }[] | null;
};

type SellerRow = {
  id: string;
  display_name: string;
  suspended_at: string | null;
  suspended_reason: string | null;
};

type PaymentRow = {
  status: string;
  created_at: string;
  provider_ref: string | null;
  order: { amount_htg: number } | { amount_htg: number }[] | null;
};

type TopupActionRow = {
  id: string;
  status: string;
  rail: string;
  operator: string;
  beneficiary_phone: string;
  face_value_htg: number;
  amount_htg: number;
  expected_usd_cents: number | null;
  last_error: string | null;
  created_at: string;
};

type ZellePendingRow = {
  order_id: string;
  expected_usd_cents: number | null;
  created_at: string;
  raw: Record<string, unknown> | null;
  order: { amount_htg: number } | { amount_htg: number }[] | null;
};

type OrderRow = {
  id: string;
  status: string;
  amount_htg: number;
  created_at: string;
  product: { title: string } | { title: string }[] | null;
};

function one<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function AdminPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell title="Administration">
        <p className="mt-4 text-sm text-mist">
          Mode démo — connecte Supabase pour accéder au back-office.
        </p>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <Shell title="Administration">
        <p className="mt-4 text-sm text-mist">
          Accès réservé aux administrateurs.{" "}
          {!user && (
            <Link href="/connexion" className="text-cloud underline">
              Se connecter
            </Link>
          )}
        </p>
        <p className="mt-2 text-xs text-mist">
          Pour devenir admin : passer <code>profiles.role = &apos;admin&apos;</code> en base.
        </p>
      </Shell>
    );
  }

  const admin = createAdminClient();

  const [
    { data: prods },
    { data: pays },
    { data: paidOrders },
    pendingRes,
    { data: recentOrders },
    { data: zellePendings },
    { data: topupActions },
    { data: sellerRows },
  ] = await Promise.all([
      admin
        .from("products")
        .select("id, title, status, seller:profiles!products_seller_id_fkey(display_name)")
        .order("created_at", { ascending: false })
        .limit(100),
      admin
        .from("payments")
        .select("status, created_at, provider_ref, order:orders(amount_htg)")
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        .from("orders")
        .select("amount_htg")
        .in("status", ["paid", "delivered"])
        .limit(1000),
      admin
        .from("payments")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      admin
        .from("orders")
        .select("id, status, amount_htg, created_at, product:products(title)")
        .in("status", ["paid", "delivered", "disputed", "refunded"])
        .order("created_at", { ascending: false })
        .limit(15),
      admin
        .from("payments")
        .select("order_id, expected_usd_cents, created_at, raw, order:orders(amount_htg)")
        .eq("rail", "zelle")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(50),
      admin
        .from("zabelie_topup_orders")
        .select(
          "id, status, rail, operator, beneficiary_phone, face_value_htg, amount_htg, expected_usd_cents, last_error, created_at"
        )
        .or("and(rail.eq.zelle,status.eq.payment_pending),status.eq.refund_pending")
        .order("created_at", { ascending: true })
        .limit(50),
      admin
        .from("profiles")
        .select("id, display_name, suspended_at, suspended_reason")
        .eq("role", "creator")
        .order("suspended_at", { ascending: false, nullsFirst: false })
        .limit(50),
    ]);

  const products = (prods ?? []) as ProductRow[];
  const sellers = (sellerRows ?? []) as SellerRow[];
  const payments = (pays ?? []) as PaymentRow[];
  const orders = (recentOrders ?? []) as unknown as OrderRow[];
  const zelleQueue = (zellePendings ?? []) as unknown as ZellePendingRow[];
  const topupQueue = (topupActions ?? []) as unknown as TopupActionRow[];
  const gmv = (paidOrders ?? []).reduce((s, o) => s + o.amount_htg, 0);
  const pendingPayments = pendingRes.count ?? 0;

  const stats = [
    { label: "Produits", value: String(products.length) },
    {
      label: "Publiés",
      value: String(products.filter((p) => p.status === "published").length),
    },
    { label: "GMV (payé)", value: formatHTG(gmv) },
    { label: "Paiements en attente", value: String(pendingPayments) },
  ];

  return (
    <Shell title="Back-office">
      <p className="mt-2 text-sm text-mist">
        <Link href="/admin/geo" className="text-cloud underline">
          Carte géo-localisation →
        </Link>{" "}
        d’où viennent nos clients et talents.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-line bg-surface-maroon/70 p-5"
          >
            <p className="metric text-xl font-extrabold text-gradient">{s.value}</p>
            <p className="mt-1 text-xs text-mist">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Modération vendeurs : suspension réversible */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Vendeurs</h2>
        <p className="mt-1 text-xs text-mist">
          Suspendre bloque l&apos;accès et masque les produits du catalogue —{" "}
          <strong>sans toucher au wallet ni à l&apos;escrow</strong> (cadre BRH :
          aucun gel de solde dû ; un litige financier se règle par remboursement
          de commande). Réactiver restaure tout, produits compris.
        </p>
        {sellers.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Aucun vendeur.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {sellers.map((s) => (
              <AdminSellerRow
                key={s.id}
                id={s.id}
                name={s.display_name}
                suspendedAt={s.suspended_at}
                suspendedReason={s.suspended_reason}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Modération produits */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Modération des produits</h2>
        {products.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Aucun produit.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {products.map((p) => (
              <AdminProductRow
                key={p.id}
                id={p.id}
                title={p.title}
                seller={one(p.seller)?.display_name ?? "—"}
                status={p.status}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Commandes : remboursement + litiges */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Commandes</h2>
        <p className="mt-1 text-xs text-mist">
          Rembourser annule l&apos;escrow (avant maturité : aucun solde fantôme).
          Les commandes <span className="text-danger-text">disputed</span> (écart
          de montant) sont à examiner.
        </p>
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Aucune commande payée.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {orders.map((o) => {
              const product = Array.isArray(o.product) ? o.product[0] : o.product;
              return (
                <li
                  key={o.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {product?.title ?? "Produit"}
                    </p>
                    <p className="text-xs text-mist">
                      {formatHTG(o.amount_htg)} ·{" "}
                      {new Date(o.created_at).toLocaleDateString("fr-HT")} ·{" "}
                      <span
                        className={
                          o.status === "disputed"
                            ? "text-danger-text"
                            : o.status === "refunded"
                              ? "text-warning-text"
                              : "text-success-text"
                        }
                      >
                        {o.status}
                      </span>
                    </p>
                  </div>
                  {(o.status === "paid" || o.status === "delivered") && (
                    <AdminRefundButton orderId={o.id} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Virements Zelle en attente de confirmation manuelle */}
      {zelleQueue.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Paiements Zelle à confirmer</h2>
          <p className="mt-1 text-xs text-mist">
            Vérifiez le relevé bancaire (montant exact + mémo) avant de
            confirmer. La confirmation livre le produit et crédite le vendeur
            (escrow J+7) — elle est idempotente.
          </p>
          <ul className="mt-4 space-y-2">
            {zelleQueue.map((z) => {
              const buyerRef =
                typeof z.raw?.buyer_ref === "string" && z.raw.buyer_ref
                  ? String(z.raw.buyer_ref)
                  : null;
              const usd = formatUsd(z.expected_usd_cents ?? 0);
              return (
                <li
                  key={z.order_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {usd}{" "}
                      <span className="text-xs text-mist">
                        ({one(z.order)?.amount_htg != null
                          ? formatHTG(one(z.order)!.amount_htg)
                          : "—"})
                      </span>
                    </p>
                    <p className="text-xs text-mist">
                      Mémo <span className="numeric text-accent">{zelleMemo(z.order_id)}</span>
                      {" · "}
                      {new Date(z.created_at).toLocaleString("fr-HT")}
                      {buyerRef && (
                        <>
                          {" · "}réf. acheteur : <span className="text-cloud">{buyerRef}</span>
                        </>
                      )}
                      {!buyerRef && " · l'acheteur n'a pas encore signalé l'envoi"}
                    </p>
                  </div>
                  <AdminZelleConfirmButton orderId={z.order_id} amountUsd={usd} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Recharges téléphoniques : Zelle à confirmer + remboursements (checkpoint humain) */}
      {topupQueue.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Recharges — actions requises</h2>
          <p className="mt-1 text-xs text-mist">
            Zelle : vérifier le relevé (montant exact + mémo) avant de confirmer
            — la recharge part immédiatement. Remboursements : rembourser via le
            moyen de paiement d&apos;origine PUIS enregistrer la référence.
          </p>
          <ul className="mt-4 space-y-2">
            {topupQueue.map((z) => (
              <li
                key={z.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="capitalize">{z.operator}</span>{" "}
                    {z.face_value_htg} HTG → {formatHaitiPhone(z.beneficiary_phone)}
                  </p>
                  <p className="text-xs text-mist">
                    {z.status === "refund_pending" ? (
                      <span className="text-danger-text">
                        échec de livraison — à rembourser ({formatHTG(z.amount_htg)}
                        {z.rail === "zelle" && z.expected_usd_cents != null
                          ? ` / ${formatUsd(z.expected_usd_cents)}`
                          : ""}{" "}
                        via {z.rail})
                      </span>
                    ) : (
                      <>
                        virement Zelle attendu :{" "}
                        <span className="text-cloud">
                          {formatUsd(z.expected_usd_cents ?? 0)}
                        </span>{" "}
                        · mémo{" "}
                        <span className="numeric text-accent">{zelleMemo(z.id)}</span>
                      </>
                    )}
                    {" · "}
                    {new Date(z.created_at).toLocaleString("fr-HT")}
                    {z.last_error && ` · ${z.last_error.slice(0, 80)}`}
                  </p>
                </div>
                {z.status === "refund_pending" ? (
                  <AdminTopupRefundButton
                    orderId={z.id}
                    amountLabel={
                      z.rail === "zelle" && z.expected_usd_cents != null
                        ? formatUsd(z.expected_usd_cents)
                        : formatHTG(z.amount_htg)
                    }
                    rail={z.rail}
                  />
                ) : (
                  <AdminTopupZelleButton
                    orderId={z.id}
                    amountUsd={formatUsd(z.expected_usd_cents ?? 0)}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Recharges — catalogue Reloadly */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Recharges — catalogue</h2>
        <p className="mt-1 text-xs text-mist">
          Remplit les dénominations et les <code>operatorId</code> Digicel/Natcom
          depuis Reloadly (coûtant = valeur faciale par défaut, à affiner
          ensuite). À lancer une fois les clés Reloadly posées, avant d&apos;ouvrir{" "}
          <code>/rechaj</code>.
        </p>
        <div className="mt-4">
          <AdminTopupSyncButton />
        </div>
      </section>

      {/* Réconciliation paiements */}
      <section className="mt-10">
        <h2 className="text-lg font-semibold">Paiements récents</h2>
        <p className="mt-1 text-xs text-mist">
          La réconciliation automatique tourne via le cron (/api/reconcile).
        </p>
        {payments.length === 0 ? (
          <p className="mt-3 text-sm text-mist">Aucun paiement.</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {payments.map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
              >
                <span className="text-mist">
                  {new Date(p.created_at).toLocaleString("fr-HT")}
                </span>
                <span>{one(p.order)?.amount_htg != null ? formatHTG(one(p.order)!.amount_htg) : "—"}</span>
                <span
                  className={
                    p.status === "confirmed"
                      ? "text-success-text"
                      : p.status === "failed"
                        ? "text-danger-text"
                        : "text-warning-text"
                  }
                >
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}
