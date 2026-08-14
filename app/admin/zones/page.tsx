import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { ZonesAdmin, type DemandeRow, type ZoneRow } from "./zones-admin";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zones — Admin Zabelie" };

/**
 * Administration des zones (PR-Z4, docs/33 §4) : la hiérarchie complète —
 * actives ET fermées, c'est tout l'intérêt de passer par service-role — et
 * la file des demandes de katye en attente de modération (arbitrage Z-C).
 * Chaque mutation part vers /api/admin/zones, qui journalise dans
 * `zabelie_admin_actions` (0055).
 */
export default async function AdminZonesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Zones" actif="/admin/zones">
        <p className="mt-6 text-sm text-mist">
          Accès réservé. Pour devenir admin : <code>profiles.role = &apos;admin&apos;</code> en base.
        </p>
      </AdminShell>
    );
  }

  let zones: ZoneRow[] = [];
  let demandes: DemandeRow[] = [];
  let panne: string | null = null;

  if (!isSupabaseConfigured()) {
    panne = "Supabase non configuré (mode démo) — rien à administrer ici.";
  } else {
    const admin = createAdminClient();
    const [{ data: z, error: zErr }, { data: d, error: dErr }] = await Promise.all([
      admin
        .from("zabelie_zones")
        .select("id, parent_id, level, slug, code, label_kr, label_fr, is_active")
        .order("label_fr"),
      admin
        .from("zabelie_zone_requests")
        .select("id, komin_id, nom_propose, status, created_at, requester")
        .eq("status", "pending")
        .order("created_at"),
    ]);
    if (zErr) panne = zErr.message;
    // `zabelie_zone_requests` n'existe qu'après l'application de 0070 : la
    // page se dégrade en l'affichant, plutôt que de tomber (code avant
    // schéma, même règle que le filtre de stock).
    zones = (z as ZoneRow[]) ?? [];
    demandes = dErr ? [] : ((d as DemandeRow[]) ?? []);
    if (dErr && !panne) {
      panne = `Demandes illisibles (0070 appliquée ?) : ${dErr.message}`;
    }
  }

  return (
    <AdminShell title="Zones" actif="/admin/zones">
      {panne && (
        <p className="mt-4 rounded-xl border border-magenta/40 px-4 py-3 text-xs text-magenta">
          {panne}
        </p>
      )}
      <ZonesAdmin zones={zones} demandes={demandes} />
    </AdminShell>
  );
}
