"use client";

import { useEffect, useRef, useState } from "react";
import { appelSession } from "@/lib/appel-session";

export type OptionPanier = {
  rail: "moncash" | "kobara" | "stripe";
  kobaraProvider?: "natcash" | "moncash";
  label: string;
};

/**
 * Identité d'une option à l'écran. `rail` seul ne suffit pas : deux options
 * Kobara (NatCash, MonCash) partagent `rail: "kobara"`, et un chargement
 * indexé sur le rail allumerait les deux. Même règle que `cleOption` de
 * `components/buy-button.tsx` (son commentaire, lignes 26-31) ; elle n'est pas
 * importée de là pour ne pas tirer le bouton d'achat, ses brouillons et sa
 * recharge dans le paquet JavaScript du panier (3G).
 */
function cleOptionPanier(o: OptionPanier): string {
  return o.kobaraProvider ? `${o.rail}:${o.kobaraProvider}` : o.rail;
}

const CTA_PLEIN =
  "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand transition hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
const CTA_CONTOUR =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-line bg-surface/60 px-4 py-2 text-sm font-semibold text-cloud transition hover:border-brand/60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

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
 *
 * ─── LE VERROU (audit du 2026-10-27, M9) ────────────────────────────────────
 * `/api/panier/payer` ouvre un NOUVEAU groupe à chaque appel (aucune unicité
 * sur `zabelie_order_groups`), et son limiteur (5 par minute) laisse passer un
 * double appel. Un double-clic ouvrait donc deux groupes, réservait le stock
 * deux fois et créait deux sessions chez l'opérateur. Plus de la moitié des
 * utilisateurs de 40 ans et plus double-cliquent (Baymard).
 *
 * `setEnCours` ne protège de rien : un état React s'applique au rendu
 * SUIVANT, et le second clic arrive avant. Le verrou est donc un `useRef`,
 * posé de façon synchrone AVANT tout `await` (motif de `cart-pay-button.tsx`
 * et de `buy-button.tsx`), et relâché sur CHAQUE issue d'échec. Il reste
 * fermé quand on part vers l'opérateur ou vers la connexion : la page s'en va.
 *
 * Ce verrou est la moitié CLIENT. L'autre moitié, que le serveur ignore un
 * second groupe identique, touche l'argent et attend l'arbitrage du porteur.
 *
 * ─── LE FOCUS (m4) ──────────────────────────────────────────────────────────
 * Un `disabled` posé sur le bouton qu'on vient d'activer jette le focus
 * clavier sur `<body>`. Les moyens de paiement portent donc `aria-disabled`
 * et restent focalisables ; le clic est refusé dans le gestionnaire. Ce refus
 * lit l'état du RENDU, que le second clic d'un double clic n'a pas encore vu :
 * la vraie protection reste le verrou de `payer()`.
 */
export function CartPayAll({
  options,
  labels,
}: {
  options: OptionPanier[];
  labels: { title: string; note: string; coupon: string; loading: string; error: string; network: string; age: string };
}) {
  // Clé de l'option cliquée : SEUL ce bouton dit « chargement », les autres
  // sont simplement désactivés.
  const [enCours, setEnCours] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [ageDemande, setAgeDemande] = useState(false);
  const [ageAtteste, setAgeAtteste] = useState(false);
  const verrou = useRef(false);

  // Retour arrière depuis l'opérateur : un navigateur qui restaure la page
  // depuis son cache (bfcache) restaure aussi le verrou et « Préparation du
  // paiement… », qui mentirait jusqu'au rechargement. Restaurée, la page
  // redevient ce qu'un rechargement donnerait : rien en cours.
  useEffect(() => {
    function auRetour(e: PageTransitionEvent) {
      if (!e.persisted) return;
      verrou.current = false;
      setEnCours(null);
    }
    window.addEventListener("pageshow", auRetour);
    return () => window.removeEventListener("pageshow", auRetour);
  }, []);

  function echec(message: string) {
    verrou.current = false;
    setEnCours(null);
    setMsg(message);
  }

  async function payer(o: OptionPanier) {
    if (verrou.current) return;
    verrou.current = true;
    setEnCours(cleOptionPanier(o));
    setMsg(null);
    try {
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
      if (issue.etat === "reseau") {
        echec(labels.network);
        return;
      }
      if (issue.etat !== "ok" || !issue.data.redirectUrl) {
        if (issue.etat === "refus" && issue.code === "age_attestation_requise") setAgeDemande(true);
        echec((issue.etat === "refus" ? issue.error : null) ?? labels.error);
        return;
      }
      // Vers l'opérateur. Le retour est vérifié serveur-à-serveur (invariant b).
      window.location.assign(issue.data.redirectUrl);
    } catch {
      echec(labels.error);
    }
  }

  const bloque = enCours !== null || (ageDemande && !ageAtteste);

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
          disabled={enCours !== null}
          className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-cloud disabled:opacity-60"
        />
      </label>
      {ageDemande && (
        <label className="mt-3 flex min-h-11 items-start gap-2 text-sm text-cloud">
          <input type="checkbox" checked={ageAtteste} onChange={(e) => setAgeAtteste(e.target.checked)} className="mt-1" />
          {labels.age}
        </label>
      )}
      <div className="mt-3 grid gap-2">
        {options.map((o, i) => {
          const cle = cleOptionPanier(o);
          // Le premier moyen est l'action principale, en plein ; les autres en
          // contour (`buy-button.tsx`) : trois boutons orange côte à côte ne
          // disent plus lequel est le chemin attendu.
          const forme = i === 0 ? CTA_PLEIN : CTA_CONTOUR;
          return (
            <button
              key={cle}
              type="button"
              onClick={() => {
                if (bloque) return;
                void payer(o);
              }}
              aria-disabled={bloque}
              aria-busy={enCours === cle}
              className={forme}
            >
              {enCours === cle ? labels.loading : o.label}
            </button>
          );
        })}
      </div>
      {msg && <p role="alert" className="mt-2 text-sm text-danger-text">{msg}</p>}
    </section>
  );
}
