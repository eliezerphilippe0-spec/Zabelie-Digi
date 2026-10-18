import { slugValide } from "@/lib/boutik-slug";
import { BUYING_GUIDES } from "@/lib/buying-guides";

/**
 * UNE PAGE PUBLIQUE QUI N'EXISTE PAS RÉPOND 404 — et c'est le PROXY qui le dit.
 *
 * ⚠️ NÉ DE L'AUDIT PAGE PAR PAGE DU 2026-10-17 : `/produit/x`, `/boutik/x`,
 * `/createur/<uuid>` et `/guides/fr/x` inexistants répondaient HTTP 200, pour
 * tous les visiteurs, robots de Google et de WhatsApp compris. Les pages
 * appellent bien `notFound()`, mais `app/loading.tsx` ouvre une frontière
 * Suspense au-dessus d'elles : la réponse part en 200 avant qu'elles aient
 * tranché (« un notFound() tardif après le début du streaming rendrait HTTP
 * 200 », `proxy.ts`). Même remède que les domaines vendeurs (`resoudreDomaine`,
 * `lib/domaines.ts`) : décider AVANT tout rendu.
 *
 * Le coût est borné à dessein :
 *  - seulement au chargement COMPLET d'une page (lien WhatsApp, Google,
 *    vérificateur de liens) — une navigation dans l'application n'attend rien ;
 *  - un cache par instance (2 min si la page existe, 30 s sinon) ;
 *  - 800 ms au plus, et dans le doute (pas de base, panne, délai) la page est
 *    servie comme avant : elle sait toujours dire « introuvable » elle-même,
 *    seulement avec un 200. Une panne ne doit jamais faire disparaître un
 *    produit qui existe.
 *
 * Aucun client Supabase ici (règle du proxy) : un `fetch` nu, comme
 * `lib/domaines.ts`.
 */

export type Ressource = { type: "produit" | "boutik" | "createur"; cle: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LANGUES = new Set(["fr", "ht", "en", "es"]);

/** `/produit/<slug>`, `/boutik/<slug>`, `/createur/<id>` — rien d'autre. */
export function ressourceDuChemin(chemin: string): Ressource | null {
  const m = /^\/(produit|boutik|createur)\/([^/]+)\/?$/.exec(chemin);
  if (!m) return null;
  let cle: string;
  try {
    cle = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  return { type: m[1] as Ressource["type"], cle };
}

/** Une forme que la base ne peut pas contenir : inutile de l'interroger. */
export function formeImpossible(r: Ressource): boolean {
  if (r.type === "boutik") return !slugValide(r.cle);
  if (r.type === "createur") return !UUID.test(r.cle);
  return r.cle.length === 0 || r.cle.length > 200;
}

/** Les guides sont une liste FIXE du dépôt : aucune requête. */
export function guideIntrouvable(chemin: string): boolean {
  const m = /^\/guides\/([^/]+)(?:\/([^/]+))?\/?$/.exec(chemin);
  if (!m) return false;
  if (!LANGUES.has(m[1])) return true;
  return m[2] !== undefined && !BUYING_GUIDES.some((g) => g.slug === m[2]);
}

type Entree = { existe: boolean; expire: number };
const CACHE = new Map<string, Entree>();
const CACHE_MAX = 500;
export const TTL_EXISTE_MS = 120_000;
export const TTL_ABSENT_MS = 30_000;
export const DELAI_MS = 800;

/** Pour les tests : chaque cas part d'un cache vide. */
export function viderCacheExistence(): void {
  CACHE.clear();
}

/**
 * `true` ou `false` quand la base a répondu, `null` quand on ne sait pas.
 * L'appelant ne réécrit en 404 que sur un `false` explicite.
 */
export async function ressourceExiste(
  r: Ressource,
  config: { url: string; key: string } | null,
  recuperer: typeof fetch = fetch,
  maintenant: number = Date.now(),
): Promise<boolean | null> {
  if (formeImpossible(r)) return false;
  if (!config) return null;
  const k = `${r.type}:${r.cle}`;
  const connu = CACHE.get(k);
  if (connu && connu.expire > maintenant) return connu.existe;

  const entetes = { apikey: config.key, Authorization: `Bearer ${config.key}` };
  let existe: boolean;
  try {
    const res =
      r.type === "produit"
        ? await recuperer(
            `${config.url}/rest/v1/products?select=id&status=eq.published&slug=eq.${encodeURIComponent(r.cle)}&limit=1`,
            { headers: entetes, signal: AbortSignal.timeout(DELAI_MS) },
          )
        : await recuperer(`${config.url}/rest/v1/rpc/zabelie_boutik_public`, {
            method: "POST",
            headers: { ...entetes, "Content-Type": "application/json" },
            body: JSON.stringify(r.type === "boutik" ? { p_id: null, p_slug: r.cle } : { p_id: r.cle, p_slug: null }),
            signal: AbortSignal.timeout(DELAI_MS),
          });
    if (!res.ok) return null;
    const corps: unknown = await res.json();
    existe =
      r.type === "produit"
        ? Array.isArray(corps) && corps.length > 0
        : corps !== null && typeof corps === "object" && !Array.isArray(corps);
  } catch {
    return null;
  }

  if (CACHE.size >= CACHE_MAX) {
    const plusAncienne = CACHE.keys().next().value;
    if (plusAncienne !== undefined) CACHE.delete(plusAncienne);
  }
  CACHE.set(k, { existe, expire: maintenant + (existe ? TTL_EXISTE_MS : TTL_ABSENT_MS) });
  return existe;
}

/** « sak-pay-ble » → « sak pay ble » : les mots d'une adresse, pour relancer une recherche. */
export function motsDeRecherche(cle: string | undefined): string {
  if (!cle) return "";
  return cle
    .replace(/[-_]+/g, " ")
    .replace(/[^\p{L}\p{N} ]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}
