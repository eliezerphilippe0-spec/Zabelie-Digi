"use client";

import { HT_FEATURES } from "@/lib/geo/haiti";

/** Compteur de talents (créateurs) agrégé par département. */
export type HtRow = { code: string; creators: number; users: number };

const W = 820;
const H = 520;
const PAD = 28;

// Projection équirectangulaire ajustée à la bbox d'Haïti (sans distorsion :
// l'axe des longitudes est corrigé par cos(latitude médiane)).
const allPts: [number, number][] = [];
for (const f of HT_FEATURES) {
  const polys =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : (f.geometry.coordinates as number[][][][]);
  for (const poly of polys)
    for (const ring of poly)
      for (const [lng, lat] of ring) allPts.push([lng, lat]);
}
const latMid =
  allPts.reduce((s, p) => s + p[1], 0) / (allPts.length || 1);
const kx = Math.cos((latMid * Math.PI) / 180);
const X = (lng: number) => lng * kx;
const Y = (lat: number) => -lat;
const xs = allPts.map((p) => X(p[0]));
const ys = allPts.map((p) => Y(p[1]));
const xMin = Math.min(...xs),
  xMax = Math.max(...xs);
const yMin = Math.min(...ys),
  yMax = Math.max(...ys);
const scale = Math.min(
  (W - 2 * PAD) / (xMax - xMin),
  (H - 2 * PAD) / (yMax - yMin),
);
const offX = (W - scale * (xMax - xMin)) / 2;
const offY = (H - scale * (yMax - yMin)) / 2;
const px = (lng: number) => (X(lng) - xMin) * scale + offX;
const py = (lat: number) => (Y(lat) - yMin) * scale + offY;

// Chemins + centroïdes projetés (une seule fois).
const DEPTS = HT_FEATURES.map((f) => {
  const polys =
    f.geometry.type === "Polygon"
      ? [f.geometry.coordinates as number[][][]]
      : (f.geometry.coordinates as number[][][][]);
  let d = "";
  for (const poly of polys)
    for (const ring of poly) {
      ring.forEach(([lng, lat], i) => {
        d += `${i === 0 ? "M" : "L"}${px(lng).toFixed(1)} ${py(lat).toFixed(1)}`;
      });
      d += "Z";
    }
  return {
    code: f.properties.code,
    name: f.properties.name,
    d,
    cx: px(f.properties.c[0]),
    cy: py(f.properties.c[1]),
  };
});

export function HaitiMap({ rows }: { rows: HtRow[] }) {
  const byCode = new Map(rows.map((r) => [r.code, r]));
  const max = rows.reduce((m, r) => Math.max(m, r.creators), 0) || 1;

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-line bg-ink-soft">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[420px]"
          role="img"
          aria-label="Talents par département d'Haïti"
        >
          {DEPTS.map((dep) => {
            const v = byCode.get(dep.code)?.creators ?? 0;
            const t = v / max; // 0..1
            const fill = `rgba(124, 92, 255, ${(0.12 + t * 0.78).toFixed(3)})`;
            return (
              <g key={dep.code}>
                <path
                  d={dep.d}
                  fill={fill}
                  stroke="var(--color-ink)"
                  strokeWidth="1.2"
                />
                <title>
                  {dep.name} — {v} talent{v > 1 ? "s" : ""}
                </title>
              </g>
            );
          })}
          {DEPTS.map((dep) => {
            const v = byCode.get(dep.code)?.creators ?? 0;
            return (
              <text
                key={`t-${dep.code}`}
                x={dep.cx}
                y={dep.cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="15"
                fontWeight="800"
                fill="var(--color-cloud)"
                style={{ pointerEvents: "none" }}
              >
                {v}
              </text>
            );
          })}
        </svg>
      </div>
      <p className="mt-3 text-xs text-mist">
        Intensité = nombre de talents (créateurs) par département. Agrégé, aucune
        position individuelle.
      </p>
    </div>
  );
}
