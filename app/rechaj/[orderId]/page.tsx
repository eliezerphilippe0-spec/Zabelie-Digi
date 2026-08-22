import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteNav } from "@/components/site-nav";
import { CopyField } from "@/components/copy-field";
import { ZabelieTopupStatus } from "@/components/zabelie-topup-status";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatHTG } from "@/lib/sample-data";
import { formatHaitiPhone } from "@/lib/zabelie-topup/phone";
import { zelleRecipient, isZelleEnabled } from "@/lib/zelle";
import { formatUsd, zelleMemo } from "@/lib/payment-utils";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recharge — Zabelie" };

const STATUSES = [
  "payment_pending",
  "paid",
  "fulfillment_pending",
  "delivered",
  "failed",
  "refund_pending",
  "refunded",
] as const;

/** Suivi d'une recharge : statut temps réel + instructions Zelle si besoin. */
export default async function RechajOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?next=/rechaj/${orderId}`); // BL-110

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("zabelie_topup_orders")
    .select(
      "id, buyer_id, status, operator, beneficiary_phone, face_value_htg, amount_htg, rail, expected_usd_cents"
    )
    .eq("id", orderId)
    .single();
  if (!order || order.buyer_id !== user.id) notFound();

  const lang = await getLang();
  const labels = Object.fromEntries(
    STATUSES.map((s) => [s, t(lang, `topup.status.${s}` as I18nKey)])
  );

  const showZelle =
    order.rail === "zelle" &&
    order.status === "payment_pending" &&
    isZelleEnabled();

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-xs text-mist">
          {t(lang, "pay.order")} #{order.id.slice(0, 8)}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">{t(lang, "topup.title")}</h1>
        <p className="mt-2 text-sm text-mist">
          <span className="capitalize">{order.operator}</span> ·{" "}
          {formatHaitiPhone(order.beneficiary_phone)} ·{" "}
          {t(lang, "topup.receives", { face: String(order.face_value_htg) })} ·{" "}
          {formatHTG(order.amount_htg)}
        </p>

        <div className="mt-6">
          <ZabelieTopupStatus
            orderId={order.id}
            initialStatus={order.status}
            labels={labels}
          />
        </div>

        {showZelle && (
          <dl className="mt-6 space-y-4 rounded-2xl border border-line bg-surface/60 p-6">
            <p className="text-sm text-mist">{t(lang, "zelle.sub")}</p>
            <div>
              <dt className="text-xs text-mist">{t(lang, "zelle.amount")}</dt>
              <dd className="numeric mt-1 text-3xl font-extrabold text-gradient">
                {formatUsd(order.expected_usd_cents ?? 0)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t(lang, "zelle.to")}</dt>
              <dd className="mt-1 font-semibold">
                {zelleRecipient().handle}
                <CopyField
                  value={zelleRecipient().handle}
                  label={t(lang, "common.copy")}
                  copiedLabel={t(lang, "common.copied")}
                />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t(lang, "zelle.name")}</dt>
              <dd className="mt-1 font-semibold">{zelleRecipient().name}</dd>
            </div>
            <div>
              <dt className="text-xs text-mist">{t(lang, "zelle.memo")}</dt>
              <dd className="numeric mt-1 text-xl font-extrabold text-accent">
                {zelleMemo(order.id)}
                <CopyField
                  value={zelleMemo(order.id)}
                  label={t(lang, "common.copy")}
                  copiedLabel={t(lang, "common.copied")}
                />
              </dd>
              <p className="mt-1 text-xs text-mist">{t(lang, "zelle.memo.why")}</p>
            </div>
          </dl>
        )}

        <div className="mt-8 text-center">
          {/* V-17 : `/rechaj` redirige désormais vers le catalogue. Ce lien y
              allait, donc via un aller-retour inutile — et le libellé
              (`pay.back` = « Retour au catalogue ») annonçait déjà la vraie
              destination. On pointe droit dessus, comme les trois pages de
              paiement sœurs. */}
          <Link href="/catalogue" className="inline-flex min-h-11 items-center text-sm text-mist hover:text-cloud">
            {t(lang, "pay.back")}
          </Link>
        </div>
      </main>
    </div>
  );
}
