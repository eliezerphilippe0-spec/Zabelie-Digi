// Zabelie — Accès partagé au fond de carte monde (Natural Earth 110m,
// dégraissé : géométrie arrondie + code ISO-A2 + centroïde précalculé).
import world from "./world-110m.geo.json";

export type WorldFeature = {
  properties: { iso: string; name: string; c: [number, number] };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

export const WORLD_FEATURES = (world as unknown as { features: WorldFeature[] })
  .features;

/** Centroïde [lng, lat] par code ISO-A2. */
export const CENTROIDS: Record<string, [number, number]> = Object.fromEntries(
  WORLD_FEATURES.map((f) => [f.properties.iso, f.properties.c]),
);

/** Nom (EN, source Natural Earth) par code ISO-A2 — repli du libellé FR. */
export const GEO_NAMES: Record<string, string> = Object.fromEntries(
  WORLD_FEATURES.map((f) => [f.properties.iso, f.properties.name]),
);
