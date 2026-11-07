"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Ligne vendeur du back-office : suspendre (motif obligatoire) / réactiver.
 * La suspension est réversible et ne touche JAMAIS au wallet (cadre BRH) —
 * elle bloque l'accès et masque les produits, rien d'autre.
 */
export function AdminSellerRow({
  id,
  name,
  suspendedAt,
  suspendedReason,
}: {
  id: string;
  name: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const suspended = Boolean(suspendedAt);

  async function act(action: "suspend" | "reactivate") {
    let reason: string | undefined;
    if (action === "suspend") {
      const input = window.prompt(
        `Suspendre « ${name} » ?\n\nMotif (obligatoire — visible par le vendeur) :`,
      );
      if (input === null) return; // annulé
      reason = input.trim();
      if (!reason) {
        setErr("Motif requis.");
        return;
      }
    } else if (
      !window.confirm(
        `Réactiver « ${name} » ? Ses produits réapparaîtront dans le catalogue.`,
      )
    ) {
      return;
    }

    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/user-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: id, action, reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Échec.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Échec.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="text-xs text-mist">
          {suspended ? (
            <span className="text-danger-text">
              suspendu le {new Date(suspendedAt!).toLocaleDateString("fr-HT")}
              {suspendedReason ? ` — ${suspendedReason}` : ""}
            </span>
          ) : (
            <span className="text-success-text">actif</span>
          )}
          {err && <span className="text-danger-text"> · {err}</span>}
        </p>
      </div>
      {suspended ? (
        <button
          onClick={() => act("reactivate")}
          disabled={busy}
          className="bouton bouton-secondaire bouton-compact shrink-0"
        >
          {busy ? "…" : "Réactiver"}
        </button>
      ) : (
        <button
          onClick={() => act("suspend")}
          disabled={busy}
          className="bouton bouton-secondaire bouton-compact shrink-0 text-danger-text"
        >
          {busy ? "…" : "Suspendre"}
        </button>
      )}
    </li>
  );
}
