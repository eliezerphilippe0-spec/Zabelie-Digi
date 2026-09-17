"use client";
import { useEffect, useRef, useState } from "react";
const MAX_AGE = 30 * 60_000;

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
