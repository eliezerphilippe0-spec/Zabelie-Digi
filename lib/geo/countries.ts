// Zabelie — Référentiel pays (ISO-3166-1 alpha-2 → nom FR).
// Marché ciblé : Haïti. Le sélecteur de profil est centré sur Haïti + la
// diaspora haïtienne principale. Tout autre code pays reste géré par le
// dashboard (repli sur le nom du fond de carte mondial, cf. lib/geo/world).

export type Country = { code: string; name: string };

export const COUNTRIES: Country[] = [
  // Haïti
  { code: "HT", name: "Haïti" },
  // Caraïbes voisines
  { code: "DO", name: "République dominicaine" },
  { code: "BS", name: "Bahamas" },
  { code: "TC", name: "Îles Turques-et-Caïques" },
  { code: "CU", name: "Cuba" },
  { code: "JM", name: "Jamaïque" },
  // Diaspora haïtienne principale
  { code: "US", name: "États-Unis" },
  { code: "CA", name: "Canada" },
  { code: "FR", name: "France" },
  { code: "GF", name: "Guyane française" },
  { code: "CL", name: "Chili" },
  { code: "BR", name: "Brésil" },
  { code: "MX", name: "Mexique" },
  { code: "BE", name: "Belgique" },
  { code: "ES", name: "Espagne" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "DE", name: "Allemagne" },
];

const NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c.name]),
);

/** Nom FR d'un code ISO, avec repli optionnel (ex: nom du fond de carte). */
export function countryName(code: string, fallback?: string): string {
  if (code === "??") return "Non renseigné";
  return NAME_BY_CODE[code] ?? fallback ?? code;
}
