import { cheminZone, libelleZone, type Zone } from "@/lib/zones";
import { normaliserLieu } from "@/lib/proximite";
import type { Lang } from "@/lib/i18n";

/**
 * LA ZONE MÉMORISÉE DE L'ACHETEUR — la logique PURE (docs/77 §11).
 *
 * Décision du porteur (2026-10-29) : mémoriser la zone de l'acheteur, par un
 * COOKIE (choix « cookie + politique v4 »). Ce que le cookie contient, et ce
 * qu'il ne contient pas :
 *   • un identifiant de zone (département, commune ou quartier) — jamais une
 *     position précise, jamais un texte libre, jamais un identifiant de personne ;
 *   • posé SEULEMENT quand l'acheteur clique « Mémoriser ma zone » ;
 *   • lu par le serveur uniquement (HttpOnly), pour préremplir sa localité dans
 *     l'assistant et lui proposer le catalogue de sa zone.
 * Il est déclaré dans la politique de confidentialité (§8, quatre langues) : le
 * test `tests/politique-cookies.test.ts` interdit qu'un cookie du code n'y soit pas.
 *
 * Ce module ne lit ni la base ni `next/headers` : il se teste sans rien. La
 * lecture du cookie vit dans `lib/zone-acheteur-serveur.ts`.
 */
export const COOKIE_ZONE = "zabelie_zone";
export const ZONE_JOURS = 180;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * La zone désignée par la valeur d'un cookie, ou `null`.
 *
 * La liste fournie ne porte que les zones OUVERTES (la RLS de `zabelie_zones`
 * masque les fermées) : une zone fermée depuis la pose du cookie, une valeur
 * forgée, un identifiant inconnu rendent donc tous `null` — jamais une erreur,
 * jamais une zone inventée. Un cookie illisible est un cookie absent.
 */
export function zoneMemorisee(zones: readonly Zone[], valeur: unknown): Zone | null {
  if (typeof valeur !== "string" || !UUID.test(valeur)) return null;
  const id = valeur.toLowerCase();
  return zones.find((z) => z.id.toLowerCase() === id) ?? null;
}

/**
 * Le lieu en toutes lettres, tel qu'on le TAPERAIT : « Karenaj, Okap » pour un
 * quartier, « Okap » pour une commune, « Nò » pour un département.
 *
 * Le quartier est suivi de sa commune parce que des quartiers homonymes existent
 * dans plusieurs communes (« Centre-ville ») : le seul nom serait ambigu, et le
 * moteur de reconnaissance de lieu (`zoneDepuisTexte`) tranche par le reste du
 * texte. Un lieu qui n'est pas dans la liste rend `""`.
 *
 * ⚠️ Un nom de moins de trois lettres n'est PAS reconnu par le moteur (il le
 * refuse exprès : « no » ne doit pas devenir « Nò »). Le département du Nord
 * s'écrit « Nò » en kreyòl, deux lettres : le prérempli serait « non reconnu ».
 * Dans ce cas, et seulement dans ce cas, le nom français est utilisé. Mesuré par
 * `tests/zone-acheteur.test.ts` sur toutes les zones, dans les quatre langues.
 */
export function texteLieu(zones: readonly Zone[], zone: Zone, lang: Lang): string {
  const chemin = cheminZone([...zones], zone.id);
  if (!chemin.length) return "";
  const utiles = zone.level === "katye" ? chemin.slice(-2) : chemin.slice(-1);
  const nom = (z: Zone) => {
    const dansLaLangue = libelleZone(z, lang);
    return normaliserLieu(dansLaLangue).length >= 3 ? dansLaLangue : z.label_fr;
  };
  return utiles.map(nom).reverse().join(", ");
}

/**
 * Les paramètres du filtre « Zone » du catalogue (`zd`, `zk`, `zq`) pour cette
 * zone — le même format que le formulaire de `/catalogue`. `""` si la zone n'est
 * pas dans la liste : pas de lien plutôt qu'un lien qui filtrerait à contresens.
 */
export function paramsCatalogue(zones: readonly Zone[], zone: Zone): string {
  const chemin = cheminZone([...zones], zone.id);
  const dep = chemin.find((z) => z.level === "depatman");
  if (!dep) return "";
  const params = new URLSearchParams({ zd: dep.id });
  const komin = chemin.find((z) => z.level === "komin");
  if (komin) params.set("zk", komin.id);
  const katye = chemin.find((z) => z.level === "katye");
  if (katye) params.set("zq", katye.id);
  return params.toString();
}

/** Les attributs du cookie — un seul endroit, pour que « poser » et « effacer » s'accordent. */
export function optionsCookieZone(production: boolean, effacer = false) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: production,
    path: "/",
    maxAge: effacer ? 0 : ZONE_JOURS * 24 * 60 * 60,
  };
}
