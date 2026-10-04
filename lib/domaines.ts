import { siteUrl } from "@/lib/site-url";

/**
 * DOMAINE PERSONNALISÉ DE LA BOUTIQUE (0125) — module pur, sans Supabase :
 * le proxy (Edge) l'importe.
 *
 * ⚠️ LE RISQUE QUI COMPTE ICI : prendre `zabelie.com` pour un domaine de
 * vendeur. Le site entier ne servirait plus que des 404. D'où une liste
 * d'hôtes Zabelie qui ne dépend d'AUCUNE variable pour l'essentiel
 * (`zabelie.com`, `www.zabelie.com`, les déploiements `*.vercel.app`, le
 * local) — l'URL du site (`siteUrl()`) ne fait qu'AJOUTER un hôte.
 */

const HOTES_ZABELIE = new Set(["zabelie.com", "www.zabelie.com", "localhost", "127.0.0.1"]);

/** `Boutik.HT:443` → `boutik.ht`. Vide si illisible. */
export function hoteDe(entete: string | null | undefined): string {
  return (entete ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function estHoteZabelie(hote: string, site: string = siteUrl()): boolean {
  if (!hote) return true; // sans en-tête Host : jamais traité comme un domaine vendeur
  if (HOTES_ZABELIE.has(hote) || hote.endsWith(".vercel.app") || hote.endsWith(".zabelie.com")) return true;
  try {
    const h = new URL(site).hostname.toLowerCase();
    return hote === h || hote === `www.${h}`;
  } catch {
    return false;
  }
}

/** Même forme que la contrainte SQL de `0125` (`tests/domaines.test.ts` les croise). */
export const FORMAT_DOMAINE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Ce que le vendeur tape → ce que la base enregistrera, ou `null`. */
export function normaliserDomaine(saisie: string): string | null {
  let v = saisie.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  v = v.replace(/^www\./, "");
  if (v.length < 4 || v.length > 253 || !FORMAT_DOMAINE.test(v)) return null;
  if (/(^|\.)zabelie\.com$/.test(v) || v.endsWith(".vercel.app")) return null;
  return v;
}

/**
 * Les deux enregistrements DNS à poser chez le registraire : la racine et
 * `www`. Valeurs génériques de Vercel ; si son tableau de bord en affiche une
 * propre au projet, c'est celle-là qui fait foi (l'admin la transmet).
 */
export function enregistrementsDns(domaine: string) {
  return [
    { type: "A", nom: "@", valeur: "76.76.21.21", domaine },
    { type: "CNAME", nom: "www", valeur: "cname.vercel-dns.com", domaine: `www.${domaine}` },
  ] as const;
}

/** Sur un domaine vendeur, seule la racine sert la boutique ; tout le reste vit sur zabelie.com. */
export function cheminSurDomaine(chemin: string): "boutique" | "zabelie" {
  return chemin === "/" || chemin === "" ? "boutique" : "zabelie";
}

/**
 * Hôte → adresse de boutique, lu par le PROXY (0125). Un `fetch` nu vers la
 * RPC publique `zabelie_domaine_boutik` : le proxy n'importe aucun client
 * Supabase. Résoudre ici, et non dans une page, est ce qui permet un VRAI
 * 404 pour un domaine inconnu — une page qui appelle `notFound()` après le
 * début du streaming répond 200.
 *
 * `null` pour inconnu, inactif ou vendeur plus éligible (la base recontrôle à
 * chaque appel), et aussi en cas de panne : dans le doute, on ne sert rien.
 */
export async function resoudreDomaine(
  hote: string,
  config: { url: string; key: string } | null,
  recuperer: typeof fetch = fetch,
): Promise<string | null> {
  const h = hote.replace(/^www\./, "");
  if (!config || !FORMAT_DOMAINE.test(h)) return null;
  try {
    const res = await recuperer(`${config.url}/rest/v1/rpc/zabelie_domaine_boutik`, {
      method: "POST",
      headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_hote: h }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      console.error("[domaine] résolution refusée", res.status);
      return null;
    }
    const slug: unknown = await res.json();
    return typeof slug === "string" && /^[a-z0-9-]{1,80}$/.test(slug) ? slug : null;
  } catch (e) {
    console.error("[domaine] résolution impossible", e instanceof Error ? e.name : "inconnue");
    return null;
  }
}
