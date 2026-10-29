import { AdminShell } from "@/components/admin/admin-shell";
import { getAdminUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { ZonesAdmin, type DemandeRow, type DemandeZoneRow, type ZoneRow } from "./zones-admin";
import { demandeParZone } from "@/lib/zone-demande";
import { isMissingTable } from "@/lib/product-media";

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
  const user = await getAdminUser();
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
  let demandeZones: DemandeZoneRow[] = [];
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

    /* La demande par zone (0162) : les clics « je cherche un vendeur ici » des 30 derniers jours,
     * face aux vendeurs qui déclarent y livrer (0158). Tables absentes (code avant schéma) → liste
     * vide, la page tient. Lecture service-role : aucune policy cliente n'existe sur ces compteurs. */
    const depuis = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [{ data: dem, error: demErr }, { data: svc, error: svcErr }] = await Promise.all([
      admin.from("zabelie_zone_demand").select("zone_id, hits").gte("day", depuis),
      admin.from("zabelie_seller_service_zones").select("seller_id, zone_id"),
    ]);
    for (const e of [demErr, svcErr]) {
      if (e && !isMissingTable(e)) console.warn("[admin/zones] demande illisible", e.message);
    }
    const noeuds = ((z as ZoneRow[]) ?? []).map((r) => ({ id: r.id, parent_id: r.parent_id, level: r.level }));
    const parId = new Map(((z as ZoneRow[]) ?? []).map((r) => [r.id, r]));
    const chemin = (id: string) => {
      const noms: string[] = [];
      for (let c = parId.get(id), g = 0; c && g < 4; c = c.parent_id ? parId.get(c.parent_id) : undefined, g++) noms.unshift(c.label_fr);
      return noms.join(" › ");
    };
    demandeZones = demandeParZone(
      noeuds,
      demErr ? [] : ((dem as { zone_id: string; hits: number }[]) ?? []),
      svcErr ? [] : ((svc as { seller_id: string; zone_id: string }[]) ?? []),
    ).map((l) => ({ ...l, label: chemin(l.zoneId) || l.zoneId }));
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
        <p className="mt-4 rounded-xl border border-danger/40 px-4 py-3 text-xs text-danger">
          {panne}
        </p>
      )}
      <ZonesAdmin zones={zones} demandes={demandes} demandeZones={demandeZones} />
    </AdminShell>
  );
}
