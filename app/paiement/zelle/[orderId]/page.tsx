import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { CopyField } from "@/components/copy-field";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { zelleRecipient, isZelleEnabled } from "@/lib/zelle";
import { formatUsd, zelleMemo } from "@/lib/payment-utils";
import { ZelleReferenceForm } from "@/components/zelle-reference-form";
import { getLang } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";
export const metadata = { title: "Paiement Zelle — Zabelie" };

/**
 * Instructions de paiement Zelle (rail diaspora, semi-manuel — V-10).
 * Le montant affiché est le montant FIGÉ au checkout (expected_usd_cents) ;
 * la livraison n'arrive qu'après confirmation admin via confirm_payment.
 */
export default async function ZellePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  if (!isZelleEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/connexion?next=/paiement/zelle/${orderId}`); // BL-110

  const admin = createAdminClient();
  const { data: payment } = await admin
    .from("payments")
    .select("status, rail, expected_usd_cents, raw, orders!inner(buyer_id)")
    .eq("order_id", orderId)
    .single();

  const rawOrder = payment?.orders as unknown;
  const order = (Array.isArray(rawOrder) ? rawOrder[0] : rawOrder) as
    | { buyer_id: string }
    | null;
  if (!payment || payment.rail !== "zelle" || order?.buyer_id !== user.id) {
    notFound();
  }
  if (payment.status === "confirmed") {
    redirect(`/paiement/succes?commande=${orderId}`);
  }

  const lang = await getLang();
  const recipient = zelleRecipient();
  const memo = zelleMemo(orderId);
  const amount = formatUsd(payment.expected_usd_cents ?? 0);
  const raw = (payment.raw ?? {}) as Record<string, unknown>;
  const alreadySent = typeof raw.buyer_ref === "string";

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-md px-5 py-16">
        <p className="text-xs text-mist">
          {t(lang, "pay.order")} #{orderId.slice(0, 8)}
        </p>
        <h1 className="mt-2 text-2xl font-extrabold">{t(lang, "zelle.title")}</h1>
        <p className="mt-3 text-sm text-mist">{t(lang, "zelle.sub")}</p>

        <dl className="mt-8 space-y-4 rounded-2xl border border-line bg-surface/60 p-6">
          <div>
            <dt className="text-xs text-mist">{t(lang, "zelle.amount")}</dt>
            <dd className="numeric mt-1 text-3xl font-extrabold text-gradient">
              {amount}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mist">{t(lang, "zelle.to")}</dt>
            <dd className="mt-1 font-semibold">
              {recipient.handle}
              <CopyField
                value={recipient.handle}
                label={t(lang, "common.copy")}
                copiedLabel={t(lang, "common.copied")}
              />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-mist">{t(lang, "zelle.name")}</dt>
            <dd className="mt-1 font-semibold">{recipient.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-mist">{t(lang, "zelle.memo")}</dt>
            <dd className="numeric mt-1 text-xl font-extrabold text-accent">
              {memo}
              <CopyField
                value={memo}
                label={t(lang, "common.copy")}
                copiedLabel={t(lang, "common.copied")}
              />
            </dd>
            <p className="mt-1 text-xs text-mist">{t(lang, "zelle.memo.why")}</p>
          </div>
        </dl>

        <div className="mt-8">
          <ZelleReferenceForm
            orderId={orderId}
            alreadySent={alreadySent}
            labels={{
              intro: t(lang, "zelle.ref.label"),
              placeholder: t(lang, "zelle.ref.ph"),
              submit: t(lang, "zelle.sent"),
              done: t(lang, "zelle.done"),
            }}
          />
        </div>

        <div className="mt-8 text-center">
          <Link href="/mes-achats" className="text-sm text-mist hover:text-cloud">
            {t(lang, "pay.wait.cta")}
          </Link>
        </div>
      </main>
    </div>
  );
}
