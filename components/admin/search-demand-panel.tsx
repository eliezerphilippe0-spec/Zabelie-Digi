"use client";
import { useState } from "react";
type Labels = ReturnType<typeof import("@/lib/sourcing-copy").sourcingCopy>;
type Result = { collecte: string; termes: { term: string; department: string | null; sessions: number; message: string }[] };
export function SearchDemandPanel({ labels }: { labels: Labels }) {
  const [data, setData] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  async function load() {
    if (busy) return;
    setBusy(true); setError(false);
    try {
      const res = await fetch("/api/admin/search-demand?jours=7", { cache: "no-store" });
      const result = await res.json();
      if (!res.ok || !Array.isArray(result.termes)) throw new Error("unavailable");
      setData(result);
    } catch { setError(true); }
    finally { setBusy(false); }
  }
  return <details className="mt-8 rounded-2xl border border-line p-5">
    <summary className="min-h-11 cursor-pointer text-lg font-semibold">{labels.title}</summary>
    <p className="mt-3 text-sm text-mist">{labels.intro}</p>
    <button type="button" onClick={load} disabled={busy} className="mt-3 min-h-11 rounded-xl border border-line px-4 text-sm">{busy ? labels.loading : labels.load}</button>
    {error && <p role="alert" className="mt-3 text-danger-text">{labels.error}</p>}
    {data && data.collecte !== "active" && <p className="mt-3 text-warning-text">{labels.disabled}</p>}
    {data?.collecte === "active" && data.termes.length === 0 && <p className="mt-3 text-mist">{labels.empty}</p>}
    {data?.collecte === "active" && <ul className="mt-4 divide-y divide-line">{data.termes.map((row, index) => <li key={row.term + index} className="py-4">
      <p className="font-semibold">{row.term} {row.department && <span className="text-mist">· {row.department}</span>}</p>
      <p className="text-sm text-mist">{row.sessions} {labels.sessions}</p>
      <textarea aria-label={labels.copy} readOnly rows={3} value={row.message} className="mt-2 w-full rounded-xl border border-line bg-surface p-3 text-sm" onFocus={e => e.target.select()}/>
      <button type="button" className="min-h-11 text-sm underline" onClick={async () => { try { await navigator.clipboard.writeText(row.message); setCopied(index); } catch { setCopied(null); } }}>{copied === index ? labels.copied : labels.copy}</button>
    </li>)}</ul>}
  </details>;
}
