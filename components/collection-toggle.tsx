"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CollectionKind } from "@/lib/collections";
import { MessageErreur } from "@/components/message-erreur";
import { Icone } from "@/components/icone";

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
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={saved} className="bouton bouton-secondaire bouton-compact">
      <Icone taille={20} className={saved ? "fill-current" : undefined}><path d="M12 20s-9-5.3-9-11a5 5 0 019-3 5 5 0 019 3c0 5.7-9 11-9 11z"/></Icone>
      {busy ? "…" : saved ? labels.remove : labels.add}
    </button>
    {error && <MessageErreur className="mt-2">{labels.error}</MessageErreur>}
  </div>;
}
