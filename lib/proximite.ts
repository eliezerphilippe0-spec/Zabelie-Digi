import { cheminZone, sousArbre, type Zone } from "@/lib/zones";
import type { NiveauProximite } from "@/lib/proximite-niveaux";

export type { NiveauProximite } from "@/lib/proximite-niveaux";

/**
 * PROXIMITÉ APPROXIMATIVE — vendeurs et acheteurs situés par ZONE, jamais par
 * coordonnées (décision du porteur, 2026-10-29 : livrer loin n'est pas viable,
 * le vendeur livre lui-même, donc la zone suffit).
 *
 * Tout ce fichier est PUR : aucun accès réseau ni base. La lecture des vendeurs
 * d'une zone vit dans `lib/proximite-serveur.ts`.
 *
 * Pourquoi la zone et pas le GPS :
 *   • `zabelie_zones` ne porte AUCUNE coordonnée ; en inventer de mémoire pour
 *     des centaines de localités serait fabriquer une donnée de référence ;
 *   • aucune permission à demander, aucune coordonnée envoyée à un tiers, et ça
 *     marche sur un Android d'entrée de gamme en 3G ;
 *   • la zone est déjà ce que le vendeur déclare (`0069`) et ce que le
 *     catalogue filtre.
 */

/**
 * Un lieu comparable : accents pliés, minuscules, tout ce qui n'est pas lettre
 * ou chiffre devient une espace.
 *
 * ⚠️ On découpe en MOTS et on compare des séquences de mots — pas de regex à
 * frontière `\b`. `\b` ne connaît pas les accents (`CLAUDE.md`, « `\b` ne connaît
 * pas le kreyòl ») : « Plèn dinò » et « Sen Rafayèl » finissent par une lettre
 * accentuée, exactement le cas où la frontière tombe du mauvais côté. Plier les
 * accents d'abord rend la question sans objet.
 */
export function normaliserLieu(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const PROFONDEUR: Record<Zone["level"], number> = { depatman: 0, komin: 1, katye: 2 };

/** Un passage du texte (mots `debut` à `fin`) et toutes les zones qui portent ce nom. */
type Passage = { debut: number; fin: number; zones: Zone[] };

/** Borne du produit cartésien des lectures possibles : au-delà, on ne tranche pas. */
const LECTURES_MAX = 500;

/**
 * Les zones sont-elles cohérentes ? Une seule zone la plus fine, et toutes les
 * autres en sont des ancêtres (« Carénage, Cap-Haïtien » : oui ; « Okap ou
 * Limbé » : non, deux communes). Rend la zone la plus fine, ou `null`.
 */
function zoneCoherente(zones: Zone[], choisies: Zone[]): Zone | null {
  const distinctes = [...new Map(choisies.map((z) => [z.id, z])).values()];
  const plusFin = Math.max(...distinctes.map((z) => PROFONDEUR[z.level]));
  const fines = distinctes.filter((z) => PROFONDEUR[z.level] === plusFin);
  if (fines.length !== 1) return null;
  const ancetres = new Set(cheminZone(zones, fines[0].id).map((z) => z.id));
  return distinctes.every((z) => ancetres.has(z.id)) ? fines[0] : null;
}

/**
 * La zone que désigne un lieu saisi à la main (« Okap », « Carénage, Cap-Haïtien »,
 * « je suis à Limonade »), ou `null`.
 *
 * `null` est une réponse HONNÊTE, pas un échec : l'appelant doit alors le DIRE à
 * l'acheteur au lieu de classer sur une supposition. On ne devine jamais :
 *
 *   • des lieux contradictoires dans le même texte (« Okap ou Limbé ») → `null` ;
 *   • un nom de moins de 3 lettres → ignoré (« Nò » plié en « no » se
 *     confondrait avec le mot « no ») ;
 *   • dans une PHRASE, un nom de moins de 4 lettres, ou un département, est
 *     ignoré — « au nord de la ville » ne désigne pas le département Nord. Un
 *     département se reconnaît seulement quand c'est TOUTE la réponse.
 *
 * Plusieurs zones PORTENT le même nom ? (« Centre-ville » existera dans
 * beaucoup de communes.) Le reste du texte tranche s'il le peut : « Centre-ville,
 * Limbé » désigne celui de Limbé. S'il ne le peut pas, on ne choisit PAS le plus
 * précis : on rend la zone la plus large qui contient toutes les lectures
 * possibles (la commune), ou `null` si elles sont dans des branches différentes.
 * Dire « commune » à tort est une erreur légère ; dire « quartier » à tort
 * classerait un vendeur comme voisin sur une supposition.
 *
 * Les mentions qui se recouvrent se résolvent au profit de la plus longue :
 * « Centre-ville » ne laisse pas le département « Centre » se glisser dans le
 * résultat, et « Bas-Limbé » ne devient pas « Limbé ».
 */
export function zoneDepuisTexte(zones: Zone[], texte: string): Zone | null {
  const mots = normaliserLieu(texte).split(" ").filter(Boolean);
  if (mots.length === 0) return null;

  // 1. Tous les passages du texte qui portent un nom de zone.
  const parPassage = new Map<string, Passage>();
  for (const zone of zones) {
    const noms = new Set<string>();
    for (const brut of [zone.label_kr, zone.label_fr, zone.label_en, zone.label_es, zone.slug.replace(/-/g, " ")]) {
      if (brut) noms.add(normaliserLieu(brut));
    }
    for (const nom of noms) {
      if (nom.length < 3) continue;
      const nomMots = nom.split(" ");
      const complet = nomMots.length === mots.length;
      if (!complet && (zone.level === "depatman" || nom.length < 4)) continue;
      for (let d = 0; d + nomMots.length <= mots.length; d++) {
        if (!nomMots.every((m, i) => mots[d + i] === m)) continue;
        const cle = `${d}:${d + nomMots.length}`;
        const passage = parPassage.get(cle) ?? { debut: d, fin: d + nomMots.length, zones: [] };
        if (!passage.zones.some((z) => z.id === zone.id)) passage.zones.push(zone);
        parPassage.set(cle, passage);
      }
    }
  }

  // 2. Le plus long d'abord ; un passage plus court qui en chevauche un retenu
  //    disparaît. Deux lectures de MÊME longueur qui se chevauchent sans être
  //    le même passage : le texte se lit de deux façons, on ne tranche pas.
  const profondeurMax = (p: Passage) => Math.max(...p.zones.map((z) => PROFONDEUR[z.level]));
  const ordre = [...parPassage.values()].sort(
    (a, b) => b.fin - b.debut - (a.fin - a.debut) || profondeurMax(b) - profondeurMax(a) || a.debut - b.debut
  );
  const retenus: Passage[] = [];
  for (const p of ordre) {
    const choc = retenus.find((o) => o.debut < p.fin && p.debut < o.fin);
    if (!choc) retenus.push(p);
    else if (choc.fin - choc.debut === p.fin - p.debut) return null;
  }
  if (retenus.length === 0) return null;

  // 3. Chaque combinaison de lectures (une zone par passage) qui forme une
  //    chaîne cohérente donne UNE zone la plus fine.
  if (retenus.reduce((n, p) => n * p.zones.length, 1) > LECTURES_MAX) return null;
  const lectures = new Map<string, Zone>();
  const choisies: Zone[] = [];
  const explorer = (i: number): void => {
    if (i === retenus.length) {
      const cible = zoneCoherente(zones, choisies);
      if (cible) lectures.set(cible.id, cible);
      return;
    }
    for (const z of retenus[i].zones) {
      choisies[i] = z;
      explorer(i + 1);
    }
  };
  explorer(0);

  // 4. Une lecture : c'est elle. Plusieurs : la plus large qui contient toutes
  //    les autres, sinon ambigu.
  const valides = [...lectures.values()];
  if (valides.length <= 1) return valides[0] ?? null;
  return (
    valides.find((z) =>
      valides.every((o) => o.id === z.id || cheminZone(zones, o.id).some((a) => a.id === z.id))
    ) ?? null
  );
}

/**
 * Les zones qui définissent « près de » pour un acheteur situé dans `zoneId` :
 * son quartier, sa commune, son département — chacun avec tout son sous-arbre.
 *
 * `null` pour un niveau que l'acheteur n'a pas déclaré (il a dit sa commune, pas
 * son quartier : on ne prétend pas savoir s'il est dans le même quartier).
 * Zone inconnue de la liste → `null` partout : aucune proximité inventée.
 */
export type Perimetres = {
  katye: string[] | null;
  komin: string[] | null;
  depatman: string[];
};

export function perimetresProximite(zones: Zone[], zoneId: string): Perimetres | null {
  const chemin = cheminZone(zones, zoneId);
  const depatman = chemin.find((z) => z.level === "depatman");
  if (!depatman) return null;
  const komin = chemin.find((z) => z.level === "komin");
  const katye = chemin.find((z) => z.level === "katye");
  return {
    katye: katye ? sousArbre(zones, katye.id) : null,
    komin: komin ? sousArbre(zones, komin.id) : null,
    depatman: sousArbre(zones, depatman.id),
  };
}

/** Les marchands trouvés dans chaque périmètre, et ceux qui ont déclaré une zone. */
export type EnsemblesVendeurs = {
  katye: ReadonlySet<string> | null;
  komin: ReadonlySet<string> | null;
  depatman: ReadonlySet<string>;
  avecZone: ReadonlySet<string>;
};

/**
 * Le niveau de proximité d'UN vendeur : le plus petit périmètre qui le contient.
 *
 * Hors des trois périmètres, la différence entre `ailleurs` et `inconnue` tient
 * à `avecZone` : un vendeur qui a déclaré une zone ailleurs est « loin » ; un
 * vendeur sans zone est « inconnu », et on ne le dit pas loin.
 */
export function niveauProximite(vendeurId: string, ens: EnsemblesVendeurs): NiveauProximite {
  if (ens.katye?.has(vendeurId)) return "katye";
  if (ens.komin?.has(vendeurId)) return "komin";
  if (ens.depatman.has(vendeurId)) return "depatman";
  return ens.avecZone.has(vendeurId) ? "ailleurs" : "inconnue";
}

/**
 * Le meilleur niveau de proximité des zones où un vendeur DÉCLARE livrer
 * (`zabelie_seller_service_zones`, 0158), pour un acheteur de périmètres `per`.
 *
 * Même règle que pour la zone d'installation : le plus petit périmètre de
 * l'acheteur qui contient une zone desservie. Une zone desservie plus LARGE que
 * l'acheteur (« toute la commune » pour un acheteur d'un quartier) tombe dans le
 * périmètre de son propre niveau — la commune — donc « dessert votre commune » :
 * précis plutôt que flatteur. Une zone plus étroite, dans la commune de
 * l'acheteur qui n'a déclaré que sa commune, compte comme « commune ».
 *
 * Aucune zone déclarée → `inconnue` (on ne sait pas), jamais `ailleurs`.
 * Des zones déclarées, aucune près de l'acheteur → `ailleurs`.
 */
export function niveauDesserte(zoneIds: readonly string[], per: Perimetres): NiveauProximite {
  if (zoneIds.length === 0) return "inconnue";
  const dans = (perimetre: readonly string[] | null) => !!perimetre && zoneIds.some((id) => perimetre.includes(id));
  if (dans(per.katye)) return "katye";
  if (dans(per.komin)) return "komin";
  if (dans(per.depatman)) return "depatman";
  return "ailleurs";
}
