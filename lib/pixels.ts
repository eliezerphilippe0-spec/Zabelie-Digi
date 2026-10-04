/**
 * PIXELS PUBLICITAIRES DU VENDEUR (0123) — Meta, Google, TikTok.
 *
 * Module pur, sans dépendance serveur : partagé par le serveur (validation à
 * l'écriture, lecture pour la page) et le navigateur (chargement après
 * consentement). Trois règles, chacune gardée par `tests/pixels.test.ts` :
 *
 * 1. FORMAT STRICT. Les mêmes expressions que les contraintes SQL de `0123` :
 *    un identifiant qui n'en respecte pas une n'est ni enregistré ni chargé.
 *    C'est ce qui interdit toute injection de script par ce champ.
 * 2. CONSENTEMENT. Rien ne se charge tant que le visiteur n'a pas dit oui
 *    (cookie `zab_pub=1`). « Non » est retenu aussi : on ne redemande pas.
 * 3. PÉRIMÈTRE. Seules les pages d'un vendeur chargent SES pixels (fiche,
 *    boutique, confirmation d'achat) ; la CSP n'ouvre les domaines des régies
 *    que sur ces chemins (`cheminPublicitaire`).
 */

export const FORMATS_PIXEL = {
  meta: /^[0-9]{8,20}$/,
  google: /^(G|AW)-[A-Z0-9]{6,16}$/,
  tiktok: /^[A-Z0-9]{15,25}$/,
} as const;

export type Regie = keyof typeof FORMATS_PIXEL;
export type IdsPixels = Partial<Record<Regie, string>>;

/** Garde un identifiant s'il respecte EXACTEMENT son format, sinon le jette. */
export function idValide(regie: Regie, brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const v = brut.trim().toUpperCase();
  const final = regie === "meta" ? brut.trim() : v;
  return FORMATS_PIXEL[regie].test(final) ? final : null;
}

/** Ne garde que les identifiants valides ; `null` si aucun. */
export function idsPixels(brut: { meta_pixel_id?: unknown; google_tag_id?: unknown; tiktok_pixel_id?: unknown } | null | undefined): IdsPixels | null {
  if (!brut) return null;
  const ids: IdsPixels = {};
  const m = idValide("meta", brut.meta_pixel_id), g = idValide("google", brut.google_tag_id), t = idValide("tiktok", brut.tiktok_pixel_id);
  if (m) ids.meta = m;
  if (g) ids.google = g;
  if (t) ids.tiktok = t;
  return Object.keys(ids).length ? ids : null;
}

// ─── Consentement ────────────────────────────────────────────────────────────

export const COOKIE_CONSENTEMENT = "zab_pub";
export const DUREE_CONSENTEMENT_S = 180 * 86400;
export type Consentement = "oui" | "non" | "inconnu";

export function lireConsentement(cookie: string): Consentement {
  const m = cookie.match(/(?:^|;\s*)zab_pub=([01])(?:;|$)/);
  return m ? (m[1] === "1" ? "oui" : "non") : "inconnu";
}

// ─── Périmètre ───────────────────────────────────────────────────────────────

/** Chemins où un pixel de vendeur peut se charger — et donc où la CSP s'ouvre aux régies. */
export function cheminPublicitaire(chemin: string): boolean {
  return /^\/(produit|boutik|createur)\/[^/]+\/?$/.test(chemin) || /^\/paiement\/succes\/?$/.test(chemin);
}

/** Domaines ajoutés à la CSP sur ces chemins seulement (beacons et requêtes des régies). */
export const DOMAINES_REGIES = [
  "https://www.facebook.com",
  "https://connect.facebook.net",
  "https://www.googletagmanager.com",
  "https://*.google-analytics.com",
  "https://*.analytics.google.com",
  "https://googleads.g.doubleclick.net",
  "https://www.google.com",
  "https://analytics.tiktok.com",
  "https://*.tiktok.com",
] as const;

// ─── Événements ──────────────────────────────────────────────────────────────

export type EvenementPixel =
  | { type: "page" }
  | { type: "produit"; productId: string; valeurHtg: number }
  | { type: "achat"; orderId: string; productId: string; valeurHtg: number };

/** Les scripts que chaque régie doit charger. Aucun ne dépend d'une donnée non validée. */
export function scriptsRegies(ids: IdsPixels): string[] {
  const s: string[] = [];
  if (ids.meta) s.push("https://connect.facebook.net/en_US/fbevents.js");
  if (ids.google) s.push(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids.google)}`);
  if (ids.tiktok) s.push(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(ids.tiktok)}&lib=ttq`);
  return s;
}
