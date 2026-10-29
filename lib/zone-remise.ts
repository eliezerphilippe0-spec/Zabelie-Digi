/**
 * La zone de REMISE d'une commande physique (0161, docs/77 §12) — logique pure.
 *
 * Aucun import : le composant client du bouton d'achat et la route de paiement
 * partagent ce module, et `lib/zones.ts` tire le client serveur de Supabase
 * (donc `next/headers`), qu'un composant client ne doit jamais atteindre. Le
 * recouvrement d'arbre est donc réécrit ici, en petit ; `tests/zone-remise.test.ts`
 * le confronte à `zonesRecouvrantes` pour qu'il ne dérive pas.
 *
 * La zone de remise n'est PAS celle de l'appareil : un acheteur de la diaspora
 * commande pour un proche resté en Haïti. Elle se choisit à chaque commande.
 * Le cookie `zabelie_zone` ne la préremplit PAS : la politique de
 * confidentialité (§8) déclare qu'il ne sert qu'à classer les offres proches,
 * et un nouvel usage demanderait une nouvelle version de la politique.
 */

export type ZoneRemiseNoeud = {
  id: string;
  parent_id: string | null;
  level: "depatman" | "komin" | "katye";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ce que le corps d'une requête de paiement porte pour `deliveryZoneId` :
 * un identifiant bien formé ou rien. Toute autre forme (nombre, objet, chaîne
 * libre) rend `null` — la zone est une classification facultative, jamais une
 * raison de refuser un paiement.
 */
export function parseZoneRemise(valeur: unknown): string | null {
  return typeof valeur === "string" && UUID.test(valeur) ? valeur.toLowerCase() : null;
}

/** Un niveau acceptable comme zone de remise : commune ou quartier, jamais le département seul. */
export function niveauRemiseValide(level: string): boolean {
  return level === "komin" || level === "katye";
}

/** Les ancêtres d'une zone, du plus proche au plus lointain. Borné : un cycle termine. */
function ancetres(zones: readonly ZoneRemiseNoeud[], id: string): string[] {
  const parId = new Map(zones.map((z) => [z.id, z]));
  const res: string[] = [];
  let courant = parId.get(id);
  for (let garde = 0; courant?.parent_id && garde < zones.length; garde++) {
    if (res.includes(courant.parent_id) || courant.parent_id === id) break;
    res.push(courant.parent_id);
    courant = parId.get(courant.parent_id);
  }
  return res;
}

/** Les descendants d'une zone (sans elle). Borné par la taille de la liste. */
function descendants(zones: readonly ZoneRemiseNoeud[], id: string): string[] {
  const dedans = new Set<string>([id]);
  for (let tour = 0; tour <= zones.length; tour++) {
    let ajout = false;
    for (const z of zones) {
      if (z.parent_id && dedans.has(z.parent_id) && !dedans.has(z.id)) {
        dedans.add(z.id);
        ajout = true;
      }
    }
    if (!ajout) break;
  }
  dedans.delete(id);
  return [...dedans];
}

/**
 * Le vendeur déclare-t-il livrer là où l'acheteur veut recevoir ? Vrai quand la
 * zone choisie, un de ses ancêtres (le vendeur dessert tout le département) ou un
 * de ses descendants (il dessert un quartier de cette commune) figure parmi les
 * zones DÉCLARÉES. Un quartier frère ne recouvre pas.
 *
 * ⚠️ Une couverture VIDE ne veut pas dire « ne livre pas » : elle veut dire « n'a
 * rien déclaré », donc « on ne sait pas ». L'appelant ne montre aucune réserve
 * dans ce cas (même doctrine que `inconnue` ≠ `ailleurs`, lib/proximite-niveaux).
 */
export function zoneCouverte(
  zones: readonly ZoneRemiseNoeud[],
  couverture: readonly string[],
  destination: string,
): boolean {
  if (couverture.length === 0) return false;
  const declarees = new Set(couverture);
  if (declarees.has(destination)) return true;
  if (ancetres(zones, destination).some((a) => declarees.has(a))) return true;
  return descendants(zones, destination).some((d) => declarees.has(d));
}

/** La réserve à afficher : le vendeur a déclaré des zones, et aucune ne recouvre la destination. */
export function reserveZoneRemise(
  zones: readonly ZoneRemiseNoeud[],
  couverture: readonly string[],
  destination: string | null,
): boolean {
  if (!destination || couverture.length === 0) return false;
  return !zoneCouverte(zones, couverture, destination);
}

/**
 * La zone effective d'une sélection en cascade : la plus profonde choisie, MAIS
 * seulement si elle est commune ou quartier — un département seul rend `null`
 * (trop large pour organiser une remise ; la base le refuse aussi, ZB161).
 */
export function zoneEffective(
  zones: readonly ZoneRemiseNoeud[],
  departement: string,
  commune: string,
  quartier: string,
): string | null {
  const id = quartier || commune || departement;
  if (!id) return null;
  const z = zones.find((x) => x.id === id);
  return z && niveauRemiseValide(z.level) ? z.id : null;
}

/**
 * Les conditions qu'un vendeur ANNONCE pour une zone (0164) : frais, délai, pause. `pausedUntil` n'est
 * renseigné que si la pause est EN COURS au moment où le serveur rend la page — le navigateur ne compare
 * jamais une date à son horloge.
 */
export type ConditionZone = {
  zoneId: string;
  feeHtg: number | null;
  delayHours: number | null;
  pausedUntil: string | null;
};

/**
 * Les conditions qui s'appliquent à une destination : la zone déclarée la plus PROCHE qui la recouvre —
 * la destination elle-même, sinon son ancêtre le plus bas (« tout Delmas » vaut pour « Delmas 33 » ; un
 * quartier plus précis l'emporte sur la commune). Une zone déclarée PLUS BASSE que la destination (le
 * vendeur ne dessert qu'un quartier de la commune choisie) ne donne pas de conditions : elles
 * s'appliqueraient à une partie seulement de ce que l'acheteur a choisi.
 */
export function conditionsPourZone(
  zones: readonly ZoneRemiseNoeud[],
  conditions: readonly ConditionZone[],
  destination: string | null,
): ConditionZone | null {
  if (!destination) return null;
  const parId = new Map(conditions.map((c) => [c.zoneId, c]));
  const exacte = parId.get(destination);
  if (exacte) return exacte;
  for (const ancetre of ancetres(zones, destination)) {
    const c = parId.get(ancetre);
    if (c) return c;
  }
  return null;
}
