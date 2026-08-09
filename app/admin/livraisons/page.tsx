import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Remises à traiter — Zabelie" };

/**
 * La file `zabelie_fulfillment_overdue` (0043 §6) — les dossiers qui attendent
 * une MAIN HUMAINE.
 *
 * Deux causes y mènent, et l'écran les distingue parce qu'elles n'appellent
 * pas la même conversation :
 *   • `action_required` — le VENDEUR n'a rien déclaré dans le délai, ou ses
 *     avis n'ont jamais pu partir. Sur ce marché, une remise en main propre
 *     sans clic est le cas le PLUS FRÉQUENT : ne pas lire cet état comme
 *     « à rembourser ». C'est pour cette raison exacte que l'énumération SQL
 *     ne s'appelle pas `refund_required`.
 *   • `disputed_by_buyer` — l'ACHETEUR a levé la main avant l'échéance.
 *     L'escrow est resté verrouillé : c'est tout l'intérêt du geste.
 *
 * Aucun arbitrage automatique n'est proposé ici, et ce n'est pas un manque :
 * Zabelie n'observe pas la remise et ne peut donc pas décider qui dit vrai.
 * L'écran RASSEMBLE et NOMME ; il ne tranche pas.
 */

type LigneFile = {
  order_id: string;
  order_ref: string | null;
  amount_htg: number;
  buyer_id: string;
  seller_id: string;
  product_title: string;
  status: "action_required" | "disputed_by_buyer";
  paid_at: string;
};

function joursDAttente(depuis: string): number {
  return Math.floor((Date.now() - new Date(depuis).getTime()) / 86_400_000);
}

export default async function LivraisonsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminShell title="Remises à traiter" actif="/admin/livraisons">
        <p className="mt-4 text-cloud">Supabase non configuré.</p>
      </AdminShell>
    );
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Accès refusé" actif="/admin/livraisons">
        <p className="mt-4 text-cloud">
          Cette page est réservée à l&apos;administration.{" "}
          <Link href="/" className="underline">Retour</Link>
        </p>
      </AdminShell>
    );
  }

  const admin = createAdminClient();
  // La vue est révoquée pour anon/authenticated : seul le service role la lit,
  // derrière la garde de rôle ci-dessus. Requête tolérante — sur une base en
  // retard de migration, la page dit « rien à traiter » au lieu de tomber.
  const { data, error } = await admin
    .from("zabelie_fulfillment_overdue")
    .select("*")
    .order("paid_at", { ascending: true });

  const lignes = (data ?? []) as unknown as LigneFile[];
  const vendeurMuet = lignes.filter((l) => l.status === "action_required");
  const acheteurAlerte = lignes.filter((l) => l.status === "disputed_by_buyer");

  return (
    <AdminShell title="Remises à traiter" actif="/admin/livraisons">
      {error ? (
        // L'erreur est MONTRÉE plutôt qu'avalée : une file vide et une file
        // illisible se ressemblent trop, et c'est de l'argent bloqué.
        <p className="mt-4 rounded-xl border border-line bg-surface/60 p-4 text-sm text-danger-text">
          File illisible : {error.message}
        </p>
      ) : lignes.length === 0 ? (
        <p className="mt-4 text-sm text-mist">
          Rien à traiter. Le balayage passe chaque jour à 12:30 UTC — une file
          vide veut dire qu&apos;il a tourné et n&apos;a rien trouvé, pas
          qu&apos;il n&apos;a pas tourné : la preuve d&apos;exécution est le
          journal <code className="text-cloud">[fulfillment/sweep]</code> côté
          Vercel.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          <Section
            titre="L'acheteur a signalé une non-réception"
            aide="Il a levé la main AVANT l'échéance : l'escrow est resté verrouillé, l'argent n'a pas bougé."
            lignes={acheteurAlerte}
          />
          <Section
            titre="Le vendeur n'a rien déclaré"
            aide="Ne pas lire comme « à rembourser » : une remise en main propre sans clic est le cas le plus fréquent. Relancer le vendeur d'abord."
            lignes={vendeurMuet}
          />
        </div>
      )}
    </AdminShell>
  );
}

function Section({
  titre,
  aide,
  lignes,
}: {
  titre: string;
  aide: string;
  lignes: LigneFile[];
}) {
  if (lignes.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-cloud">
        {titre} <span className="text-mist">({lignes.length})</span>
      </h2>
      <p className="mt-1 text-xs text-mist">{aide}</p>
      <ul className="mt-3 space-y-2">
        {lignes.map((l) => (
          <li
            key={l.order_id}
            className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="font-semibold">{l.product_title}</p>
              <p className="text-xs text-mist">
                {formatHTG(l.amount_htg)}
                {l.order_ref && (
                  <>
                    {" · "}
                    <span className="numeric select-all">{l.order_ref}</span>
                  </>
                )}
              </p>
            </div>
            {/* L'attente en JOURS, pas une date : c'est elle qui dit
                l'urgence, et c'est elle qu'on compare d'une ligne à l'autre. */}
            <span className="numeric shrink-0 text-xs text-mist">
              {joursDAttente(l.paid_at)} j
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
