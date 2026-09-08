"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Dépôt d'un avis vérifié (1 par commande payée). */
export function ReviewForm({ orderId, labels }: { orderId: string; labels: {
  cta: string; success: string; error: string; network: string; stars: string;
  placeholder: string; submit: string; cancel: string;
} }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, rating, comment }),
      });
      if (!res.ok) {
        setMsg(labels.error);
        return;
      }
      setMsg(labels.success);
      setOpen(false);
      router.refresh();
    } catch {
      setMsg(labels.network);
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="text-right">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cloud transition hover:border-accent/50"
        >
          {labels.cta}
        </button>
        {msg && <p className="mt-1 text-xs text-mist">{msg}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2 text-left">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            aria-label={labels.stars.replace("{n}", String(n))}
            aria-pressed={n === rating}
            className={`min-h-11 min-w-11 text-lg transition ${
              n <= rating ? "text-accent" : "text-mist"
            }`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        rows={2}
        maxLength={1000}
        aria-label={labels.placeholder}
        placeholder={labels.placeholder}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-xl border border-line bg-ink/40 px-3 py-2 text-xs outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="min-h-11 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand disabled:opacity-60"
        >
          {loading ? "…" : labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 text-xs text-mist hover:text-cloud"
        >
          {labels.cancel}
        </button>
      </div>
      {msg && <p className="text-xs text-danger-text">{msg}</p>}
    </form>
  );
}
