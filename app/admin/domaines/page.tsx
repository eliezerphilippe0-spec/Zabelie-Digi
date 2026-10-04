import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enregistrementsDns } from "@/lib/domaines";
import { DomainesAdmin, type DemandeDomaine } from "./domaines-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Domaines — Admin Zabelie" };

/**
 * Domaines personnalisés des boutiques (0125) — branchement MANUEL.
 * Pour chaque demande : ajouter le domaine (et www) dans Vercel, puis
 * « Vérifier et activer ». Outil interne, français assumé.
 */
export default async function AdminDomainesPage() {
  const user = await getAdminUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Domaines" actif="/admin/domaines">
        <p className="mt-6 text-sm text-mist">Accès réservé aux admins.</p>
      </AdminShell>
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("zabelie_seller_domains")
    .select("seller_id, domaine, statut, note_admin, created_at, profiles(display_name, boutik_slug)")
    .order("created_at", { ascending: false })
    .limit(200);
  const demandes: DemandeDomaine[] = (data ?? []).map((d) => {
    const p = (Array.isArray(d.profiles) ? d.profiles[0] : d.profiles) as { display_name: string | null; boutik_slug: string | null } | null;
    return { sellerId: d.seller_id, domaine: d.domaine, statut: d.statut, note: d.note_admin, demandeLe: d.created_at, nom: p?.display_name ?? null, slug: p?.boutik_slug ?? null };
  });
  return (
    <AdminShell title="Domaines" actif="/admin/domaines">
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-mist">
        <li>Vercel → projet → Settings → Domains : ajouter le domaine <strong>et</strong> sa variante www.</li>
        <li>Le vendeur pose ses DNS : {enregistrementsDns("exemple.com").map((r) => `${r.type} ${r.nom} → ${r.valeur}`).join(" · ")}. Si Vercel affiche une autre valeur, transmettez-la au vendeur.</li>
        <li>« Vérifier et activer » : le site contrôle que le domaine atteint bien Zabelie avant d&apos;activer.</li>
      </ol>
      {error ? <p role="alert" className="mt-6 text-sm text-danger-text">Lecture impossible (migration 0125 appliquée ?).</p> : <DomainesAdmin demandes={demandes} />}
    </AdminShell>
  );
}
