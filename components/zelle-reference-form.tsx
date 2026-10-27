"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appelSession } from "@/lib/appel-session";

export type ZelleReferenceLabels = {
  intro: string;
  placeholder: string;
  submit: string;
  submitting: string;
  done: string;
  /** La requête n'est jamais partie : seul cas où « vérifiez votre réseau » est vrai. */
  network: string;
  /** Le serveur a refusé sans phrase lisible (passerelle, page HTML d'erreur). */
  failed: string;
};

/**
 * « J'ai envoyé le paiement » — l'acheteur signale son virement Zelle et peut
 * joindre la référence de confirmation de sa banque. Purement déclaratif :
 * la validation reste administrative (relevé bancaire → confirm_payment).
 *
 * L'appel passe par la porte unique des appels authentifiés
 * (`lib/appel-session.ts`) : une panne serveur ne se présente jamais comme une
 * panne de réseau à quelqu'un qui a déjà envoyé ses dollars, et une session
 * expirée renvoie vers la connexion qui ramène ICI.
 */
export function ZelleReferenceForm({
  orderId,
  alreadySent,
  labels,
}: {
  orderId: string;
  alreadySent: boolean;
  labels: ZelleReferenceLabels;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [sent, setSent] = useState(alreadySent);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p role="status" className="rounded-2xl border border-line bg-surface/60 p-4 text-sm text-cloud">
        ✓ {labels.done}
      </p>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const issue = await appelSession("/api/zelle/reference", {
      orderId,
      reference: reference.trim() || null,
    });
    if (issue.etat === "connexion") {
      // On reste « en cours » : la page s'en va, un second clic n'a pas lieu d'être.
      router.push(issue.vers);
      return;
    }
    if (issue.etat === "ok") {
      setSent(true);
    } else if (issue.etat === "reseau") {
      setError(labels.network);
    } else {
      // Refus du serveur : sa phrase est déjà dans la langue de l'acheteur.
      setError(issue.error ?? labels.failed);
    }
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={loading}>
      <p className="text-sm font-semibold">{labels.intro}</p>
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={labels.placeholder}
        aria-label={labels.placeholder}
        maxLength={64}
        className="mt-2 min-h-11 w-full rounded-xl border border-line bg-surface/60 px-4 py-2.5 text-sm text-cloud placeholder:text-mist focus:border-brand/60 focus:outline-none"
      />
      <button
        type="submit"
        disabled={loading}
        className="mt-3 min-h-11 w-full rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
      >
        {loading ? labels.submitting : labels.submit}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-center text-sm text-danger-text">
          {error}
        </p>
      )}
    </form>
  );
}
