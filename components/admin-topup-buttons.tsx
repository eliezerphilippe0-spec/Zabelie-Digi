"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Confirme un virement Zelle de RECHARGE (après vérification du relevé). */
export function AdminTopupZelleButton({
  orderId,
  amountUsd,
}: {
  orderId: string;
  amountUsd: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    const reference = window.prompt(
      `Confirmer la réception de ${amountUsd} par Zelle pour cette recharge ?\n\n` +
        "⚠️ Vérifiez le relevé bancaire : montant EXACT + mémo.\n" +
        "La recharge partira immédiatement après confirmation.\n\n" +
        "Référence du virement (optionnel) :"
    );
    if (reference === null) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/topup/confirm-zelle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reference: reference.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Échec de la confirmation.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={confirm}
        disabled={loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-success-text transition hover:border-success/50 disabled:opacity-60"
      >
        {loading ? "…" : "Confirmer + recharger"}
      </button>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}

/**
 * Synchronise le catalogue `zabelie_topup_products` depuis Reloadly
 * (operatorId + dénominations + coûtant réels) — un clic, aucun SQL.
 */
export function AdminTopupSyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sync() {
    setLoading(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/topup/sync-catalog", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Échec de la synchronisation.");
        return;
      }
      setMsg(
        `Catalogue synchronisé : ${data.inserted} ajouté(s), ${data.updated} mis à jour.`
      );
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={sync}
        disabled={loading}
        className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-cloud transition hover:border-cloud/50 disabled:opacity-60"
      >
        {loading ? "Synchronisation…" : "Synchroniser le catalogue Reloadly"}
      </button>
      {msg && <p className="mt-2 text-xs text-success-text">{msg}</p>}
      {error && <p className="mt-2 text-xs text-danger-text">{error}</p>}
    </div>
  );
}

/**
 * Enregistre un remboursement de recharge EXÉCUTÉ MANUELLEMENT via le moyen
 * de paiement d'origine (checkpoint humain BRH — l'app ne bouge pas l'argent).
 */
export function AdminTopupRefundButton({
  orderId,
  amountLabel,
  rail,
}: {
  orderId: string;
  amountLabel: string;
  rail: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record() {
    const reference = window.prompt(
      `Remboursement de ${amountLabel} — checkpoint humain.\n\n` +
        `1. Remboursez D'ABORD l'acheteur via ${rail.toUpperCase()} (moyen d'origine, jamais un solde interne).\n` +
        "2. Entrez ici la référence de ce remboursement pour clôturer :"
    );
    if (reference === null) return;
    if (!reference.trim()) {
      setError("Référence requise (preuve du remboursement).");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/topup/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, reference: reference.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Échec de l'enregistrement.");
        return;
      }
      router.refresh();
    } catch {
      setError("Connexion impossible.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={record}
        disabled={loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-warning-text transition hover:border-warning/50 disabled:opacity-60"
      >
        {loading ? "…" : "Rembourser (fait) ✓"}
      </button>
      {error && <p className="mt-1 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
