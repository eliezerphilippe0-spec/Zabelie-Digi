/**
 * Zones de service d'un vendeur (0158) — la logique PURE, sans base ni réseau.
 *
 * Le vendeur envoie la liste COMPLÈTE de ses zones ; la route n'écrit que la
 * différence. Écrire le delta plutôt que « tout effacer, tout réinsérer » évite
 * qu'un échec en cours de route ne laisse un vendeur sans aucune zone, et laisse
 * le garde de la base (plafond, zone fermée) juger seulement ce qui est NOUVEAU.
 */
export type PlanZones = {
  /** Zones demandées, sans doublon, dans l'ordre reçu. */
  finales: string[];
  ajouter: string[];
  retirer: string[];
};

export function planifierZones(actuelles: readonly string[], voulues: readonly string[]): PlanZones {
  const finales = [...new Set(voulues)];
  const avant = new Set(actuelles);
  const apres = new Set(finales);
  return {
    finales,
    ajouter: finales.filter((id) => !avant.has(id)),
    retirer: [...avant].filter((id) => !apres.has(id)),
  };
}

/** Plafond de zones qu'un client peut ENVOYER, indépendamment du plafond commercial (config en base). */
export const MAX_ZONES_PAR_REQUETE = 100;

/* ─── Les CONDITIONS d'une zone (0164) : frais annoncés, délai annoncé, pause ───
 *
 * Toujours des DÉCLARATIONS du vendeur, jamais une garantie de Zabelie. Les frais
 * ne sont PAS ajoutés au paiement (docs/77 §12.4) : une information affichée.
 * La pause porte une DATE calculée ICI, côté serveur, jamais par le navigateur :
 * l'horloge du client ne décide pas jusqu'à quand une zone est suspendue.
 */
export const MAX_FRAIS_HTG = 100_000;
export const MAX_DELAI_HEURES = 720;
/** Plafond d'une demande de pause ; le plafond COMMERCIAL est en base (`max_pause_days`, ZB164). */
export const MAX_PAUSE_JOURS_REQUETE = 90;

export type PauseVoulue = { action: "keep" } | { action: "clear" } | { action: "set"; days: number };

/**
 * Une zone voulue avec ses conditions. `undefined` = « ne pas toucher » (une zone
 * qui existe garde sa valeur, une zone nouvelle part à `null`) ; `null` = « effacer ».
 * La différence compte : le format d'avant (`zoneIds` seul) ne doit jamais effacer
 * les frais qu'un vendeur a déjà posés.
 */
export type ZoneVoulue = {
  zoneId: string;
  feeHtg: number | null | undefined;
  delayHours: number | null | undefined;
  pause: PauseVoulue;
};

export type ConditionsZone = {
  feeHtg: number | null;
  delayHours: number | null;
  /** ISO 8601, ou `null` : pas de pause. Une date PASSÉE est une pause expirée. */
  pausedUntil: string | null;
};

export type LigneZone = {
  zone_id: string;
  fee_htg: number | null;
  delay_hours: number | null;
  paused_until: string | null;
};

export type PlanConditions = {
  finales: string[];
  ajouter: LigneZone[];
  modifier: LigneZone[];
  retirer: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un entier dans [min, max], `null` (effacer) ou `undefined` (ne pas toucher) ; tout autre est invalide. */
function entierOuNul(v: unknown, min: number, max: number): number | null | undefined | "invalide" {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) return "invalide";
  return v;
}

function lirePause(v: unknown): PauseVoulue | null {
  if (v === undefined) return { action: "keep" };
  if (typeof v !== "object" || v === null) return null;
  const o = v as { action?: unknown; days?: unknown };
  if (o.action === "keep" || o.action === "clear") return { action: o.action };
  if (o.action === "set" && typeof o.days === "number" && Number.isInteger(o.days) && o.days >= 1 && o.days <= MAX_PAUSE_JOURS_REQUETE) {
    return { action: "set", days: o.days };
  }
  return null;
}

/**
 * Le corps d'un PUT : `{ zones: [{ zoneId, feeHtg?, delayHours?, pause? }] }`, ou le format
 * d'avant `{ zoneIds: [...] }` (conditions intactes). `null` = corps invalide, rien n'est écrit.
 * Un doublon de zone est invalide : deux lignes pour la même zone seraient ambiguës.
 */
export function lireZonesVoulues(corps: unknown): ZoneVoulue[] | null {
  if (typeof corps !== "object" || corps === null) return null;
  const { zones, zoneIds } = corps as { zones?: unknown; zoneIds?: unknown };
  let brut: unknown[];
  if (Array.isArray(zones)) brut = zones;
  else if (Array.isArray(zoneIds)) brut = zoneIds.map((zoneId) => ({ zoneId }));
  else return null;
  if (brut.length > MAX_ZONES_PAR_REQUETE) return null;
  const vues = new Set<string>();
  const res: ZoneVoulue[] = [];
  for (const item of brut) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as { zoneId?: unknown; feeHtg?: unknown; delayHours?: unknown; pause?: unknown };
    if (typeof o.zoneId !== "string" || !UUID.test(o.zoneId)) return null;
    const id = o.zoneId.toLowerCase();
    if (vues.has(id)) return null;
    vues.add(id);
    const fee = entierOuNul(o.feeHtg, 0, MAX_FRAIS_HTG);
    const delay = entierOuNul(o.delayHours, 1, MAX_DELAI_HEURES);
    const pause = lirePause(o.pause);
    if (fee === "invalide" || delay === "invalide" || pause === null) return null;
    res.push({ zoneId: id, feeHtg: fee, delayHours: delay, pause });
  }
  return res;
}

/**
 * Ce qu'il faut écrire pour passer de l'état actuel à l'état voulu. Les zones présentes des deux
 * côtés ne sont réécrites QUE si une condition change (jamais « tout réécrire »). Une pause
 * « poser N jours » part de `maintenant` ; « garder » conserve la date existante.
 */
export function planifierConditions(
  actuelles: ReadonlyMap<string, ConditionsZone>,
  voulues: readonly ZoneVoulue[],
  maintenant: Date,
): PlanConditions {
  const finales = voulues.map((v) => v.zoneId);
  const apres = new Set(finales);
  const retirer = [...actuelles.keys()].filter((id) => !apres.has(id));
  const ajouter: LigneZone[] = [];
  const modifier: LigneZone[] = [];
  for (const v of voulues) {
    const cur = actuelles.get(v.zoneId);
    const ligne: LigneZone = {
      zone_id: v.zoneId,
      fee_htg: v.feeHtg === undefined ? (cur?.feeHtg ?? null) : v.feeHtg,
      delay_hours: v.delayHours === undefined ? (cur?.delayHours ?? null) : v.delayHours,
      paused_until:
        v.pause.action === "set" ? new Date(maintenant.getTime() + v.pause.days * 86_400_000).toISOString()
        : v.pause.action === "clear" ? null
        : (cur?.pausedUntil ?? null),
    };
    if (!cur) ajouter.push(ligne);
    else if (cur.feeHtg !== ligne.fee_htg || cur.delayHours !== ligne.delay_hours || cur.pausedUntil !== ligne.paused_until) modifier.push(ligne);
  }
  return { finales, ajouter, modifier, retirer };
}

/** Le filtre PostgREST « zone non suspendue à cet instant » : pas de pause, ou pause échue. */
export function filtreZoneNonSuspendue(maintenant: Date): string {
  return `paused_until.is.null,paused_until.lte.${maintenant.toISOString()}`;
}

/** Une pause est-elle EN COURS à cet instant ? Date illisible ou passée → non (jamais « suspendue pour toujours »). */
export function pauseEnCours(pausedUntil: string | null | undefined, maintenant: Date): boolean {
  if (!pausedUntil) return false;
  const t = Date.parse(pausedUntil);
  return Number.isFinite(t) && t > maintenant.getTime();
}
