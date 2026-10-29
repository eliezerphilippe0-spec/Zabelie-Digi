"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Le CODE DE REMISE, côté navigateur (0163, docs/77 §12.3) — deux gestes, une
 * confirmation :
 *
 *  • L'ACHETEUR affiche son code de six chiffres (créé à sa première demande) et le
 *    dit au vendeur devant l'objet ;
 *  • le VENDEUR le saisit, et la commande se clôt exactement comme si l'acheteur
 *    avait appuyé sur « J'ai reçu ».
 *
 * Tous les libellés arrivent en props, résolus côté serveur (un composant client ne
 * lit pas le cookie de langue : tests/i18n-client-discipline.test.ts).
 *
 * ⚠️ Le code est un SECRET de session : il vit dans l'état du composant, jamais dans
 * une URL, jamais dans le stockage du navigateur, jamais dans un journal. Ce composant
 * n'envoie aucun identifiant d'utilisateur — les routes le lisent dans la session.
 */

export type HandoverBuyerLabels = {
  cta: string;
  title: string;
  warn: string;
  hint: string;
  hide: string;
  error: string;
  network: string;
};

export type HandoverSellerLabels = {
  title: string;
  placeholder: string;
  cta: string;
  hint: string;
  done: string;
  network: string;
  errors: {
    /** Contient `{n}`. */
    code_incorrect: string;
    verrouille: string;
    code_absent: string;
    code_invalide: string;
    etat_incompatible: string;
    generic: string;
  };
};

/**
 * « 482915 » → « 482 915 » : lisible à voix haute. Le vendeur peut taper ou COLLER avec l'espace :
 * le champ accepte donc jusqu'à huit caractères (`maxLength={8}`) et ne garde que les six premiers
 * CHIFFRES. Un `maxLength={6}` tronquait « 482 915 » en « 48291 » avant tout filtrage — défaut trouvé
 * en navigateur réel, que les tests de structure ne pouvaient pas voir.
 */
const groupe = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;

export function HandoverCodeBuyer({ orderId, labels }: { orderId: string; labels: HandoverBuyerLabels }) {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  async function afficher() {
    if (busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const res = await fetch("/api/fulfillment/handover-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = (await res.json().catch(() => ({}))) as { code?: unknown };
      if (res.ok && typeof data.code === "string" && /^[0-9]{6}$/.test(data.code)) {
        setCode(data.code);
      } else {
        setErreur(labels.error);
      }
    } catch {
      setErreur(labels.network);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    return (
      <div className="flex max-w-xs flex-col items-end gap-1 rounded-xl border border-line p-3 text-right">
        <p className="text-xs font-semibold">{labels.title}</p>
        <p role="status" aria-label={labels.title} className="numeric text-2xl font-bold tracking-[0.2em]">{groupe(code)}</p>
        <p className="text-xs text-mist">{labels.warn}</p>
        <p className="text-xs text-mist">{labels.hint}</p>
        <button type="button" onClick={() => setCode(null)}
          className="inline-flex min-h-11 items-center text-xs underline">
          {labels.hide}
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={afficher} disabled={busy}
        className="min-h-11 rounded-lg border border-line px-4 py-2 text-xs font-semibold disabled:opacity-60">
        {busy ? "…" : labels.cta}
      </button>
      {erreur ? <p role="alert" className="text-right text-xs text-danger-text">{erreur}</p> : null}
    </div>
  );
}

export function HandoverCodeSeller({ orderId, labels }: { orderId: string; labels: HandoverSellerLabels }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState("");
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  async function confirmer() {
    if (busy) return;
    setBusy(true);
    setErreur(null);
    try {
      const res = await fetch("/api/fulfillment/handover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, code: saisie }),
      });
      if (res.ok) {
        setFait(true);
        setSaisie("");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; restantes?: number };
      const e = labels.errors;
      setErreur(
        data.error === "code_incorrect" ? e.code_incorrect.replace("{n}", String(data.restantes ?? 0))
          : data.error === "verrouille" ? e.verrouille
          : data.error === "code_absent" ? e.code_absent
          : data.error === "code_invalide" ? e.code_invalide
          : data.error === "etat_incompatible" || data.error === "suivi_absent" ? e.etat_incompatible
          : e.generic,
      );
    } catch {
      setErreur(labels.network);
    } finally {
      setBusy(false);
    }
  }

  if (fait) return <p role="status" className="text-right text-xs text-success-text">✓ {labels.done}</p>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); void confirmer(); }} className="mt-3 flex max-w-xs flex-col items-end gap-1">
      <label className="text-xs font-semibold" htmlFor={`hc-${orderId}`}>{labels.title}</label>
      <input id={`hc-${orderId}`} value={saisie} disabled={busy}
        onChange={(e) => setSaisie(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={8} placeholder={labels.placeholder}
        className="numeric min-h-11 w-full rounded-lg border border-line bg-surface/60 px-3 py-2 text-center text-base tracking-[0.3em]" />
      <button type="submit" disabled={busy || saisie.length !== 6}
        className="min-h-11 rounded-lg bg-cloud px-4 py-2 text-xs font-semibold text-ink disabled:opacity-60">
        {busy ? "…" : labels.cta}
      </button>
      <p className="text-right text-xs text-mist">{labels.hint}</p>
      {erreur ? <p role="alert" className="text-right text-xs text-danger-text">{erreur}</p> : null}
    </form>
  );
}
