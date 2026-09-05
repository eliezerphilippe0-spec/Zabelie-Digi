"use client";

import { useState } from "react";
import { appelSession } from "@/lib/appel-session";

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
    // Même porte que le bouton d'achat (`lib/appel-session.ts`) : ce composant
    // faisait déjà la moitié du travail (`res.json().catch`), il partage
    // maintenant la même lecture des quatre issues. `/panier` reste la
    // destination de retour — c'est bien la page où l'on est.
    const issue = await appelSession<{ redirectUrl?: string }>(
      "/api/checkout",
      { productId, rail: "moncash" },
      "/panier",
    );

    if (issue.etat === "connexion") {
      window.location.href = issue.vers;
      return;
    }
    if (issue.etat !== "ok" || !issue.data.redirectUrl) {
      setMsg((issue.etat === "refus" ? issue.error : null) ?? labels.error);
      setEnCours(false);
      return;
    }
    // Redirection vers la passerelle MonCash — le retour est vérifié
    // serveur-à-serveur par /api/moncash/return (invariant b).
    window.location.href = issue.data.redirectUrl;
  }

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={payer}
        disabled={enCours}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
      >
        {enCours ? labels.loading : labels.pay}
      </button>
      {msg && <p className="mt-1 text-xs text-danger-text">{msg}</p>}
    </div>
  );
}
