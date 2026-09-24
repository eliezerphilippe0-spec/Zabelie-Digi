import { isIP } from "node:net";

/**
 * Fetch sécurisé des liens de référence (Studio Créatif, contrat §3.1).
 *
 * Chemin DIRECT : nos serveurs contactent l'URL. Le chemin Firecrawl n'est pas
 * écrit — sa documentation n'a pas pu être lue (NON VÉRIFIÉ, docs/62 §3).
 *
 * ─── LES GARDES, DANS L'ORDRE ───────────────────────────────────────────────
 *  1. `https:` seul, sans identifiants, port par défaut.
 *  2. Hôte dans la liste d'autorisation (arbitrage porteur n°1). Liste VIDE =
 *     tout est refusé : fail-closed tant que la liste n'est pas décidée.
 *  3. Hôte littéral IP ou résolution DNS : TOUTES les adresses doivent être
 *     publiques (privées, loopback, link-local, métadonnées cloud, CGNAT,
 *     multicast, réservées, IPv6 ULA/link-local, IPv4 mappée → refus).
 *  4. La connexion se fait sur l'adresse VÉRIFIÉE (épinglée) : une seconde
 *     résolution par la pile HTTP ouvrirait la fenêtre du DNS rebinding.
 *  5. Redirections suivies À LA MAIN, 3 au plus, chaque saut repasse 1 à 4.
 *  6. 10 s au total, 5 Mo au plus lus en flux, HTML ou image seulement.
 *
 * Tout échec rend `fallback: "capture_ecran"` : le vendeur se voit proposer
 * de téléverser une capture. Jamais d'échec silencieux.
 */
export const MAX_LIENS = 3;
export const MAX_REDIRECTIONS = 3;
export const DELAI_MS = 10_000;
export const TAILLE_MAX = 5 * 1024 * 1024;

export type FetchFailure = {
  ok: false;
  reason:
    | "schema_refuse" | "identifiants_dans_url" | "port_refuse" | "hote_non_autorise" | "adresse_privee"
    | "dns_echec" | "trop_de_redirections" | "redirection_sans_cible" | "http_erreur" | "type_refuse"
    | "trop_volumineux" | "delai_depasse" | "reseau";
  fallback: "capture_ecran";
};
export type FetchSuccess = { ok: true; finalUrl: string; contentType: string; body: Uint8Array };

export type Transport = (req: { url: URL; address: string; signal: AbortSignal }) => Promise<{
  status: number;
  headers: Headers;
  body: AsyncIterable<Uint8Array>;
}>;
export type Resolver = (hostname: string) => Promise<string[]>;

const fail = (reason: FetchFailure["reason"]): FetchFailure => ({ ok: false, reason, fallback: "capture_ecran" });

// ── Adresses ─────────────────────────────────────────────────────────────────

function v4(ip: string): number[] | null {
  const p = ip.split(".").map(Number);
  return p.length === 4 && p.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) ? p : null;
}

function v4Public(b: number[]): boolean {
  const [a, c] = [b[0], b[1]];
  if (a === 0 || a === 10 || a === 127) return false;            // « ce réseau », privé, loopback
  if (a === 169 && c === 254) return false;                       // link-local, métadonnées cloud
  if (a === 172 && c >= 16 && c <= 31) return false;              // privé
  if (a === 192 && c === 168) return false;                       // privé
  if (a === 100 && c >= 64 && c <= 127) return false;             // CGNAT
  if (a === 192 && c === 0 && b[2] === 0) return false;           // IETF
  if (a === 192 && c === 0 && b[2] === 2) return false;           // documentation
  if (a === 198 && (c === 18 || c === 19)) return false;          // bancs d'essai
  if (a === 198 && c === 51 && b[2] === 100) return false;        // documentation
  if (a === 203 && c === 0 && b[2] === 113) return false;         // documentation
  if (a >= 224) return false;                                     // multicast, réservé, diffusion
  return true;
}

function v6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const b = v4(tail[1]);
    if (!b) return null;
    s = s.slice(0, -tail[1].length) + `${((b[0] << 8) | b[1]).toString(16)}:${((b[2] << 8) | b[3]).toString(16)}`;
  }
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined && rest !== "" ? rest.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - r.length : 0;
  const groups = [...h, ...Array(fill).fill("0"), ...r].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) { const b = v4(ip); return b !== null && v4Public(b); }
  if (family !== 6) return false;
  const g = v6Groups(ip);
  if (!g) return false;
  if (g.every((x) => x === 0)) return false;                                   // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return false;         // ::1
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {                // ::ffff:a.b.c.d
    return v4Public([g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255]);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) return false;                          // NAT64 : cible masquée
  if ((g[0] & 0xfe00) === 0xfc00) return false;                                // ULA fc00::/7 (dont fd00:ec2::254)
  if ((g[0] & 0xffc0) === 0xfe80) return false;                                // link-local
  if ((g[0] & 0xff00) === 0xff00) return false;                                // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;                        // documentation
  return true;
}

// ── URL ──────────────────────────────────────────────────────────────────────

export function hostAllowed(hostname: string, allowlist: readonly string[]): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, "");
  return allowlist.some((d) => { const dom = d.toLowerCase(); return h === dom || h.endsWith(`.${dom}`); });
}

export function checkUrl(raw: string | URL, allowlist: readonly string[]): FetchFailure | URL {
  let url: URL;
  try { url = new URL(raw); } catch { return fail("schema_refuse"); }
  if (url.protocol !== "https:") return fail("schema_refuse");
  if (url.username || url.password) return fail("identifiants_dans_url");
  if (url.port !== "" && url.port !== "443") return fail("port_refuse");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return isPublicAddress(host) && hostAllowed(host, allowlist) ? url : fail(isPublicAddress(host) ? "hote_non_autorise" : "adresse_privee");
  if (!hostAllowed(host, allowlist)) return fail("hote_non_autorise");
  return url;
}

const TYPES = /^(text\/html|image\/(png|jpeg|webp|gif|avif))\s*(;|$)/i;

export async function safeFetch(
  raw: string,
  deps: { allowlist: readonly string[]; resolve: Resolver; transport: Transport; now?: () => number },
): Promise<FetchSuccess | FetchFailure> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELAI_MS);
  try {
    let current: string | URL = raw;
    for (let hop = 0; ; hop++) {
      const checked = checkUrl(current, deps.allowlist);
      if (!(checked instanceof URL)) return checked;
      const host = checked.hostname.replace(/^\[|\]$/g, "");
      let addresses: string[];
      if (isIP(host)) addresses = [host];
      else {
        try { addresses = await deps.resolve(host); } catch { return fail("dns_echec"); }
      }
      if (addresses.length === 0) return fail("dns_echec");
      if (!addresses.every(isPublicAddress)) return fail("adresse_privee");

      let res;
      try { res = await deps.transport({ url: checked, address: addresses[0], signal: controller.signal }); }
      catch { return fail(controller.signal.aborted ? "delai_depasse" : "reseau"); }

      if (res.status >= 300 && res.status < 400) {
        if (hop >= MAX_REDIRECTIONS) return fail("trop_de_redirections");
        const location = res.headers.get("location");
        if (!location) return fail("redirection_sans_cible");
        current = new URL(location, checked);
        continue;
      }
      if (res.status < 200 || res.status >= 300) return fail("http_erreur");
      const contentType = res.headers.get("content-type") ?? "";
      if (!TYPES.test(contentType)) return fail("type_refuse");
      if (Number(res.headers.get("content-length") ?? 0) > TAILLE_MAX) return fail("trop_volumineux");

      const chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for await (const chunk of res.body) {
          total += chunk.byteLength;
          if (total > TAILLE_MAX) { controller.abort(); return fail("trop_volumineux"); }
          chunks.push(chunk);
        }
      } catch { return fail(controller.signal.aborted ? "delai_depasse" : "reseau"); }
      const body = new Uint8Array(total);
      let offset = 0;
      for (const c of chunks) { body.set(c, offset); offset += c.byteLength; }
      return { ok: true, finalUrl: checked.toString(), contentType, body };
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pour le transport réel (Phase 3) : une fonction `lookup` qui rend TOUJOURS
 * l'adresse déjà vérifiée, quel que soit le nom demandé. Passée à
 * `https.request({ lookup, servername })`, elle empêche une seconde
 * résolution — donc le DNS rebinding.
 */
export function pinnedLookup(address: string) {
  const family = isIP(address);
  if (!family || !isPublicAddress(address)) throw new Error("adresse_privee");
  return (_host: string, _opts: unknown, cb: (err: Error | null, address: string, family: number) => void) => cb(null, address, family);
}
