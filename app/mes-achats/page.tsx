import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { DownloadButton } from "@/components/download-button";
import { ReviewForm } from "@/components/review-form";
import { getReviewedOrderIds } from "@/lib/reviews";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG, type ProductKind } from "@/lib/sample-data";
import { isDownloadable, pickByKind } from "@/lib/product-kind";

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

  const { data } = await supabase
    .from("orders")
    .select(
      "id, status, amount_htg, created_at, product:products(title, slug, kind)"
    )
    .eq("buyer_id", user.id)
    .in("status", ["paid", "delivered"])
    .order("created_at", { ascending: false });

  const orders = (data ?? []) as unknown as OrderRow[];
  const reviewed = await getReviewedOrderIds(orders.map((o) => o.id));

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
