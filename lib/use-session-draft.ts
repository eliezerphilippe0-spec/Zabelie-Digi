"use client";
import { useEffect, useRef, useState, type SetStateAction } from "react";
import { UUID_RE } from "./collections";
const MAX_AGE = 30 * 60_000;
// Reconciliation can run late. Only a verified terminal server state clears
// purchase identity/review; private fields still expire after 30 minutes.
export const CHECKOUT_ATTEMPT_MAX_AGE = Number.POSITIVE_INFINITY;

function storedCheckoutAttempt(storageKey: string): { at: number; fingerprint: string; key: string } | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Number.isFinite(saved.at) &&
      typeof saved.fingerprint === "string" && /^[0-9a-f]{64}$/.test(saved.fingerprint) &&
      typeof saved.key === "string" && UUID_RE.test(saved.key)) return saved;
  } catch { /* Storage is optional. */ }
  return null;
}

/** Recover the same attempt without reconstructing expired recipient drafts. */
export function readCheckoutAttempt(storageKey: string): string | null {
  return storedCheckoutAttempt(storageKey)?.key ?? null;
}

/** Reuse an attempt after reload without storing recipient data or consent. */
export async function prepareCheckoutAttempt(storageKey: string, intent: string, fallbackKey?: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(intent));
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  let attempt = fallbackKey ?? crypto.randomUUID();
  try {
    const saved = storedCheckoutAttempt(storageKey);
    if (saved?.fingerprint === fingerprint) attempt = saved.key;
    sessionStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), fingerprint, key: attempt }));
  } catch { /* Storage is optional; the mounted button retains its key. */ }
  return attempt;
}

export function clearCheckoutAttempt(storageKey: string): void {
  try { sessionStorage.removeItem(storageKey); } catch {}
}

/** Tab-scoped drafts. Never store payment credentials, consent or authentication. */
export function useSessionDraft<T>(key: string | undefined, initial: T, validate: (v: unknown) => v is T, maxAge = MAX_AGE) {
  const initialRef = useRef(initial);
  const validateRef = useRef(validate);
  const [value, setValue] = useState<T>(initial);
  const valueRef = useRef(initial);
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    let restored = initialRef.current;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Number.isFinite(parsed.at) && (maxAge === CHECKOUT_ATTEMPT_MAX_AGE || parsed.at <= Date.now() && Date.now() - parsed.at < maxAge) && validateRef.current(parsed.value)) restored = parsed.value;
        else sessionStorage.removeItem(key);
      }
    } catch { /* Storage is optional. */ }
    valueRef.current = restored;
    setValue(restored);
    setLoadedKey(key);
  }, [key, maxAge]);
  useEffect(() => {
    if (!key || loadedKey !== key) return;
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch {}
  }, [key, loadedKey, value]);
  const update = (next: SetStateAction<T>) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(valueRef.current) : next;
    valueRef.current = resolved;
    setValue(resolved);
    // A full-page gateway navigation may happen before React's next effect.
    // Persist the safety flag (and ordinary drafts) during the user action.
    if (key && loadedKey === key) {
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value: resolved })); } catch {}
    }
  };
  const clear = () => { if (key) { try { sessionStorage.removeItem(key); } catch {} } };
  return [value, update, clear, !key || loadedKey === key] as const;
}
