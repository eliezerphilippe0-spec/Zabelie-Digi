"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  MEDIA_BUCKET,
} from "@/lib/product-media";

export type GalerieLabels = {
  title: string;
  add: string;
  sending: string;
  remove: string;
  /** Rappel du plafond — composé au serveur (« Jusqu'à 6 photos… »). */
  hint: string;
  error: string;
  /** V-1B — la vidéo (arbitrages porteur : 60 s, 50 Mo). */
  videoAdd: string;
  videoTooLong: string;
  videoTooBig: string;
};

type MediaItem = { id: string; url: string };

/**
 * Gestionnaire de galerie du vendeur (V-1A, docs/35) — dans la liste
 * « Mes produits ». L'état initial vient du SERVEUR (les médias existants) ;
 * chaque ajout/retrait met la liste à jour depuis la réponse de la route,
 * jamais par re-fetch complet. Libellés en props : composant sous
 * `components/`, le cliquet i18n interdit le texte en dur.
 */
/** Durée lue depuis les métadonnées, AVANT tout envoi — data comptées. */
function dureeVideo(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(v.duration);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(Number.POSITIVE_INFINITY);
    };
    v.src = url;
  });
}

export function GalerieManager({
  productId,
  initial,
  initialVideo = null,
  max,
  labels,
}: {
  productId: string;
  initial: MediaItem[];
  /** La vidéo existante (une seule), ou null. */
  initialVideo?: MediaItem | null;
  max: number;
  labels: GalerieLabels;
}) {
  const [medias, setMedias] = useState<MediaItem[]>(initial);
  const [video, setVideo] = useState<MediaItem | null>(initialVideo);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ajouter(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("productId", productId);
      form.set("file", file);
      const res = await fetch("/api/products/media", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || !data.id) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setMedias((m) => [...m, { id: data.id, url: data.url }]);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function ajouterVideo(file: File | null) {
    if (!file) return;
    setError(null);
    // Les deux bornes AVANT tout octet envoyé — le serveur revérifie le
    // poids sur l'objet réel, mais un refus local ne coûte aucune donnée.
    if (file.size > MAX_VIDEO_BYTES) {
      setError(labels.videoTooBig);
      return;
    }
    const duree = await dureeVideo(file);
    if (duree > MAX_VIDEO_SECONDS) {
      setError(labels.videoTooLong);
      return;
    }
    setBusy(true);
    try {
      const ext = file.type === "video/webm" ? "webm" : "mp4";
      const demande = await fetch("/api/products/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, step: "demande", ext }),
      });
      const lien = await demande.json();
      if (!demande.ok || !lien.path || !lien.token) {
        setError(typeof lien.error === "string" ? lien.error : labels.error);
        return;
      }
      // Direct au stockage — une route serverless ne porte pas 50 Mo.
      const { error: upErr } = await createClient()
        .storage.from(MEDIA_BUCKET)
        .uploadToSignedUrl(lien.path, lien.token, file, {
          contentType: file.type || "video/mp4",
        });
      if (upErr) {
        setError(labels.error);
        return;
      }
      const confirme = await fetch("/api/products/media/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, step: "confirme", path: lien.path }),
      });
      const data = await confirme.json();
      if (!confirme.ok || !data.id) {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setVideo({ id: data.id, url: data.url });
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function retirerVideo() {
    if (!video) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, mediaId: video.id }),
      });
      if (!res.ok) {
        setError(labels.error);
        return;
      }
      setVideo(null);
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  async function retirer(mediaId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/products/media", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, mediaId }),
      });
      if (!res.ok) {
        setError(labels.error);
        return;
      }
      setMedias((m) => m.filter((x) => x.id !== mediaId));
    } catch {
      setError(labels.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-2 rounded-xl border border-line/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-cloud">
        {labels.title} ({medias.length}/{max})
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs text-mist">{labels.hint}</p>
        {medias.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {medias.map((m) => (
              <div key={m.id} className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.url}
                  alt=""
                  width={72}
                  height={54}
                  decoding="async"
                  className="aspect-[4/3] w-18 rounded-lg border border-line object-cover"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => retirer(m.id)}
                  className="block w-full text-center text-xs text-mist underline hover:text-danger-text disabled:opacity-50"
                >
                  {labels.remove}
                </button>
              </div>
            ))}
          </div>
        )}
        {medias.length < max && (
          <label className="inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud hover:border-violet">
            {busy ? labels.sending : labels.add}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                ajouter(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {/* ── La vidéo (V-1B) — une seule, sur tap côté acheteur ── */}
        {video ? (
          <div className="space-y-1">
            <video
              src={video.url}
              controls
              preload="none"
              className="w-full max-w-xs rounded-lg border border-line"
            />
            <button
              type="button"
              disabled={busy}
              onClick={retirerVideo}
              className="text-xs text-mist underline hover:text-danger-text disabled:opacity-50"
            >
              {labels.remove}
            </button>
          </div>
        ) : (
          <label className="inline-block cursor-pointer rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-cloud hover:border-violet">
            {busy ? labels.sending : labels.videoAdd}
            <input
              type="file"
              accept="video/mp4,video/webm"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                ajouterVideo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        )}
        {error && <p className="text-xs text-danger-text">{error}</p>}
      </div>
    </details>
  );
}
