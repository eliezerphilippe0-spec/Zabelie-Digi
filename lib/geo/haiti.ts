// Zabelie — Référentiel départements d'Haïti (ISO-3166-2:HT).
// Fond de carte : Natural Earth admin-1 dégraissé (géométrie arrondie + code +
// nom FR + centroïde précalculé).
import ht from "./haiti-departments.geo.json";

export type HtFeature = {
  properties: { code: string; name: string; c: [number, number] };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
};

export const HT_FEATURES = (ht as unknown as { features: HtFeature[] }).features;

/** Liste { code, name } triée par nom — pour le sélecteur de profil. */
export const HT_DEPARTMENTS = HT_FEATURES.map((f) => ({
  code: f.properties.code,
  name: f.properties.name,
})).sort((a, b) => a.name.localeCompare(b.name, "fr"));

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  HT_FEATURES.map((f) => [f.properties.code, f.properties.name]),
);

/** Nom FR d'un département, ou 'Non renseigné' pour '??'. */
export function departmentName(code: string): string {
  if (code === "??") return "Non renseigné";
  return NAME_BY_CODE[code] ?? code;
}
