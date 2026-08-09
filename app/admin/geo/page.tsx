import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { GeoMap, type GeoRow } from "@/components/geo-map";
import { HaitiMap, type HtRow } from "@/components/haiti-map";
import { getCurrentUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/products";
import { formatHTG } from "@/lib/sample-data";
import { countryName } from "@/lib/geo/countries";
import { departmentName } from "@/lib/geo/haiti";

export const dynamic = "force-dynamic";
export const metadata = { title: "Géo-localisation — Zabelie" };

type UserAgg = { country_code: string; role: string; users: number };
type SalesAgg = { country_code: string; orders: number; gmv_htg: number };
type HtAgg = { region_code: string; creators: number; users: number };

export default async function GeoPage() {
  if (!isSupabaseConfigured()) {
    return (
      <AdminShell title="Géo-localisation" actif="/admin/geo">
        <p className="mt-4 text-sm text-mist">
          Mode démo — connecte Supabase pour afficher la carte.
        </p>
      </AdminShell>
    );
  }

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return (
      <AdminShell title="Géo-localisation" actif="/admin/geo">
        <p className="mt-4 text-sm text-mist">
          Accès réservé aux administrateurs.{" "}
          {!user && (
            <Link href="/connexion" className="text-cloud underline">
              Se connecter
            </Link>
          )}
        </p>
      </AdminShell>
    );
  }

  const admin = createAdminClient();
  const [{ data: usersData }, { data: salesData }, { data: htData }] =
    await Promise.all([
      admin.from("analytics_geo_users").select("country_code, role, users"),
      admin.from("analytics_geo_sales").select("country_code, orders, gmv_htg"),
      admin.from("analytics_geo_ht").select("region_code, creators, users"),
    ]);

  // Fusion par pays (jamais par individu).
  const byIso = new Map<string, GeoRow>();
  const get = (iso: string): GeoRow => {
    let r = byIso.get(iso);
    if (!r) {
      r = { iso, users: 0, creators: 0, gmv: 0, orders: 0 };
      byIso.set(iso, r);
    }
    return r;
  };

  for (const u of (usersData ?? []) as UserAgg[]) {
    const r = get(u.country_code);
    r.users += u.users;
    if (u.role === "creator") r.creators += u.users;
  }
  for (const s of (salesData ?? []) as SalesAgg[]) {
    const r = get(s.country_code);
    r.orders += s.orders;
    r.gmv += s.gmv_htg;
  }

  const rows = [...byIso.values()];
  const totalUsers = rows.reduce((s, r) => s + r.users, 0);
  const totalCreators = rows.reduce((s, r) => s + r.creators, 0);
  const totalGmv = rows.reduce((s, r) => s + r.gmv, 0);
  const countriesCovered = rows.filter(
    (r) => r.iso !== "??" && r.users > 0,
  ).length;
  const unknown = byIso.get("??")?.users ?? 0;

  const top = [...rows]
    .filter((r) => r.iso !== "??")
    .sort((a, b) => b.users - a.users)
    .slice(0, 10);

  // Zoom Haïti — talents (créateurs) par département.
  const htRows: HtRow[] = (htData ?? []).map((h: HtAgg) => ({
    code: h.region_code,
    creators: h.creators,
    users: h.users,
  }));
  const htTalents = htRows.reduce((s, r) => s + r.creators, 0);
  const htNoDept = htRows.find((r) => r.code === "??");
  const htByDept = [...htRows]
    .filter((r) => r.code !== "??")
    .sort((a, b) => b.creators - a.creators);

  const stats = [
    { label: "Utilisateurs", value: String(totalUsers) },
    { label: "Créateurs", value: String(totalCreators) },
    { label: "Pays couverts", value: String(countriesCovered) },
    { label: "GMV (payé)", value: formatHTG(totalGmv) },
  ];

  return (
    <AdminShell title="Géo-localisation" actif="/admin/geo" userName={user.displayName}>
      <p className="mt-2 text-sm text-mist">
        D’où viennent nos clients et nos talents.{" "}
        <Link href="/admin" className="text-cloud underline">
          ← Back-office
        </Link>
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-line bg-surface/60 p-5"
          >
            <p className="text-xl font-black text-gradient">{s.value}</p>
            <p className="mt-1 text-xs text-mist">{s.label}</p>
          </div>
        ))}
      </div>

      {totalUsers === 0 ? (
        <p className="mt-10 text-sm text-mist">
          Aucune donnée pour l’instant. La carte se remplira dès que les profils
          renseigneront leur pays.
        </p>
      ) : (
        <>
          {/* Zoom Haïti — marché ciblé, centré sur les talents. */}
          <section className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                Zoom Haïti — talents par département
              </h2>
              <span className="text-xs text-mist">
                {htTalents} talent{htTalents > 1 ? "s" : ""} en Haïti
                {htNoDept?.creators
                  ? ` · ${htNoDept.creators} sans département`
                  : ""}
              </span>
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
              <HaitiMap rows={htRows} />
              <div className="overflow-hidden rounded-2xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface/60 text-left text-xs text-mist">
                    <tr>
                      <th className="px-4 py-3 font-medium">Département</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Talents
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {htByDept.length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-4 py-4 text-mist"
                        >
                          Aucun talent localisé par département pour l’instant.
                        </td>
                      </tr>
                    ) : (
                      htByDept.map((r) => (
                        <tr key={r.code} className="border-t border-line">
                          <td className="px-4 py-2.5 font-medium">
                            {departmentName(r.code)}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {r.creators}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Vue mondiale — diaspora & clients hors Haïti. */}
          <section className="mt-10">
            <h2 className="text-lg font-semibold">Vue mondiale</h2>
            <p className="mt-1 text-xs text-mist">
              Diaspora et clients hors Haïti.
            </p>
            <div className="mt-4">
              <GeoMap rows={rows} />
            </div>
          </section>

          <section className="mt-10">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Top 10 des pays</h2>
              {unknown > 0 && (
                <span className="text-xs text-mist">
                  {unknown} utilisateur{unknown > 1 ? "s" : ""} sans pays
                </span>
              )}
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="bg-surface/60 text-left text-xs text-mist">
                  <tr>
                    <th className="px-4 py-3 font-medium">Pays</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Utilisateurs
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Créateurs
                    </th>
                    <th className="px-4 py-3 text-right font-medium">
                      Commandes
                    </th>
                    <th className="px-4 py-3 text-right font-medium">GMV</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((r) => (
                    <tr key={r.iso} className="border-t border-line">
                      <td className="px-4 py-3 font-medium">
                        {countryName(r.iso)}
                      </td>
                      <td className="px-4 py-3 text-right">{r.users}</td>
                      <td className="px-4 py-3 text-right text-mist">
                        {r.creators}
                      </td>
                      <td className="px-4 py-3 text-right text-mist">
                        {r.orders}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatHTG(r.gmv)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </AdminShell>
  );
}
