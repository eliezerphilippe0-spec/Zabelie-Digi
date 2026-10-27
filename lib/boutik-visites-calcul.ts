/**
 * Calculs purs des visites de vitrine (docs/75 §5.A, PR-Z2) — sans Next, sans
 * Supabase, donc éprouvés seuls. L'écriture vit dans `lib/boutik-visites.ts`.
 */

/* Les visiteurs qui ne sont pas des personnes : moteurs, aperçus de liens
   (WhatsApp, Facebook, Telegram…), navigateurs sans écran, outils en ligne de
   commande. Un aperçu WhatsApp n'est pas une visite : c'est un partage. */
const PAS_UNE_PERSONNE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitterbot|linkedin|skypeuripreview|discord|slack|preview|headless|lighthouse|pagespeed|curl|wget|python|httpx|axios|node-fetch|undici|go-http|java\//i;

export function estVisiteHumaine(entetes: Headers): boolean {
  const ua = entetes.get("user-agent")?.trim() ?? "";
  if (ua.length < 10 || PAS_UNE_PERSONNE.test(ua)) return false;
  // Préchargement du routeur Next (survol d'un lien) : pas encore une visite.
  // Une navigation interne réelle (`rsc: 1` sans ce drapeau), elle, en est une.
  if (entetes.get("next-router-prefetch")) return false;
  const but = (entetes.get("purpose") ?? entetes.get("sec-purpose") ?? "").toLowerCase();
  return !but.includes("prefetch") && !but.includes("prerender");
}

/** Le jour civil à Port-au-Prince, `AAAA-MM-JJ`, décalé de `decalage` jours. */
export function jourHaiti(maintenant: Date, decalage = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Port-au-Prince", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(maintenant.getTime() + decalage * 86_400_000));
}

/** Somme des vues depuis `depuis` inclus — revérifie la date et la valeur de chaque ligne. */
export function totalVues(lignes: { jour: string; vues: number }[], depuis: string): number {
  return lignes.reduce((s, l) =>
    s + (typeof l.jour === "string" && l.jour >= depuis && Number.isSafeInteger(l.vues) && l.vues > 0 ? l.vues : 0), 0);
}

/** Commandes pour 100 vues, une décimale. `null` tant qu'il n'y a pas de vue. */
export function commandesPour100Vues(commandes: number, vues: number): number | null {
  if (!Number.isSafeInteger(vues) || vues <= 0 || !Number.isSafeInteger(commandes) || commandes < 0) return null;
  return Math.round((commandes * 1000) / vues) / 10;
}
