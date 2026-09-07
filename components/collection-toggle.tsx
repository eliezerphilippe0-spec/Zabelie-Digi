"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CollectionKind } from "@/lib/collections";
export function CollectionToggle({ kind, id, initial, authenticated, labels }: {
  kind: CollectionKind; id: string; initial: boolean; authenticated: boolean;
  labels: { add: string; remove: string; error: string };
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function toggle() {
    if (!authenticated) { router.push(`/connexion?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    setBusy(true); setError(false);
    try {
      const res = await fetch("/api/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id, saved: !saved }) });
      if (res.status === 401) { router.push(`/connexion?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      const data = await res.json();
      if (!res.ok || typeof data.saved !== "boolean") { setError(true); return; }
      setSaved(data.saved); router.refresh();
    } catch { setError(true); } finally { setBusy(false); }
  }
  return <div>
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">
      <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-5 w-5 stroke-current ${saved ? "fill-current" : "fill-none"}`} strokeWidth="1.7"><path d="M12 20s-9-5.3-9-11a5 5 0 019-3 5 5 0 019 3c0 5.7-9 11-9 11z"/></svg>
      {busy ? "…" : saved ? labels.remove : labels.add}
    </button>
    {error && <p role="alert" className="mt-2 text-sm text-danger-text">{labels.error}</p>}
  </div>;
}
