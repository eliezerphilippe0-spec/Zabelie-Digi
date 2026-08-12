"use client";

import { commissionAuTaux, rateBps, type CreatorTier } from "@/lib/commission";

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
  /** Phrase d'arrondi correspondant à la règle DÉPLOYÉE (`ROUNDING_IN_FORCE`). */
  rounding: string;
  /** « Estimation au prix plein — un code promo réduit… » */
  caveat: string;
};

export function NetEstimate({
  priceHTG,
  tier = "standard",
  rateBpsEnVigueur,
  labels,
}: {
  priceHTG: string | number;
  tier?: CreatorTier;
  /**
   * Taux RÉELLEMENT configuré en base, lu côté serveur (`0066`) et passé
   * jusqu'ici. Omis, on retombe sur la constante compilée — c'est le repli,
   * pas la source. Voir `lib/commission-config.ts`.
   */
  rateBpsEnVigueur?: number;
  labels: NetEstimateLabels;
}) {
  const raw = typeof priceHTG === "string" ? priceHTG.trim() : priceHTG;
  if (raw === "") return null;

  const gross = Math.floor(Number(raw));
  // Prix vide, non numérique, nul ou négatif : rien à annoncer. Un produit
  // gratuit (0 HTG) existe sur le catalogue — il n'a pas de net à afficher.
  if (!Number.isFinite(gross) || gross <= 0) return null;

  // Le taux VENU DE LA BASE prime ; la constante n'est que le repli.
  const bps = Number.isInteger(rateBpsEnVigueur)
    ? (rateBpsEnVigueur as number)
    : rateBps(tier);
  const fee = commissionAuTaux(gross, bps);
  const net = gross - fee;

  // Une commission nulle (petits montants) n'est PAS annoncée comme telle.
  // L'écrire — « aucune commission à ce prix » — reviendrait à enseigner le
  // découpage d'une vente en petites unités au moment exact où le vendeur
  // choisit son prix. Le montant net reste affiché ; c'est le mode d'emploi
  // qu'on ne fournit pas. Fermer vraiment le seuil est une décision
  // commerciale ouverte (`docs/02`, D-5).

  return (
    <p className="text-xs text-mist" aria-live="polite">
      <span className="font-semibold text-cloud">
        {labels.youReceive} {htg(net)}
      </span>
      {fee > 0 && (
        <>
          {" · "}
          {labels.fee} {htg(fee)}
        </>
      )}
      <br />
      {labels.rounding} {labels.caveat}
    </p>
  );
}
