import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { estTokenFacture } from "@/lib/business";
import { rateLimit } from "@/lib/zabelie-rate-limit";
import { formatHTG } from "@/lib/sample-data";
import { PayInvoiceButton } from "@/components/business/pay-invoice-button";
import { getLang } from "@/lib/i18n-server";
import { facturationCopy, LOCALE_DATE } from "@/lib/facturation-copy";

export const dynamic = "force-dynamic";

/**
 * ⚠️ `noindex` — CONFIDENTIALITÉ AVANT RÉFÉRENCEMENT.
 *
 * Cette page rend la facture d'un client identifié : son numéro, son montant,
 * le détail de ses lignes, le nom du professionnel. Elle était indexable.
 *
 * Le risque n'est PAS l'énumération : le jeton fait 24 caractères base64url
 * (`estTokenFacture`, `lib/business.ts`), il ne se devine pas. Le risque est
 * la PERMANENCE — un lien collé dans un groupe WhatsApp, un referrer qui
 * fuit, un fil public, et la facture entre dans l'index pour des mois. Le
 * jeton protège contre celui qui cherche ; il ne protège pas contre celui qui
 * tombe dessus.
 *
 * ⚠️ ET CE N'EST PAS INTERCHANGEABLE AVEC UN `disallow` DANS `robots.txt` —
 * c'est même l'inverse. Une URL interdite au crawl n'est jamais LUE, donc son
 * `noindex` n'est jamais VU, et Google peut indexer l'adresse nue sur la
 * seule foi d'un lien entrant. Pour être obéi, un `noindex` doit être
 * atteignable. `/facture/` est donc délibérément ABSENT du `disallow` de
 * `app/robots.ts`, et cette absence est load-bearing : la retirer d'un côté
 * sans l'autre défait la protection en silence.
 */
export const metadata = {
  title: "Facture — Zabelie",
  robots: { index: false, follow: false },
};

type PortalItem = {
  label: string;
  qty: number;
  unit_price_htg: number;
  line_total_htg: number;
};
type Portal = {
  invoice_number: string | null;
  status: string;
  total_htg: number;
  paid_htg: number;
  currency: string;
  due_date: string | null;
  professional: string;
  items: PortalItem[];
};

export default async function FacturePortal({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paye?: string }>;
}) {
  const [{ token }, { paye }, lang] = await Promise.all([params, searchParams, getLang()]);
  const c = facturationCopy(lang);

  if (!isSupabaseConfigured()) notFound();

  /* Durcissement (audit externe 2026-08-10, constat retenu) — deux étages
   * AVANT la RPC `security definer` :
   *   1. FORME : un jeton est exactement 24 caractères base64url. Ce qui n'y
   *      ressemble pas est un 404 sans toucher la base — ni chaîne d'un Mo,
   *      ni tentative d'injection à journaliser.
   *   2. DÉBIT : 30 lectures/min par IP. L'entropie (144 bits) rend
   *      l'énumération irréaliste, mais une borne rend le scan VISIBLE et
   *      borné au lieu de gratuit. Fail-open assumé (lib/zabelie-rate-limit) :
   *      une panne d'infra ne bloque pas un client venu payer sa facture. */
  if (!estTokenFacture(token)) notFound();

  const admin = createAdminClient();
  const fwd = (await headers()).get("x-forwarded-for");
  const ip = fwd?.split(",")[0]?.trim() || "unknown";
  if (!(await rateLimit(admin, `facture:${ip}`, 30, 60))) notFound();

  const { data } = await admin.rpc("zabelie_biz_get_invoice_by_token", {
    p_token: token,
  });
  const inv = data as Portal | null;
  if (!inv) notFound();

  const remaining = inv.total_htg - inv.paid_htg;
  const payable = ["sent", "partially_paid", "overdue"].includes(inv.status);
  /* ⚠️ `?paye=1` vient de l'URL : n'importe qui peut l'ajouter au lien d'une
   * facture impayée et capturer « Paiement reçu, merci ! » sur zabelie.com —
   * le défaut SEC-01 de `/paiement/succes`, sur la page que le client montre
   * au professionnel. Le remerciement ne s'affiche donc que si la facture,
   * relue en base, a bien reçu un paiement ; sinon, une phrase d'attente. */
  const paiementRecu = ["paid", "partially_paid"].includes(inv.status);

  return (
    <div className="bg-grain min-h-dvh">
      <main id="main" className="mx-auto max-w-lg px-5 py-12">
        {/* En-tête marque */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-brand text-lg font-extrabold text-on-brand">
            Z
          </div>
          <span className="text-lg font-bold">
            Zabelie
          </span>
        </div>

        <div className="glass rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-mist">{c.from}</p>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {inv.professional}
              </h1>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-mist">
              {c.publicStatus[inv.status as keyof typeof c.publicStatus] ?? inv.status}
            </span>
          </div>

          {inv.invoice_number && (
            <p className="mt-1 font-mono text-sm text-mist">{inv.invoice_number}</p>
          )}
          {inv.due_date && (
            <p className="mt-1 text-sm text-mist">
              {c.due.replace("{date}", new Date(inv.due_date).toLocaleDateString(LOCALE_DATE[lang]))}
            </p>
          )}

          {/* Lignes */}
          <div className="mt-6 divide-y divide-line border-y border-line">
            {inv.items.map((it, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-cloud">{it.label}</p>
                  <p className="text-xs text-mist">
                    {it.qty} × {formatHTG(it.unit_price_htg)}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatHTG(it.line_total_htg)}</p>
              </div>
            ))}
          </div>

          {/* Totaux */}
          <div className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-mist">{c.total}</span>
              <span className="font-semibold">{formatHTG(inv.total_htg)}</span>
            </div>
            {inv.paid_htg > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-mist">{c.alreadyPaid}</span>
                  <span className="text-success-text">−{formatHTG(inv.paid_htg)}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-1">
                  <span className="text-mist">{c.remaining}</span>
                  <span className="font-bold text-accent">{formatHTG(remaining)}</span>
                </div>
              </>
            )}
          </div>

          {/* Paiement */}
          <div className="mt-6">
            {paye === "1" && paiementRecu && (
              <p className="mb-3 rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-success-text">
                {c.paidThanks}
              </p>
            )}
            {paye === "1" && !paiementRecu && (
              <p className="mb-3 rounded-xl border border-line px-4 py-3 text-sm text-mist">
                {c.checking}
              </p>
            )}
            {inv.status === "paid" ? (
              <p className="rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-center text-sm text-success-text">
                {c.fullyPaid}
              </p>
            ) : inv.status === "void" ? (
              <p className="rounded-xl border border-line px-4 py-3 text-center text-sm text-mist">
                {c.voided}
              </p>
            ) : payable ? (
              <PayInvoiceButton token={token} labels={{ payCta: c.payCta, redirecting: c.redirecting, payUnavailable: c.payUnavailable, network: c.network }} />
            ) : null}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-mist">
          {c.secure} · <Link href="/" className="underline">Zabelie</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
