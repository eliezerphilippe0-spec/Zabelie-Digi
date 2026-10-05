import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * WEBHOOKS SORTANTS (0122) — la vente payée, poussée vers le site du vendeur.
 *
 * Trois propriétés tiennent ici, et chacune a son test :
 *
 * 1. SIGNATURE. En-tête `Zabelie-Signature: t=<secondes>,v1=<hex>`, où `v1`
 *    est le HMAC-SHA256 de `<t>.<corps brut>` avec le secret du point de
 *    terminaison. L'horodatage est DANS la signature : un corps rejoué plus
 *    tard échoue chez le destinataire (`verifierSignature`, tolérance 5 min).
 *
 * 2. PAS DE SSRF. L'adresse vient d'un vendeur : elle ne doit jamais faire
 *    parler le serveur à un réseau interne. HTTPS seul, port 443, pas d'IP
 *    littérale, et — la partie qui compte — l'adresse est vérifiée AU MOMENT
 *    DE LA CONNEXION (`lookup` de la requête), pas avant : vérifier puis
 *    laisser `fetch` résoudre à nouveau ouvrirait la fenêtre du DNS rebinding.
 *    Aucune redirection n'est suivie.
 *
 * 3. JAMAIS BLOQUANT. Un envoi est borné à 10 s, sa réponse lue au plus à
 *    4 Kio ; le répartiteur ne lève jamais vers son appelant.
 */

export const PREFIXE_SECRET = "whsec_";
export const EVENEMENTS = ["sale.paid", "sale.refunded"] as const;
export type Evenement = (typeof EVENEMENTS)[number];
export const MAX_POINTS_ACTIFS = 3;
export const DELAI_ENVOI_MS = 10_000;
export const TOLERANCE_SIGNATURE_S = 300;

export function genererSecret(): string {
  return PREFIXE_SECRET + randomBytes(32).toString("base64url");
}

function hmac(secret: string, t: number, corps: string): string {
  return createHmac("sha256", secret).update(`${t}.${corps}`, "utf8").digest("hex");
}

export function signer(secret: string, t: number, corps: string): string {
  return `t=${t},v1=${hmac(secret, t, corps)}`;
}

/** Ce que le site du vendeur doit faire — exposé pour la documentation et les tests. */
export function verifierSignature(secret: string, entete: string | null, corps: string, maintenantS: number): boolean {
  if (!entete) return false;
  const champs = Object.fromEntries(entete.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(champs.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(champs.v1 ?? "")) return false;
  if (Math.abs(maintenantS - t) > TOLERANCE_SIGNATURE_S) return false;
  const attendu = Buffer.from(hmac(secret, t, corps), "hex");
  return timingSafeEqual(attendu, Buffer.from(champs.v1, "hex"));
}

// ─── Adresse du point de terminaison ────────────────────────────────────────

export function adresseIpPrivee(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  if (v === 6) {
    // Compare numeric words: DNS can return mapped IPv4 in hexadecimal,
    // and fully expanded loopback/unspecified addresses are equivalent.
    if (ip.includes("%")) return true; // Scoped addresses are never public endpoints.
    const x = ip.toLowerCase().replace(/\d+\.\d+\.\d+\.\d+$/, (tail) => {
      const [a, b, c, d] = tail.split(".").map(Number);
      return `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    });
    const [head, tail] = x.split("::");
    const left = head ? head.split(":") : [];
    const right = tail ? tail.split(":") : [];
    const words = [...left, ...Array(8 - left.length - right.length).fill("0"), ...right].map((word) => parseInt(word, 16));
    if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
      return adresseIpPrivee(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
    }
    return (words.slice(0, 7).every((word) => word === 0) && words[7] <= 1)
      || (words[0] & 0xfe00) === 0xfc00 || (words[0] & 0xffc0) === 0xfe80 || (words[0] & 0xff00) === 0xff00;
  }
  return true; // illisible : refusé
}

/** Contrôle statique, avant toute résolution. `null` = refusée. */
export function urlWebhookValide(brut: unknown): string | null {
  if (typeof brut !== "string" || brut.length > 500) return null;
  let u: URL;
  try { u = new URL(brut.trim()); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  const hote = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hote || isIP(hote) || hote === "localhost" || /\.(localhost|local|internal|lan|home|arpa)$/.test(hote) || !hote.includes(".")) return null;
  u.hash = "";
  return u.toString();
}

type Lookup = typeof dnsLookup;

/** `lookup` de connexion : refuse si UNE des adresses résolues est privée. */
export function lookupPublic(lookup: Lookup = dnsLookup) {
  return (hote: string, options: object, cb: (err: Error | null, adresse?: string | { address: string; family: number }[], famille?: number) => void) => {
    lookup(hote, { ...options, all: true }, (err, adresses) => {
      if (err) return cb(err);
      const liste = adresses as unknown as { address: string; family: number }[];
      if (!liste.length || liste.some((a) => adresseIpPrivee(a.address))) return cb(new Error("adresse_privee"));
      if ((options as { all?: boolean }).all) return cb(null, liste);
      cb(null, liste[0].address, liste[0].family);
    });
  };
}

// ─── Envoi ──────────────────────────────────────────────────────────────────

export type Livraison = { delivery_id: string; url: string; secret: string; event_id: string; event_type: string; payload: unknown; attempts: number };
export type Resultat = { ok: boolean; status: number | null; erreur: string | null };
export type Envoyeur = (url: string, entetes: Record<string, string>, corps: string) => Promise<{ status: number }>;

/** Envoyeur réel : HTTPS, lookup filtré à la connexion, pas de redirection, 10 s, réponse tronquée. */
export const envoyerHttps: Envoyeur = (url, entetes, corps) =>
  new Promise((resolve, reject) => {
    const req = httpsRequest(url, {
      method: "POST",
      headers: { ...entetes, "Content-Length": Buffer.byteLength(corps).toString() },
      lookup: lookupPublic() as never,
      timeout: DELAI_ENVOI_MS,
    }, (res) => {
      let lu = 0;
      res.on("data", (c: Buffer) => { lu += c.length; if (lu > 4096) res.destroy(); });
      res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
      res.on("close", () => resolve({ status: res.statusCode ?? 0 }));
      res.on("error", () => resolve({ status: res.statusCode ?? 0 }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(corps);
  });

export async function envoyerUne(l: Livraison, envoyer: Envoyeur, maintenantS = Math.floor(Date.now() / 1000)): Promise<Resultat> {
  if (!urlWebhookValide(l.url)) return { ok: false, status: null, erreur: "adresse_refusee" };
  const corps = JSON.stringify(l.payload);
  try {
    const { status } = await envoyer(l.url, {
      "Content-Type": "application/json",
      "User-Agent": "Zabelie-Webhooks/1",
      "Zabelie-Event": l.event_type,
      "Zabelie-Delivery": l.delivery_id,
      "Zabelie-Signature": signer(l.secret, maintenantS, corps),
    }, corps);
    // 3xx compté comme ÉCHEC : une redirection n'est jamais suivie, l'événement n'est pas arrivé.
    return status >= 200 && status < 300 ? { ok: true, status, erreur: null } : { ok: false, status, erreur: `http_${status}` };
  } catch (e) {
    return { ok: false, status: null, erreur: (e instanceof Error ? e.message : "erreur").slice(0, 120) };
  }
}

/**
 * Répartiteur : réclame un lot (bail en base, sans double envoi), envoie, enregistre.
 * Ne lève jamais : un échec de base est journalisé et rend des compteurs à zéro.
 */
export async function repartir(admin: SupabaseClient, opts: { lots?: number; taille?: number; envoyer?: Envoyeur } = {}) {
  const bilan = { envoyes: 0, livres: 0, echecs: 0, erreurBase: false };
  const envoyer = opts.envoyer ?? envoyerHttps;
  for (let i = 0; i < (opts.lots ?? 3); i++) {
    const { data, error } = await admin.rpc("zabelie_webhook_claim", { p_limit: opts.taille ?? 10 });
    if (error) { console.error("[webhooks] réclamation impossible", error.message); bilan.erreurBase = true; break; }
    const lot = (data ?? []) as Livraison[];
    if (!lot.length) break;
    await Promise.all(lot.map(async (l) => {
      const r = await envoyerUne(l, envoyer);
      bilan.envoyes++;
      if (r.ok) bilan.livres++; else bilan.echecs++;
      const { error: e } = await admin.rpc("zabelie_webhook_record", { p_delivery: l.delivery_id, p_ok: r.ok, p_status: r.status, p_error: r.erreur });
      if (e) { console.error("[webhooks] résultat non enregistré", l.delivery_id, e.message); bilan.erreurBase = true; }
    }));
  }
  // L'absence de signal doit être un signal : on journalise aussi à zéro.
  console.log("[webhooks] répartition", JSON.stringify(bilan));
  return bilan;
}
