import Link from "next/link";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { PayoutForm } from "@/components/payout-form";
import { PayoutQueue, type PayoutRequestRow } from "@/components/payout-queue";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Règlements vendeurs — Zabelie Digi" };

/**
 * Chantier 0, lot 0.a (docs/19) — écran d'APUREMENT.
 * Affiche ce que la plateforme doit à chaque vendeur et permet d'enregistrer
 * les règlements versés à la main (aucune route de décaissement n'existe :
 * l'admin vire par MonCash, puis inscrit le reçu ici).
 *
 * Le total « dû » est aussi le chiffre du contrôle de solvabilité (docs/19
 * §3.2) : il doit être COUVERT par le solde réel du compte marchand MonCash.
 */

type Row = {
  wallet_id: string;
  owner_id: string;
  display_name: string | null;
  disponible_htg: number;
  en_attente_htg: number;
  du_total_htg: number;
  deja_regle_htg: number;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-5xl px-5 py-16">{children}</main>
      <SiteFooter />
    </div>
  );
}

export default async function PaiementsVendeursPage() {
  if (!isSupabaseConfigured()) {
    return (
      <Shell>
        <h1 className="text-3xl font-black tracking-tight">Règlements vendeurs</h1>
        <p className="mt-4 text-cloud">Supabase non configuré.</p>
      </Shell>
    );
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <Shell>
        <h1 className="text-3xl font-black tracking-tight">Accès refusé</h1>
        <p className="mt-4 text-cloud">
          Cette page est réservée à l&apos;administration.{" "}
          <Link href="/" className="underline">Retour</Link>
        </p>
      </Shell>
    );
  }

  const admin = createAdminClient();
  const [{ data }, { data: report }, { data: queue }] = await Promise.all([
    admin
      .from("zabelie_seller_balances")
      .select("*")
      .order("du_total_htg", { ascending: false }),
    admin.rpc("zabelie_solvency_report"),
    // Demandes de retrait ouvertes (lot 0.b) : à traiter en priorité — un
    // vendeur qui a demandé son argent attend une réponse.
    admin
      .from("payouts")
      .select("id, amount_htg, created_at, wallets(profiles(display_name))")
      .in("status", ["requested", "processing"])
      .order("created_at", { ascending: true }),
  ]);

  const rows = (data ?? []) as Row[];
  const coherence = report as
    | { ok: boolean; ecarts: number; ecart_total_htg: number }
    | null;

  const requests: PayoutRequestRow[] = (queue ?? []).map((q) => {
    const w = (q as { wallets?: unknown }).wallets as
      | { profiles?: { display_name?: string } | { display_name?: string }[] }
      | null;
    const prof = Array.isArray(w?.profiles) ? w?.profiles[0] : w?.profiles;
    return {
      id: (q as { id: string }).id,
      amount_htg: Number((q as { amount_htg: number }).amount_htg),
      created_at: (q as { created_at: string }).created_at,
      display_name: prof?.display_name ?? null,
    };
  });
  const totalDu = rows.reduce((s, r) => s + Number(r.du_total_htg), 0);
  const totalDispo = rows.reduce((s, r) => s + Number(r.disponible_htg), 0);
  const totalAttente = rows.reduce((s, r) => s + Number(r.en_attente_htg), 0);

  return (
    <Shell>
      <h1 className="text-3xl font-black tracking-tight">Règlements vendeurs</h1>
      <p className="mt-2 max-w-2xl text-sm text-cloud">
        Aucune route de décaissement n&apos;existe encore : les vendeurs sont
        réglés à la main (virement MonCash direct). Chaque versement doit être
        enregistré ici, sinon le registre continue d&apos;afficher une dette
        déjà payée.
      </p>

      {coherence && !coherence.ok && (
        <div className="mt-6 rounded-2xl border border-danger/50 bg-danger/10 p-5">
          <p className="font-bold text-danger-text">
            ⚠️ Écart de registre détecté — ne réglez rien avant vérification
          </p>
          <p className="mt-1 text-sm text-cloud">
            {coherence.ecarts} portefeuille(s) présentent un solde qui ne
            correspond pas au grand livre, pour un total de{" "}
            {formatHTG(Number(coherence.ecart_total_htg))}. Un solde a bougé
            hors du grand livre : les montants ci-dessous peuvent être faux.
          </p>
        </div>
      )}

      <PayoutQueue rows={requests} />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-brand/40 bg-surface/60 p-5">
          <p className="text-xs uppercase tracking-wide text-mist">Dû aux vendeurs</p>
          <p className="mt-1 text-2xl font-black">{formatHTG(totalDu)}</p>
          <p className="mt-1 text-xs text-mist">
            Doit être couvert par le solde réel du compte marchand MonCash.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/60 p-5">
          <p className="text-xs uppercase tracking-wide text-mist">Disponible (décaissable)</p>
          <p className="mt-1 text-2xl font-black">{formatHTG(totalDispo)}</p>
        </div>
        <div className="rounded-2xl border border-line bg-surface/60 p-5">
          <p className="text-xs uppercase tracking-wide text-mist">En attente (escrow J+7)</p>
          <p className="mt-1 text-2xl font-black">{formatHTG(totalAttente)}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-line bg-surface/60 p-6 text-cloud">
          Aucun solde vendeur ouvert — rien à apurer.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {rows.map((r) => (
            <li key={r.wallet_id} className="rounded-2xl border border-line bg-surface/60 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <p className="font-bold">{r.display_name ?? "Vendeur"}</p>
                  <p className="mt-1 text-sm text-cloud">
                    Disponible <strong>{formatHTG(r.disponible_htg)}</strong>
                    {r.en_attente_htg > 0 && (
                      <> · en attente {formatHTG(r.en_attente_htg)}</>
                    )}
                    {r.deja_regle_htg > 0 && (
                      <> · déjà réglé {formatHTG(r.deja_regle_htg)}</>
                    )}
                  </p>
                </div>
                <PayoutForm
                  walletId={r.wallet_id}
                  displayName={r.display_name ?? "ce vendeur"}
                  disponibleHtg={Number(r.disponible_htg)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
