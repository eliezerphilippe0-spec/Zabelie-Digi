"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CouponItem = {
  id: string;
  code: string;
  percent: number;
  product_id: string | null;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  active: boolean;
};

/**
 * Codes promo du vendeur (V-13) : création + activation/désactivation.
 * Le vendeur partage son code sur WhatsApp ; la validation et la remise
 * réelles se font côté serveur au checkout.
 */
export function ZabelieCouponManager({ coupons }: { coupons: CouponItem[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [percent, setPercent] = useState(10);
  const [maxUses, setMaxUses] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          percent,
          maxUses: maxUses ? Number(maxUses) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Création impossible.");
        return;
      }
      setCode("");
      setMaxUses("");
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch("/api/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, active }),
    }).catch(() => undefined);
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={create} className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className="text-xs text-mist" htmlFor="cp-code">Code</label>
          <input
            id="cp-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="PROMO50"
            maxLength={24}
            required
            className="mt-1 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm uppercase text-cloud placeholder:normal-case placeholder:text-mist focus:border-brand/60 focus:outline-none"
          />
        </div>
        <div className="w-24">
          <label className="text-xs text-mist" htmlFor="cp-pct">Remise %</label>
          <input
            id="cp-pct"
            type="number"
            min={1}
            max={90}
            value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            required
            className="mt-1 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm text-cloud focus:border-brand/60 focus:outline-none"
          />
        </div>
        <div className="w-28">
          <label className="text-xs text-mist" htmlFor="cp-max">Max (option)</label>
          <input
            id="cp-max"
            type="number"
            min={1}
            value={maxUses}
            onChange={(e) => setMaxUses(e.target.value)}
            placeholder="∞"
            className="mt-1 w-full rounded-xl border border-line bg-surface/60 px-3 py-2 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-brand px-5 py-2 text-sm font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "…" : "Créer"}
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}

      {coupons.length > 0 && (
        <ul className="mt-4 space-y-2">
          {coupons.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm"
            >
              <div>
                <span className={`numeric font-extrabold ${c.active ? "text-accent" : "text-mist line-through"}`}>
                  {c.code}
                </span>
                <span className="ml-2 text-mist">
                  −{c.percent} % · {c.uses}
                  {c.max_uses !== null ? `/${c.max_uses}` : ""} utilisé(s)
                </span>
              </div>
              <button
                onClick={() => toggle(c.id, !c.active)}
                className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-mist transition hover:border-brand/50 hover:text-cloud"
              >
                {c.active ? "Désactiver" : "Réactiver"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
