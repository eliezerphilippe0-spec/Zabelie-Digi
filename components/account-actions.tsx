"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AccountActions() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function remove() {
    const ok = window.confirm(
      "Supprimer votre compte ? Vos données personnelles seront effacées. " +
        "Les informations nécessaires à nos obligations légales (paiements) " +
        "seront anonymisées. Cette action est irréversible.",
    );
    if (!ok) return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Échec de la suppression.");
      }
      /* Fin de session par le MÊME endpoint serveur que le bouton de
       * déconnexion : `signOut()` client ne révoquait que la session locale,
       * donc supprimer son compte laissait vivantes les sessions ouvertes
       * ailleurs. Hors de l'énoncé de la mission, mais dans son esprit —
       * un compte supprimé ne doit survivre nulle part. */
      await fetch("/api/auth/signout", { method: "POST" });
      router.push("/");
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Échec de la suppression.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/account/export"
          className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-cloud transition hover:border-accent"
        >
          Exporter mes données
        </a>
        <button
          onClick={remove}
          disabled={busy}
          className="rounded-xl border border-danger/40 px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10 disabled:opacity-60"
        >
          {busy ? "Suppression…" : "Supprimer mon compte"}
        </button>
      </div>
      {msg && <p className="text-xs text-danger">{msg}</p>}
    </div>
  );
}
