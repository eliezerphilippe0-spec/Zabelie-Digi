"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { compresserImage } from "@/lib/image-compress";
import { COVER_MAX_OCTETS } from "@/lib/image-limits";
import { coverUrlAt } from "@/lib/product-image";

export type PhotoPrincipaleLabels = {
  title: string;
  hint: string;
  add: string;
  replace: string;
  preparing: string;
  sending: string;
  saved: string;
  /** Photo encore au-dessus du plafond serveur APRÈS compression — composé au serveur. */
  tooHeavy: string;
  error: string;
};

/**
 * PHOTO PRINCIPALE d'une fiche, depuis « Mes produits » (revue du 2026-10-08,
 * UX-02).
 *
 * Le catalogue et l'accueil n'affichent QUE `cover_url`. Seul le formulaire
 * physique savait la poser : une fiche numérique ou un service apparaissait
 * sans image, même avec six photos de galerie. Ce composant lui donne son
 * champ, avec le même chemin que `/vendre/physique` — compression dans le
 * navigateur, puis `/api/products/cover`, qui lit le contenu et stocke le type
 * réel.
 *
 * Rendu sur les BROUILLONS seulement, par la page : la règle de l'atelier
 * numérique — on ne modifie une fiche qu'en brouillon — vaut aussi pour sa
 * photo. Une fiche publiée qui changerait d'image sans revue montrerait au
 * public ce que personne n'a examiné (SEC-01).
 */
export function PhotoPrincipale({
  productId,
  initialUrl,
  labels,
}: {
  productId: string;
  initialUrl: string | null;
  labels: PhotoPrincipaleLabels;
}) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [etape, setEtape] = useState<"repos" | "preparation" | "envoi">("repos");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function envoyer(file: File | null) {
    if (!file) return;
    setError(null);
    setSaved(false);
    try {
      setEtape("preparation");
      const { fichier } = await compresserImage(file);
      // Refus LOCAL, avant tout octet envoyé — le serveur redit la borne.
      if (fichier.size > COVER_MAX_OCTETS) {
        setError(labels.tooHeavy);
        return;
      }
      setEtape("envoi");
      const form = new FormData();
      form.set("productId", productId);
      form.set("file", fichier);
      const res = await fetch("/api/products/cover", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok || typeof data.coverUrl !== "string") {
        setError(typeof data.error === "string" ? data.error : labels.error);
        return;
      }
      setUrl(data.coverUrl);
      setSaved(true);
      router.refresh();
    } catch {
      setError(labels.error);
    } finally {
      setEtape("repos");
    }
  }

  const occupe = etape !== "repos";

  return (
    <div className="mt-2 space-y-2 rounded-xl border border-line/60 p-3">
      <p className="text-xs font-semibold text-cloud">{labels.title}</p>
      <p className="text-xs text-mist">{labels.hint}</p>
      {url && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={coverUrlAt(url, 320) ?? url}
          alt=""
          width={144}
          height={108}
          decoding="async"
          className="aspect-[4/3] w-36 rounded-lg border border-line object-cover"
        />
      )}
      {/* Le champ est VISUELLEMENT masqué (`sr-only`), pas retiré (`hidden`) :
          `display: none` le rendrait injoignable au clavier. L'anneau de focus
          se dessine donc sur le libellé (`has-[:focus-visible]`). */}
      <label className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-line px-3 py-2 text-xs font-semibold text-cloud hover:border-accent has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
        {etape === "preparation" ? labels.preparing : etape === "envoi" ? labels.sending : url ? labels.replace : labels.add}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={occupe}
          onChange={(e) => {
            envoyer(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
      </label>
      {saved && <p role="status" className="text-xs text-success-text">{labels.saved}</p>}
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
    </div>
  );
}
