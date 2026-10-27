"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { appelSession } from "@/lib/appel-session";

export type PayoutRequestLabels = {
  title: string;
  intro: string;
  amount: string;
  submit: string;
  submitting: string;
  cancel: string;
  open: string;
  pending: string;
  networkError: string;
  success: string;
  /** Refus du serveur sans phrase lisible (passerelle, page HTML d'erreur). */
  failed: string;
  /** Lien vers le dépôt des pièces, proposé quand le refus est `kyc_requis`. */
  kycAction: string;
};

/** Où se déposent et se corrigent les pièces d'identité (section `#verification`). */
const DEPOT_PIECES = "/tableau-de-bord/compte#verification";

type Message = { ok: boolean; text: string; code?: string };

/**
 * Demande de retrait par le vendeur (chantier 0, lot 0.b).
 * Les contrôles métier restent en base ; l'identité attendue lie le montant
 * au compte affiché, sans choisir le portefeuille à débiter.
 * Les libellés arrivent en props (règle i18n : jamais de dictionnaire dans un
 * composant client, cf. lib/i18n.ts).
 *
 * Un refus dit la raison ET l'action (audit du 2026-10-27, M2) : la phrase
 * vient du serveur, déjà dans la langue du vendeur ; le `code` stable décide
 * seul de l'action proposée — `kyc_requis` mène au dépôt des pièces. L'appel
 * passe par `lib/appel-session` : une panne serveur n'est jamais présentée
 * comme une panne de réseau.
 */
export function PayoutRequest({
  actorId,
  disponibleHtg,
  hasPending,
  labels,
}: {
  actorId: string;
  disponibleHtg: number;
  hasPending: boolean;
  labels: PayoutRequestLabels;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Message | null>(null);

  if (hasPending) {
    return (
      <p className="rounded-xl border border-line bg-surface/60 px-4 py-3 text-sm text-cloud">
        {labels.pending}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disponibleHtg <= 0}
        className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-50"
      >
        {labels.open}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const amount = Number(new FormData(e.currentTarget).get("amount"));
    const issue = await appelSession("/api/payouts", { amountHtg: amount, expectedActorId: actorId });
    if (issue.etat === "connexion") {
      router.push(issue.vers);
      return;
    }
    if (issue.etat === "ok") {
      setMsg({ ok: true, text: labels.success });
      router.refresh();
    } else if (issue.etat === "reseau") {
      setMsg({ ok: false, text: labels.networkError });
    } else {
      setMsg({ ok: false, text: issue.error ?? labels.failed, code: issue.code });
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} aria-busy={busy} className="space-y-3 rounded-xl border border-line bg-surface/60 p-4">
      <p className="font-semibold">{labels.title}</p>
      <p className="text-sm text-cloud">{labels.intro}</p>
      <label className="block text-sm">
        {labels.amount}
        <input
          name="amount"
          type="number"
          inputMode="numeric"
          min={1}
          max={disponibleHtg}
          step={1}
          required
          className="mt-1 min-h-11 w-full rounded-lg border border-line bg-ink px-3 py-2"
        />
      </label>
      {msg?.ok === true && (
        <p role="status" className="text-sm text-success-text">
          {msg.text}
        </p>
      )}
      {msg?.ok === false && (
        <div role="alert" className="space-y-1 text-sm text-danger-text">
          <p>{msg.text}</p>
          {msg.code === "kyc_requis" && (
            <Link
              href={DEPOT_PIECES}
              className="inline-flex min-h-11 items-center font-semibold text-cloud underline underline-offset-2"
            >
              {labels.kycAction}
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={busy}
          className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-on-brand disabled:opacity-60"
        >
          {busy ? labels.submitting : labels.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="min-h-11 rounded-lg border border-line px-4 py-2 text-sm"
        >
          {labels.cancel}
        </button>
      </div>
    </form>
  );
}
