import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Zabelie Business — Vague 1 « Fè m peye ». Helpers côté serveur.
 * Toute écriture d'argent passe par les fonctions SQL SECURITY DEFINER
 * (migration 0022) ; ce module ne fait QUE de la lecture propriétaire et des
 * insertions non sensibles (pro, client, brouillon de facture).
 */

export type BizInvoiceStatus =
  | "draft"
  | "sent"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "void";

export type BizProfessional = {
  id: string;
  user_id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  next_invoice_seq: number;
};

export type BizClient = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export type BizInvoiceItem = {
  id: string;
  label: string;
  qty: number;
  unit_price_htg: number;
  line_total_htg: number;
  sort_order: number;
};

export type BizInvoice = {
  id: string;
  invoice_number: string | null;
  status: BizInvoiceStatus;
  subtotal_htg: number;
  total_htg: number;
  paid_htg: number;
  currency: string;
  due_date: string | null;
  public_token: string;
  client_id: string;
  created_at: string;
};

/** Slug URL-safe (a-z0-9-), suffixe court anti-collision. */
export function slugify(input: string): string {
  const base = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const suffix = randomBytes(3).toString("hex");
  return base ? `${base}-${suffix}` : suffix;
}

/** Token opaque de partage d'une facture (portail client sans login). */
export function invoiceToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Garde de FORME du jeton public — audit externe du 2026-08-10, constat
 * retenu : la page /facture/[token] transmettait n'importe quelle chaîne à la
 * RPC `security definer`, sans borne de longueur ni de format. Les 144 bits
 * d'entropie rendent l'énumération irréaliste, mais rien n'obligeait un
 * appel à RESSEMBLER à un jeton avant d'atteindre la base.
 *
 * `randomBytes(18)` → base64url → EXACTEMENT 24 caractères de [A-Za-z0-9_-],
 * sans padding. Vérifié en base avant d'écrire la garde : 0 facture, donc
 * aucun jeton historique d'une autre forme à préserver.
 */
export function estTokenFacture(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{24}$/.test(v);
}

/**
 * Espace pro de l'utilisateur, ou null s'il n'en a pas encore.
 * `admin` = client service role (lecture serveur, hors RLS).
 */
export async function getProfessional(
  admin: SupabaseClient,
  userId: string
): Promise<BizProfessional | null> {
  const { data } = await admin
    .from("zabelie_biz_professionals")
    .select("id, user_id, display_name, slug, bio, next_invoice_seq")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as BizProfessional | null) ?? null;
}
