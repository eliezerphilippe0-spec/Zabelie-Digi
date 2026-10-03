"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PointAffiche = { id: string; url: string; events: string[]; createdAt: string; disabledAt: string | null; disabledReason: string | null };
export type EnvoiAffiche = { id: string; eventType: string; status: string; attempts: number; lastStatus: number | null; createdAt: string };
type Labels = Record<
  "url" | "add" | "adding" | "secretOnce" | "copy" | "copied" | "done" | "empty" | "active" | "disabledSeller" | "disabledFailures"
  | "test" | "testSent" | "disable" | "confirmDisable" | "limit" | "error" | "deliveries" | "noDeliveries" | "attempts"
  | "pending" | "delivered" | "dead",
  string
>;

/** Points de terminaison du vendeur : ajout (secret affiché une fois), test, désactivation, derniers envois. */
export function WebhooksManager({ points, envois, max, locale, labels }: { points: PointAffiche[]; envois: EnvoiAffiche[]; max: number; locale: string; labels: Labels }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "erreur"; texte: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const actifs = points.filter((p) => !p.disabledAt).length;
  const quand = (iso: string) => new Date(iso).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const statut = (s: string) => (s === "delivered" ? labels.delivered : s === "dead" ? labels.dead : labels.pending);

  async function appeler(chemin: string, init: RequestInit) {
    setMessage(null);
    try {
      const res = await fetch(chemin, init);
      const corps = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage({ type: "erreur", texte: corps.error ?? labels.error }); return null; }
      return corps;
    } catch { setMessage({ type: "erreur", texte: labels.error }); return null; }
  }

  async function ajouter(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const corps = await appeler("/api/account/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    setBusy(false);
    if (corps && typeof corps.secret === "string") { setSecret(corps.secret); setUrl(""); setCopie(false); router.refresh(); }
  }

  return (
    <div className="mt-6 space-y-6">
      {secret && (
        <div role="status" className="rounded-2xl border border-brand/60 bg-brand/10 p-4">
          <p className="text-sm font-semibold">{labels.secretOnce}</p>
          <code className="mt-2 block break-all rounded-lg bg-ink px-3 py-2 text-sm">{secret}</code>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm"
              onClick={async () => { try { await navigator.clipboard.writeText(secret); setCopie(true); } catch { /* copie manuelle */ } }}>
              {copie ? labels.copied : labels.copy}
            </button>
            <button type="button" className="inline-flex min-h-11 items-center px-2 text-sm underline" onClick={() => setSecret(null)}>{labels.done}</button>
          </div>
        </div>
      )}

      {actifs < max ? (
        <form onSubmit={ajouter} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {labels.url}
            <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" maxLength={500} required
              className="min-h-11 rounded-xl border border-line bg-ink px-3 text-base" />
          </label>
          <button type="submit" disabled={busy || !url.trim()} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60">
            {busy ? labels.adding : labels.add}
          </button>
        </form>
      ) : (
        <p className="text-sm text-mist">{labels.limit}</p>
      )}
      {message && <p role={message.type === "erreur" ? "alert" : "status"} className={`text-sm ${message.type === "erreur" ? "text-danger-text" : "text-mist"}`}>{message.texte}</p>}

      {points.length === 0 ? (
        <p className="text-sm text-mist">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {points.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="break-all font-semibold">{p.url}</p>
                <p className="mt-1 text-xs text-mist">
                  {p.events.join(", ")} · {p.disabledAt ? (p.disabledReason === "echecs" ? labels.disabledFailures : labels.disabledSeller) : labels.active}
                </p>
              </div>
              {!p.disabledAt && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm"
                    onClick={async () => { if (await appeler(`/api/account/webhooks/${p.id}/test`, { method: "POST" })) { setMessage({ type: "ok", texte: labels.testSent }); setTimeout(() => router.refresh(), 4000); } }}>
                    {labels.test}
                  </button>
                  <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-danger-text"
                    onClick={async () => { if (window.confirm(labels.confirmDisable) && await appeler(`/api/account/webhooks/${p.id}`, { method: "DELETE" })) router.refresh(); }}>
                    {labels.disable}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <section aria-labelledby="envois-titre">
        <h3 id="envois-titre" className="text-base font-semibold">{labels.deliveries}</h3>
        {envois.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{labels.noDeliveries}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {envois.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2">
                <span><code>{d.eventType}</code> · {quand(d.createdAt)}</span>
                <span className={d.status === "dead" ? "text-danger-text" : d.status === "delivered" ? "text-success-text" : "text-mist"}>
                  {statut(d.status)}{d.lastStatus ? ` (HTTP ${d.lastStatus})` : ""} · {labels.attempts} {d.attempts}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
