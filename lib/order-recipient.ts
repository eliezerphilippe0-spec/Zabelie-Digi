import { normaliserNumeroHaiti } from "@/lib/rechaj";
export type OrderRecipient = { full_name: string; phone: string; locality: string; note: string };
export type RecipientInput = { name: string; phone: string; locality: string; note: string; consent: boolean };
export type RecipientLabels = { toggle: string; name: string; phone: string; locality: string; note: string; consent: string; hint: string; invalid: string; summary: string };
/** Strict shape/length checks before any order or payment is created. */
export function normalizeRecipient(input: unknown): OrderRecipient | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (value.consent !== true) return null;
  for (const field of ["name", "phone", "locality", "note"] as const) if (typeof value[field] !== "string") return null;
  const full_name = (value.name as string).trim();
  const locality = (value.locality as string).trim();
  const note = (value.note as string).trim();
  const rawPhone = value.phone as string;
  if (!/^[+()\d\s.-]{8,30}$/.test(rawPhone)) return null;
  const phone = normaliserNumeroHaiti(rawPhone);
  if (!phone || full_name.length < 2 || full_name.length > 100 || locality.length < 2 || locality.length > 160 || note.length > 500) return null;
  if (/[\x00-\x1f\x7f]/.test(full_name + locality)) return null;
  return { full_name, phone, locality, note };
}
