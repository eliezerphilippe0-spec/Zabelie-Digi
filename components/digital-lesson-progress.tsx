"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
export function DigitalLessonProgress({ orderId, releaseId, lessonId, completed, labels }: { orderId: string; releaseId: string; lessonId: string; completed: boolean; labels: { complete: string; completed: string; error: string } }) {
  const [refreshing, startTransition] = useTransition();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(false); const router = useRouter();
  async function toggle() {
    setBusy(true); setError(false);
    try { const res = await fetch("/api/digital/progress", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId, releaseId, lessonId, completed: !completed }) }); if (!res.ok) setError(true); else startTransition(() => router.refresh()); }
    catch { setError(true); } finally { setBusy(false); }
  }
  return <div><button type="button" aria-pressed={completed} disabled={busy || refreshing} onClick={toggle} className="mt-4 min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">{busy || refreshing ? "…" : completed ? `✓ ${labels.completed}` : labels.complete}</button>{error && <p role="alert" className="mt-2 text-sm text-danger-text">{labels.error}</p>}</div>;
}
