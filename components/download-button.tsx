"use client";

import { useState } from "react";
import { MessageErreur } from "@/components/message-erreur";

/** Récupère une URL signée via /api/download et ouvre le fichier. */
export function DownloadButton({ orderId, releaseId, assetId, labels }: { orderId: string; releaseId?: string; assetId?: string; labels: { download: string; error: string; network: string } }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ orderId });
      if (releaseId) params.set("releaseId", releaseId);
      if (assetId) params.set("assetId", assetId);
      const res = await fetch(`/api/download?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(labels.error);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(labels.network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-right">
      <button
        onClick={download}
        disabled={loading}
        className="bouton bouton-secondaire bouton-compact"
      >
        {loading ? "…" : labels.download}
      </button>
      {error && <MessageErreur className="mt-1">{error}</MessageErreur>}
    </div>
  );
}
