"use client";

import { useState } from "react";

/**
 * PAYER UNE LIGNE DU PANIER — la marche intermédiaire, dite comme telle.
 *
 * Le panier de la spec (`docs/27`) promet UN paiement pour N commandes :
 * `zabelie_order_groups` + `confirm_group_payment`, une transaction qui
 * ventile vers la mécanique existante. Ce morceau-là touche l'argent et
 * aura sa propre PR avec ses tests money-path — c'est l'ordre que la spec
 * impose, et il n'est pas négociable.
 *
 * En attendant, le panier ne doit pas être un cul-de-sac : chaque ligne mène
 * au checkout EXISTANT, celui d'un produit unique, éprouvé et en production.
 * L'acheteur paie donc article par article. C'est moins commode qu'un
 * paiement unique, et infiniment mieux qu'une liste où rien ne se conclut.
 *
 * Aucun montant n'est envoyé : le serveur lit le prix en base (règle dure
 * n°3). Ce bouton ne transmet qu'un identifiant de produit et un rail.
 */
export function CartPayButton({
  productId,
  labels,
}: {
  productId: string;
  labels: { pay: string; loading: string; error: string };
}) {
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function payer() {
    setEnCours(true);
    setMsg(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rail: "moncash" }),
      });
      if (res.status === 401) {
        window.location.href = `/connexion?next=${encodeURIComponent("/panier")}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.redirectUrl) {
        setMsg(data.error ?? labels.error);
        setEnCours(false);
        return;
      }
      // Redirection vers la passerelle MonCash — le retour est vérifié
      // serveur-à-serveur par /api/moncash/return (invariant b).
      window.location.href = data.redirectUrl;
    } catch {
      setMsg(labels.error);
      setEnCours(false);
    }
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={payer}
        disabled={enCours}
        className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
      >
        {enCours ? labels.loading : labels.pay}
      </button>
      {msg && <p className="mt-1 text-xs text-danger-text">{msg}</p>}
    </div>
  );
}
