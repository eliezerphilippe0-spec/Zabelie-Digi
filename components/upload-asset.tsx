"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type UploadAssetLabels = {
  sending: string;
  replace: string;
  add: string;
  saved: string;
  error: string;
  errorNetwork: string;
};

const BUCKET = "product-files";

/**
 * Envoie le fichier livrable d'un produit — en DEUX TEMPS.
 *
 * Le fichier ne passe PAS par `/api/products/asset` : la route délivre un lien
 * signé, le navigateur téléverse directement vers le stockage, puis la route
 * confirme et enregistre. Une fonction serverless ne porte pas 50 Mo, et au
 *-delà de sa limite la requête est refusée avant que le code s'exécute —
 * l'échec n'aurait donc ni cause affichée ni trace au journal.
 */
export function UploadAsset({
  productId,
  hasAsset,
  labels,
}: {
  productId: string;
  hasAsset: boolean;
  labels: UploadAssetLabels;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMsg(null);
    try {
      const demande = await fetch("/api/products/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, step: "demande", fileName: file.name }),
      });
      const lien = await demande.json();
      if (!demande.ok || !lien.path || !lien.token) {
        setMsg(typeof lien.error === "string" ? lien.error : labels.error);
        return;
      }

      // Direct au stockage — une route serverless ne porte pas 50 Mo.
      const { error: upErr } = await createClient()
        .storage.from(BUCKET)
        .uploadToSignedUrl(lien.path, lien.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) {
        setMsg(labels.error);
        return;
      }

      const confirme = await fetch("/api/products/asset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          step: "confirme",
          path: lien.path,
          fileName: file.name,
        }),
      });
      const data = await confirme.json();
      if (!confirme.ok) {
        setMsg(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setMsg(labels.saved);
      router.refresh();
    } catch {
      setMsg(labels.errorNetwork);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="text-right">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="inline-flex min-h-11 items-center rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cloud transition hover:border-violet/50 disabled:opacity-60"
      >
        {loading ? labels.sending : hasAsset ? labels.replace : labels.add}
      </button>
      {msg && <p className="mt-1 text-xs text-mist">{msg}</p>}
    </div>
  );
}
