"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddToCart } from "@/components/add-to-cart";
import { appelAvecSession } from "@/lib/appel-session";
import { compresserImage } from "@/lib/image-compress";
import { consentementDonne, donnerConsentement, effacerPhoto, garderPhoto, lirePhoto } from "@/lib/essayage/photo-locale";
import type { LibellesEssayage } from "@/lib/essayage/libelles";

/**
 * La feuille d'essayage (docs/74 §2, tâche 4.4).
 *
 *   consentement (une fois par version) → photo → envoi → attente → résultat
 *
 * La photo est compressée ici (côté long de 1 024 px), envoyée une fois, et
 * gardée sur le téléphone seulement si l'acheteur le demande. Le résultat
 * n'existe qu'en mémoire, le temps que la feuille est ouverte. Sans
 * consentement, aucun champ photo n'est même affiché.
 */

const COTE_MAX = 1024;
const INTERVALLE_MS = 2_000;
/** Le serveur clôt l'essai au-delà de 60 s ; ce délai couvre le dernier sondage. */
const ATTENTE_MAX_MS = 66_000;

type Etape = "consentement" | "photo" | "attente" | "resultat" | "erreur";
type Suivi = { etat: "en_cours" } | { etat: "reussi"; image: string } | { etat: "echec" | "expire"; error?: string };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function EssayageFeuille({
  produitId,
  labels,
  panier,
  onFermer,
}: {
  produitId: string;
  labels: LibellesEssayage;
  panier: ComponentProps<typeof AddToCart>["labels"];
  onFermer: () => void;
}) {
  const router = useRouter();
  const dialogue = useRef<HTMLDialogElement>(null);
  const ouverte = useRef(true);
  const [etape, setEtape] = useState<Etape>(() => (consentementDonne() ? "photo" : "consentement"));
  const [garder, setGarder] = useState(false);
  /** La photo gardée et son adresse blob: locale, pour l'aperçu. */
  const [gardee, setGardee] = useState<{ blob: Blob; url: string } | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogue.current;
    if (d && !d.open) d.showModal();
    return () => {
      ouverte.current = false;
    };
  }, []);

  // La photo gardée est lue pour être MONTRÉE ici ; elle ne part qu'au clic sur « Essayer ».
  useEffect(() => {
    if (etape !== "photo") return;
    let vivant = true;
    let url: string | null = null;
    lirePhoto().then((b) => {
      if (!vivant || !b) return;
      url = URL.createObjectURL(b);
      setGardee({ blob: b, url });
    });
    return () => {
      vivant = false;
      if (url) URL.revokeObjectURL(url);
      setGardee(null);
    };
  }, [etape]);

  function echouer(texte: string | undefined) {
    if (!ouverte.current) return;
    setMessage(texte ?? labels.erreur);
    setEtape("erreur");
  }

  async function suivre(essai: string) {
    const fin = Date.now() + ATTENTE_MAX_MS;
    let reseau = false;
    while (ouverte.current && Date.now() < fin) {
      await pause(INTERVALLE_MS);
      if (!ouverte.current) return;
      const issue = await appelAvecSession<Suivi>(`/api/essayage/${encodeURIComponent(essai)}`, { method: "GET", cache: "no-store" });
      if (issue.etat === "connexion") return router.push(issue.vers);
      if (issue.etat === "reseau") {
        reseau = true;
        continue;
      }
      if (issue.etat === "refus") return echouer(issue.error);
      reseau = false;
      const s = issue.data;
      if (s.etat === "en_cours") continue;
      if (s.etat === "reussi") {
        setImage(s.image);
        setEtape("resultat");
        return;
      }
      return echouer(s.error);
    }
    if (ouverte.current) echouer(reseau ? labels.reseau : undefined);
  }

  async function essayer(photo: Blob) {
    setMessage(null);
    setInfo(null);
    setEtape("attente");
    const envoi = photo instanceof File ? (await compresserImage(photo, { maxCote: COTE_MAX })).fichier : photo;
    if (garder && envoi !== gardee?.blob) await garderPhoto(envoi);
    const form = new FormData();
    form.append("produit", produitId);
    form.append("photo", envoi, envoi instanceof File ? envoi.name : "photo");
    const issue = await appelAvecSession<{ essai: string }>("/api/essayage", { method: "POST", body: form });
    if (issue.etat === "connexion") return router.push(issue.vers);
    if (issue.etat === "reseau") return echouer(labels.reseau);
    if (issue.etat === "refus") return echouer(issue.error);
    await suivre(issue.data.essai);
  }

  async function effacer() {
    await effacerPhoto();
    if (gardee) URL.revokeObjectURL(gardee.url);
    setGardee(null);
    setInfo(labels.effacee);
  }

  function choisi(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (fichier) void essayer(fichier);
  }

  const bouton = "inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold transition";
  const principal = `${bouton} bouton bg-brand text-on-brand`;
  const secondaire = `${bouton} border border-line text-cloud hover:border-brand/60`;

  return (
    <dialog
      ref={dialogue}
      aria-labelledby="essayage-titre"
      onClose={onFermer}
      data-essayage-feuille
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-2xl border border-line bg-surface p-5 text-cloud backdrop:bg-black/60 sm:m-auto sm:max-w-md sm:rounded-2xl"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="essayage-titre" className="text-lg font-bold">{labels.titre}</h2>
        <button type="button" onClick={() => dialogue.current?.close()} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-line px-3 text-sm">
          {labels.fermer}
        </button>
      </div>

      {etape === "consentement" && (
        <section className="mt-4" aria-labelledby="essayage-consentement">
          <h3 id="essayage-consentement" className="font-semibold">{labels.consentementTitre}</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
            {labels.consentementPoints.map((p) => <li key={p}>{p}</li>)}
          </ul>
          <Link href="/confidentialite" className="mt-3 inline-flex min-h-11 items-center text-sm underline">{labels.confidentialite}</Link>
          <button type="button" className={`${principal} mt-3`} onClick={() => { donnerConsentement(); setEtape("photo"); }}>
            {labels.accepter}
          </button>
        </section>
      )}

      {etape === "photo" && (
        <section className="mt-4">
          <p className="text-sm text-mist">{labels.conseils}</p>
          {gardee && (
            <div className="mt-4 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold">{labels.gardee}</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- adresse blob: locale, jamais optimisable par next/image */}
              <img src={gardee.url} alt="" className="mt-2 h-32 w-auto rounded-lg object-cover" />
              <button type="button" className={`${principal} mt-3`} onClick={() => void essayer(gardee.blob)}>{labels.utiliser}</button>
              <button type="button" className={`${secondaire} mt-2`} onClick={() => void effacer()}>{labels.effacer}</button>
            </div>
          )}
          <label className={`${principal} mt-4 cursor-pointer`}>
            {labels.prendre}
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={choisi} />
          </label>
          <label className={`${secondaire} mt-2 cursor-pointer`}>
            {labels.choisir}
            <input type="file" accept="image/*" className="sr-only" onChange={choisi} />
          </label>
          <label className="mt-3 flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" checked={garder} onChange={(e) => setGarder(e.target.checked)} className="h-5 w-5" />
            {labels.garder}
          </label>
          {info && <p className="mt-2 text-sm text-success-text" role="status">{info}</p>}
        </section>
      )}

      {etape === "attente" && (
        <div className="mt-6 flex flex-col items-center gap-4 py-6 text-center" role="status" aria-live="polite">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand motion-reduce:animate-none" aria-hidden="true" />
          <p className="text-sm">{labels.attente}</p>
        </div>
      )}

      {etape === "resultat" && image && (
        <section className="mt-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- image data: tenue en mémoire, jamais servie ni optimisable */}
          <img src={image} alt={labels.resultatAlt} className="w-full rounded-xl" />
          <p className="mt-3 text-sm font-semibold" data-essayage-mention>{labels.mention}</p>
          <AddToCart productId={produitId} labels={panier} />
          <button type="button" className={`${secondaire} mt-2`} onClick={() => { setImage(null); setEtape("photo"); }}>{labels.autre}</button>
        </section>
      )}

      {etape === "erreur" && (
        <section className="mt-4" role="alert">
          <p className="text-sm text-danger-text">{message}</p>
          <button type="button" className={`${principal} mt-4`} onClick={() => setEtape("photo")}>{labels.reessayer}</button>
        </section>
      )}
    </dialog>
  );
}
