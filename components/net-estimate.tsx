"use client";

import { commissionHTG, netHTG, type CreatorTier } from "@/lib/commission";

/**
 * Ce que le vendeur touchera, sous le prix qu'il est en train de saisir.
 *
 * Raison d'être : c'est le SEUL consommateur réel de `lib/commission.ts`. Un
 * module d'oracle qui n'est importé que par sa propre suite de tests ne peut
 * pas diverger bruyamment — il diverge en silence. En le branchant ici, tout
 * écart entre l'oracle TS et la règle SQL (`zabelie_commission_htg`, 0044)
 * devient visible à l'écran d'un vendeur, pas seulement dans un test.
 *
 * ⚠️ C'est une ESTIMATION d'affichage, jamais un calcul d'argent. Le seul
 * calculateur reste la SQL, au moment du paiement. Les deux doivent
 * s'accorder ; `tests/commission.test.ts` en est le garde.
 */

/**
 * Groupage manuel plutôt qu'`Intl` : le rendu serveur et le rendu client
 * n'ont pas forcément les mêmes données de locale, et un espace insécable
 * différent des deux côtés suffit à déclencher une erreur d'hydratation.
 */
function htg(n: number): string {
  const digits = String(n);
  let out = "";
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += " ";
    out += digits[i];
  }
  return `${out} HTG`;
}

export type NetEstimateLabels = {
  /** « Vous recevez » / « Ou resevwa » */
  youReceive: string;
  /** « commission » / « komisyon » */
  fee: string;
  /** « aucune commission à ce prix » / « pa gen komisyon sou pri sa a » */
  noFee: string;
  /** « L'arrondi est toujours en votre faveur. » */
  favor: string;
};

export function NetEstimate({
  priceHTG,
  tier = "standard",
  labels,
}: {
  priceHTG: string | number;
  tier?: CreatorTier;
  labels: NetEstimateLabels;
}) {
  const raw = typeof priceHTG === "string" ? priceHTG.trim() : priceHTG;
  if (raw === "") return null;

  const gross = Math.floor(Number(raw));
  // Prix vide, non numérique, nul ou négatif : rien à annoncer. Un produit
  // gratuit (0 HTG) existe sur le catalogue — il n'a pas de net à afficher.
  if (!Number.isFinite(gross) || gross <= 0) return null;

  const fee = commissionHTG(gross, tier);
  const net = netHTG(gross, tier);

  return (
    <p className="text-xs text-mist" aria-live="polite">
      <span className="font-semibold text-cloud">
        {labels.youReceive} {htg(net)}
      </span>
      {fee > 0 ? (
        <>
          {" · "}
          {labels.fee} {htg(fee)}
        </>
      ) : (
        <>
          {" — "}
          {labels.noFee}
        </>
      )}
      <br />
      {labels.favor}
    </p>
  );
}
