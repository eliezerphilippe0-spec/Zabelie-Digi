"use client";

import { useMemo, useState } from "react";
import { WORLD_FEATURES, CENTROIDS, GEO_NAMES } from "@/lib/geo/world";
import { countryName } from "@/lib/geo/countries";

/** Une ligne agrégée par pays (jamais un individu). */
export type GeoRow = {
  iso: string;
  users: number;
  creators: number;
  gmv: number;
  orders: number;
};

type Metric = "users" | "creators" | "gmv";

const METRICS: { key: Metric; label: string }[] = [
  { key: "users", label: "Utilisateurs" },
  { key: "creators", label: "Créateurs" },
  { key: "gmv", label: "Ventes (GMV)" },
];

const W = 1000;
const H = 500;

// Équirectangulaire : lon/lat → x/y du viewBox.
const px = (lng: number) => ((lng + 180) / 360) * W;
const py = (lat: number) => ((90 - lat) / 180) * H;

/** Compteur compact façon "2,6k" / "1,3M". */
function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) {
    const v = n / 1000;
    return `${v.toFixed(v < 10 ? 1 : 0).replace(".", ",").replace(",0", "")}k`;
  }
  const v = n / 1_000_000;
  return `${v.toFixed(1).replace(".", ",").replace(",0", "")}M`;
}

// Chemins SVG du fond de carte (une seule fois).
const LAND = WORLD_FEATURES.map((f) => {
  const polys =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : (f.geometry.coordinates as number[][][][]);
  let d = "";
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lng, lat], i) => {
        d += `${i === 0 ? "M" : "L"}${px(lng).toFixed(1)} ${py(lat).toFixed(1)}`;
      });
      d += "Z";
    }
  }
  return { iso: f.properties.iso, d };
});

export function GeoMap({ rows }: { rows: GeoRow[] }) {
  const [metric, setMetric] = useState<Metric>("users");

  const value = (r: GeoRow) =>
    metric === "users" ? r.users : metric === "creators" ? r.creators : r.gmv;

  const bubbles = useMemo(() => {
    const withPos = rows
      .filter((r) => r.iso !== "??" && CENTROIDS[r.iso] && value(r) > 0)
      .map((r) => ({ r, v: value(r), c: CENTROIDS[r.iso] }));
    const max = withPos.reduce((m, b) => Math.max(m, b.v), 0) || 1;
    // grandes bulles dessinées d'abord (dessous), petites au-dessus.
    return withPos
      .sort((a, b) => b.v - a.v)
      .map((b) => ({
        ...b,
        radius: 9 + Math.sqrt(b.v / max) * 23,
      }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, metric]);

  return (
    <div>
      <div className="mb-4 inline-flex rounded-xl border border-line bg-surface/60 p-1">
        {METRICS.map((m) => (
          <button
            key={m.key}
            onClick={() => setMetric(m.key)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              metric === m.key
                ? "bg-accent text-white"
                : "text-mist hover:text-cloud"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-ink-soft">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[640px]"
          role="img"
          aria-label="Répartition des utilisateurs par pays"
        >
          <defs>
            <linearGradient id="bubble" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="100%" stopColor="var(--color-brand)" />
            </linearGradient>
          </defs>

          {/* Océan / fond */}
          <rect x="0" y="0" width={W} height={H} fill="var(--color-ink)" />

          {/* Terres */}
          <g fill="var(--color-surface)" stroke="var(--color-ink-soft)" strokeWidth="0.4">
            {LAND.map((l, i) => (
              <path key={i} d={l.d} />
            ))}
          </g>

          {/* Bulles agrégées */}
          <g>
            {bubbles.map(({ r, v, c, radius }) => {
              const x = px(c[0]);
              const y = py(c[1]);
              const label = compact(v);
              return (
                <g key={r.iso}>
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill="url(#bubble)"
                    fillOpacity="0.9"
                    stroke="var(--color-ink)"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.max(9, radius * 0.7)}
                    fontWeight="700"
                    fill="var(--color-cloud)"
                    style={{ pointerEvents: "none" }}
                  >
                    {label}
                  </text>
                  <title>
                    {countryName(r.iso, GEO_NAMES[r.iso])} — {METRICS.find((m) => m.key === metric)!.label}: {label}
                  </title>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <p className="mt-3 text-xs text-mist">
        Données agrégées par pays. Aucune position individuelle n’est stockée ni
        affichée.
      </p>
    </div>
  );
}
