"use client";
import { useEffect, useRef, useState } from "react";
import { UUID_RE } from "./collections";
const MAX_AGE = 30 * 60_000;

/** Reuse an attempt after reload without storing recipient data or consent. */
export async function prepareCheckoutAttempt(storageKey: string, intent: string, fallbackKey?: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(intent));
  const fingerprint = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
  let attempt = fallbackKey ?? crypto.randomUUID();
  try {
    const raw = sessionStorage.getItem(storageKey);
    const saved = raw ? JSON.parse(raw) : null;
    if (saved && Number.isFinite(saved.at) && saved.at <= Date.now() && Date.now() - saved.at < MAX_AGE &&
      saved.fingerprint === fingerprint && typeof saved.key === "string" && UUID_RE.test(saved.key)) attempt = saved.key;
    sessionStorage.setItem(storageKey, JSON.stringify({ at: Date.now(), fingerprint, key: attempt }));
  } catch { /* Storage is optional; the mounted button retains its key. */ }
  return attempt;
}

export function clearCheckoutAttempt(storageKey: string): void {
  try { sessionStorage.removeItem(storageKey); } catch {}
}

/** Tab-scoped drafts. Never store payment credentials, consent or authentication. */
export function useSessionDraft<T>(key: string | undefined, initial: T, validate: (v: unknown) => v is T) {
  const initialRef = useRef(initial);
  const validateRef = useRef(validate);
  const [value, setValue] = useState<T>(initial);
  const [loadedKey, setLoadedKey] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (!key) return;
    let restored = initialRef.current;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Number.isFinite(parsed.at) && parsed.at <= Date.now() && Date.now() - parsed.at < MAX_AGE && validateRef.current(parsed.value)) restored = parsed.value;
        else sessionStorage.removeItem(key);
      }
    } catch { /* Storage is optional. */ }
    setValue(restored);
    setLoadedKey(key);
  }, [key]);
  useEffect(() => {
    if (!key || loadedKey !== key) return;
    try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value })); } catch {}
  }, [key, loadedKey, value]);
  const clear = () => { if (key) { try { sessionStorage.removeItem(key); } catch {} } };
  return [value, setValue, clear] as const;
}
