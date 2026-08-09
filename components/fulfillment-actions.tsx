"use client";

import { useState } from "react";

/**
 * Les gestes de la remise, côté navigateur. UN SEUL composant pour les trois
 * routes : le vendeur qui déclare, l'acheteur qui confirme, l'acheteur qui
 * signale une non-réception. Trois composants recopiés divergeraient sur la
 * gestion d'erreur — et c'est précisément là qu'un acheteur bloqué a besoin
 * que ça marche.
 *
 * Aucun texte en dur : tout arrive traduit du serveur. Le rappel vaut d'être
 * fait — `sign-out-button.tsx` a affiché « Déconnexion » en dur à un
 * utilisateur kreyòl pendant des mois, et rien ne l'a signalé.
 *
 * ⚠️ Ce composant n'envoie JAMAIS d'identifiant d'utilisateur : les routes le
 * prennent dans la session. Un `userId` qui traverserait le navigateur ne
 * ferait jamais autorité, et l'offrir au client inviterait à essayer.
 */

type Variante = "declare" | "received" | "notReceived";

const CHEMIN: Record<Variante, string> = {
  declare: "/api/fulfillment/declare",
  received: "/api/fulfillment/received",
  notReceived: "/api/fulfillment/not-received",
};

export function FulfillmentAction({
  orderId,
  variante,
  labels,
  onDone,
}: {
  orderId: string;
  variante: Variante;
  labels: {
    cta: string;
    /** Absent = pas de champ texte (cas « j'ai reçu »). */
    placeholder?: string;
    hint?: string;
    erreur: string;
    reseau: string;
  };
  /** Rafraîchissement laissé à l'appelant — la page décide, pas le bouton. */
  onDone?: () => void;
}) {
  const [texte, setTexte] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [fait, setFait] = useState(false);

  async function envoyer() {
    setEnvoi(true);
    setErreur(null);
    try {
      const corps: Record<string, string> = { orderId };
      if (variante === "declare") corps.note = texte;
      if (variante === "notReceived") corps.reason = texte;

      const res = await fetch(CHEMIN[variante], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      // `duplicate` est un SUCCÈS : un clic rejoué sur une connexion qui coupe
      // est le cas normal ici, pas une erreur à montrer.
      if (!res.ok) {
        setErreur(labels.erreur);
        return;
      }
      setFait(true);
      onDone?.();
    } catch {
      setErreur(labels.reseau);
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return <span className="text-xs text-success-text">✓</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {labels.placeholder && (
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder={labels.placeholder}
          maxLength={280}
          className="w-full min-w-0 rounded-lg border border-line bg-surface/60 px-3 py-2 text-xs sm:w-72"
        />
      )}
      <button
        onClick={envoyer}
        disabled={envoi}
        className="rounded-lg bg-cloud px-4 py-2 text-xs font-semibold text-ink transition hover:opacity-90 disabled:opacity-60"
      >
        {envoi ? "…" : labels.cta}
      </button>
      {labels.hint && <p className="text-right text-[11px] text-mist">{labels.hint}</p>}
      {erreur && <p className="text-right text-xs text-danger-text">{erreur}</p>}
    </div>
  );
}
