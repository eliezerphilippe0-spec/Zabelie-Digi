"use client";

import { useState } from "react";
import { appelSession } from "@/lib/appel-session";

export type OptionPanier = {
  rail: "moncash" | "kobara" | "stripe";
  kobaraProvider?: "natcash" | "moncash";
  label: string;
};

/**
 * PAYER TOUT LE PANIER (0128) — un seul paiement, plusieurs vendeurs.
 *
 * Aucun montant n'est envoyé : le serveur relit chaque prix en base et scelle
 * le total (règle dure n°3). Ce bouton ne transmet qu'un rail, un code promo
 * facultatif et, si un article l'exige, l'attestation d'âge.
 *
 * L'attestation n'apparaît QUE lorsque le serveur l'a demandée
 * (`age_attestation_requise`) : la cocher d'avance pour tout le panier serait
 * une déclaration faite sans savoir sur quoi elle porte.
 */
export function CartPayAll({
  options,
  labels,
}: {
  options: OptionPanier[];
  labels: { title: string; note: string; coupon: string; loading: string; error: string; age: string };
}) {
  const [enCours, setEnCours] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [ageDemande, setAgeDemande] = useState(false);
  const [ageAtteste, setAgeAtteste] = useState(false);

  async function payer(o: OptionPanier) {
    setEnCours(true);
    setMsg(null);
    const issue = await appelSession<{ redirectUrl?: string }>(
      "/api/panier/payer",
      {
        rail: o.rail,
        ...(o.kobaraProvider ? { kobaraProvider: o.kobaraProvider } : {}),
        ...(code.trim() ? { couponCode: code.trim() } : {}),
        ...(ageAtteste ? { ageAttestation: true } : {}),
      },
      "/panier",
    );
    if (issue.etat === "connexion") {
      window.location.assign(issue.vers);
      return;
    }
    if (issue.etat !== "ok" || !issue.data.redirectUrl) {
      if (issue.etat === "refus" && issue.code === "age_attestation_requise") setAgeDemande(true);
      setMsg((issue.etat === "refus" ? issue.error : null) ?? labels.error);
      setEnCours(false);
      return;
    }
    // Vers l'opérateur. Le retour est vérifié serveur-à-serveur (invariant b).
    window.location.assign(issue.data.redirectUrl);
  }

  return (
    <section className="mt-6 rounded-2xl border border-line bg-surface/40 p-4" aria-labelledby="payer-tout">
      <h2 id="payer-tout" className="text-base font-bold text-cloud">{labels.title}</h2>
      <p className="mt-1 text-xs text-mist">{labels.note}</p>
      <label className="mt-3 block text-xs font-semibold text-mist">
        {labels.coupon}
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={40}
          autoCapitalize="characters"
          className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-cloud"
        />
      </label>
      {ageDemande && (
        <label className="mt-3 flex items-start gap-2 text-sm text-cloud">
          <input type="checkbox" checked={ageAtteste} onChange={(e) => setAgeAtteste(e.target.checked)} className="mt-1" />
          {labels.age}
        </label>
      )}
      <div className="mt-3 grid gap-2">
        {options.map((o) => (
          <button
            key={o.kobaraProvider ? `${o.rail}:${o.kobaraProvider}` : o.rail}
            type="button"
            onClick={() => payer(o)}
            disabled={enCours || (ageDemande && !ageAtteste)}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 disabled:opacity-60"
          >
            {enCours ? labels.loading : o.label}
          </button>
        ))}
      </div>
      {msg && <p role="alert" className="mt-2 text-sm text-danger-text">{msg}</p>}
    </section>
  );
}
