"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CleAffichee = {
  id: string; name: string; prefix: string; createdAt: string; lastUsedAt: string | null; revokedAt: string | null;
};
type Labels = Record<
  "name" | "create" | "creating" | "once" | "copy" | "copied" | "done" | "empty" | "created" | "lastUsed" | "never" | "revoked" | "revoke" | "confirmRevoke" | "limit" | "error",
  string
>;

/** Création (la clé s'affiche une fois) et révocation des clés d'API. */
export function ApiKeysManager({ cles, max, locale, labels }: { cles: CleAffichee[]; max: number; locale: string; labels: Labels }) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nouvelle, setNouvelle] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const actives = cles.filter((c) => !c.revokedAt).length;
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  async function creer(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErreur(null);
    try {
      const res = await fetch("/api/account/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nom }),
      });
      const corps = await res.json().catch(() => ({}));
      if (!res.ok || typeof corps.key !== "string") { setErreur(corps.error ?? labels.error); return; }
      setNouvelle(corps.key); setNom(""); setCopie(false);
      router.refresh();
    } catch { setErreur(labels.error); }
    finally { setBusy(false); }
  }

  async function revoquer(id: string) {
    if (!window.confirm(labels.confirmRevoke)) return;
    setErreur(null);
    try {
      const res = await fetch(`/api/account/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) { const c = await res.json().catch(() => ({})); setErreur(c.error ?? labels.error); return; }
      router.refresh();
    } catch { setErreur(labels.error); }
  }

  return (
    <div className="mt-6 space-y-6">
      {nouvelle && (
        <div role="status" className="rounded-2xl border border-brand/60 bg-brand/10 p-4">
          <p className="text-sm font-semibold">{labels.once}</p>
          <code className="mt-2 block break-all rounded-lg bg-ink px-3 py-2 text-sm">{nouvelle}</code>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="button" className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm"
              onClick={async () => { try { await navigator.clipboard.writeText(nouvelle); setCopie(true); } catch { /* copie manuelle */ } }}>
              {copie ? labels.copied : labels.copy}
            </button>
            <button type="button" className="inline-flex min-h-11 items-center px-2 text-sm underline" onClick={() => setNouvelle(null)}>{labels.done}</button>
          </div>
        </div>
      )}

      {actives < max ? (
        <form onSubmit={creer} className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {labels.name}
            <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} required
              className="min-h-11 rounded-xl border border-line bg-ink px-3 text-base" />
          </label>
          <button type="submit" disabled={busy || !nom.trim()} className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60">
            {busy ? labels.creating : labels.create}
          </button>
        </form>
      ) : (
        <p className="text-sm text-mist">{labels.limit}</p>
      )}
      {erreur && <p role="alert" className="text-sm text-danger-text">{erreur}</p>}

      {cles.length === 0 ? (
        <p className="text-sm text-mist">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line">
          {cles.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="font-semibold">{c.name}</p>
                <p className="mt-1 text-xs text-mist"><code>{c.prefix}…</code> · {labels.created} {date(c.createdAt)} · {labels.lastUsed} {c.lastUsedAt ? date(c.lastUsedAt) : labels.never}</p>
              </div>
              {c.revokedAt ? (
                <span className="text-xs text-mist">{labels.revoked} {date(c.revokedAt)}</span>
              ) : (
                <button type="button" onClick={() => revoquer(c.id)} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm text-danger-text">
                  {labels.revoke}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
