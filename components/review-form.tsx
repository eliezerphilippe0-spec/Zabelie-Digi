"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Dépôt d'un avis vérifié (1 par commande payée). */
export function ReviewForm({ orderId }: { orderId: string }) {
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
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error ?? "Échec.");
        return;
      }
      setMsg("Merci pour votre avis !");
      setOpen(false);
      router.refresh();
    } catch {
      setMsg("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <div className="text-right">
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cloud transition hover:border-accent/50"
        >
          Laisser un avis
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
            aria-label={`${n} étoile${n > 1 ? "s" : ""}`}
            className={`text-lg transition ${
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
        placeholder="Votre expérience (optionnel)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        className="w-full rounded-xl border border-line bg-ink/40 px-3 py-2 text-xs outline-none focus:border-accent"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-ink disabled:opacity-60"
        >
          {loading ? "…" : "Publier"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-mist hover:text-cloud"
        >
          Annuler
        </button>
      </div>
      {msg && <p className="text-xs text-danger-text">{msg}</p>}
    </form>
  );
}
