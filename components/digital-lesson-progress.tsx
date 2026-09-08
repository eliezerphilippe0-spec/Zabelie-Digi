"use client";
import { createContext, useContext, useState } from "react";

type ProgressState = {
  completed: Set<string>; busy: string | null; error: string | null;
  lessonIds: string[]; toggle: (lessonId: string) => Promise<void>;
};
const ProgressContext = createContext<ProgressState | null>(null);
function useProgress() {
  const value = useContext(ProgressContext);
  if (!value) throw new Error("DigitalProgressProvider required");
  return value;
}
/** Update the visible state only after the server acknowledges persistence.
 * No whole-page navigation is needed for a single checkbox. SSR still restores
 * the saved state on a subsequent visit or when the language changes. */
export function DigitalProgressProvider({ orderId, releaseId, initialCompleted, lessonIds, children }: {
  orderId: string; releaseId: string; initialCompleted: string[]; lessonIds: string[]; children: React.ReactNode;
}) {
  const [completed, setCompleted] = useState(() => new Set(initialCompleted));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function toggle(lessonId: string) {
    if (busy) return;
    const next = !completed.has(lessonId);
    setBusy(lessonId); setError(null);
    try {
      const response = await fetch("/api/digital/progress", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, releaseId, lessonId, completed: next }),
      });
      const body = await response.json();
      if (!response.ok || body?.ok !== true) { setError(lessonId); return; }
      setCompleted(previous => {
        const updated = new Set(previous);
        if (next) updated.add(lessonId); else updated.delete(lessonId);
        return updated;
      });
    } catch { setError(lessonId); } finally { setBusy(null); }
  }
  return <ProgressContext.Provider value={{ completed, busy, error, lessonIds, toggle }}>{children}</ProgressContext.Provider>;
}
export function DigitalProgressSummary({ label }: { label: string }) {
  const { completed, lessonIds } = useProgress();
  const done = lessonIds.filter(id => completed.has(id)).length;
  return <div className="mt-3">
    <label htmlFor="course-progress" className="text-sm">{label.replace("{done}", String(done)).replace("{total}", String(lessonIds.length))}</label>
    <progress id="course-progress" value={done} max={lessonIds.length} className="mt-2 block h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-brand [&::-moz-progress-bar]:bg-brand"/>
  </div>;
}
export function DigitalLessonProgress({ lessonId, labels }: { lessonId: string; labels: { complete: string; completed: string; error: string } }) {
  const progress = useProgress();
  const completed = progress.completed.has(lessonId);
  return <div>
    <button type="button" aria-pressed={completed} disabled={progress.busy !== null} onClick={() => progress.toggle(lessonId)} className="mt-4 min-h-11 rounded-xl border border-line px-4 py-2 text-sm font-semibold disabled:opacity-60">
      {progress.busy === lessonId ? "…" : completed ? `✓ ${labels.completed}` : labels.complete}
    </button>
    {progress.error === lessonId && <p role="alert" className="mt-2 text-sm text-danger-text">{labels.error}</p>}
  </div>;
}
