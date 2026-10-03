import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * CLÉS D'API VENDEUR (0121) — « brancher son site sur Zabelie ».
 *
 * Une clé = `zb_live_` + 32 octets d'aléa en base64url (43 caractères).
 * La base n'en garde que l'empreinte SHA-256 : la clé s'affiche UNE fois, à la
 * création, et n'est plus jamais lisible — ni par le vendeur, ni par Zabelie.
 *
 * Les portées et le plafond sont redits en SQL (`0121`) ; `tests/api-keys.test.ts`
 * croise les deux listes.
 */

export const PREFIXE_CLE = "zb_live_";
export const MAX_CLES_ACTIVES = 5;
export const SCOPES = ["products:read", "sales:read", "links:write", "webhooks:manage"] as const;
export type Scope = (typeof SCOPES)[number];
export const SCOPES_PAR_DEFAUT: readonly Scope[] = ["products:read", "sales:read", "links:write"];

const FORMAT_CLE = /^zb_live_[A-Za-z0-9_-]{43}$/;

export function empreinteCle(cle: string): string {
  return createHash("sha256").update(cle, "utf8").digest("hex");
}

export function genererCle(): { cle: string; prefixe: string; empreinte: string } {
  const secret = randomBytes(32).toString("base64url");
  const cle = PREFIXE_CLE + secret;
  return { cle, prefixe: PREFIXE_CLE + secret.slice(0, 6), empreinte: empreinteCle(cle) };
}

/** Rejet bon marché avant toute requête : une chaîne hors format n'atteint pas la base. */
export function formatCleValide(brut: unknown): brut is string {
  return typeof brut === "string" && FORMAT_CLE.test(brut);
}

/** Extrait la clé de `Authorization: Bearer zb_live_…` ou de `X-API-Key`. */
export function lireCle(headers: Headers): string | null {
  const auth = headers.get("authorization");
  const m = auth?.match(/^Bearer\s+(\S+)$/i);
  const brut = m?.[1] ?? headers.get("x-api-key")?.trim() ?? null;
  return formatCleValide(brut) ? brut : null;
}

export type CleResolue = { keyId: string; sellerId: string; scopes: Scope[] };

export class CleIndisponible extends Error {
  constructor() { super("api_key_status_unavailable"); }
}

/**
 * Résout une clé présentée. `null` = clé inconnue, révoquée, ou vendeur
 * suspendu — la réponse est la même dans les trois cas (401), pour ne rien
 * apprendre à qui essaie des clés. Une PANNE de lecture lève `CleIndisponible`
 * (→ 503) : « je n'ai pas pu vérifier » n'est pas « clé invalide ».
 */
export async function resoudreCle(admin: SupabaseClient, cle: string, maintenant = new Date()): Promise<CleResolue | null> {
  if (!formatCleValide(cle)) return null;
  const { data, error } = await admin
    .from("zabelie_api_keys")
    .select("id, seller_id, scopes, revoked_at, last_used_at, seller:profiles!zabelie_api_keys_seller_id_fkey(suspended_at)")
    .eq("key_hash", empreinteCle(cle))
    .maybeSingle();
  if (error) throw new CleIndisponible();
  if (!data || data.revoked_at) return null;
  const vendeur = (Array.isArray(data.seller) ? data.seller[0] : data.seller) as { suspended_at: string | null } | null;
  if (!vendeur) throw new CleIndisponible();
  if (vendeur.suspended_at) return null;

  // Trace d'usage, bornée à une écriture toutes les 5 minutes par clé. Jamais bloquante.
  const dernier = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (maintenant.getTime() - dernier > 5 * 60_000) {
    const { error: e } = await admin.from("zabelie_api_keys").update({ last_used_at: maintenant.toISOString() }).eq("id", data.id);
    if (e) console.warn("[api-keys] last_used_at non écrit", e.message);
  }
  return {
    keyId: data.id,
    sellerId: data.seller_id,
    scopes: (data.scopes as string[]).filter((s): s is Scope => (SCOPES as readonly string[]).includes(s)),
  };
}

/** Nom affiché d'une clé : 1 à 60 caractères visibles. */
export function nomCleValide(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const nom = brut.trim().replace(/\s+/g, " ");
  return nom.length >= 1 && nom.length <= 60 ? nom : null;
}
