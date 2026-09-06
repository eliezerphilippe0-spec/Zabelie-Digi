import { commissionAuTaux, type CreatorTier } from "@/lib/commission";
import type { TauxCommission } from "@/lib/commission-config";

/**
 * LE TAUX DE COMMISSION, ÉCRIT LÀ OÙ ON DÉCIDE DE VENDRE.
 *
 * Pourquoi ce composant existe : `/vendre` n'annonçait pas la commission.
 * C'est le seul paramètre commercial du produit, et il était absent de la page
 * dont l'unique travail est de convaincre quelqu'un d'ouvrir boutique — pendant
 * que l'accueil, lui, promettait déjà « 0 HTG pour ouvrir ». Un vendeur devait
 * donc s'inscrire, publier, et découvrir le taux sous le champ prix.
 *
 * ─── LE TAUX N'EST PAS ÉCRIT ICI, ET C'EST TOUT L'ENJEU ─────────────────────
 * La règle du dépôt : « tout paramètre commercial vit en table de config,
 * jamais en dur ». Un « 10 % » gravé dans un libellé i18n serait une PROMESSE
 * FIXE adossée à une valeur MOBILE : le jour où `zabelie_commission_config`
 * change, la page annoncerait un taux que la plateforme ne pratique plus. Et
 * personne ne le verrait, puisque rien ne relie un libellé à une ligne de base.
 *
 * Le taux arrive donc en props, lu par `lireTauxCommission()` (`0054`/`0066`),
 * exactement comme l'estimation sous le champ prix. Les deux affichages disent
 * forcément la même chose, parce qu'ils lisent la même ligne.
 *
 * ─── L'EXEMPLE EST CALCULÉ, JAMAIS ÉCRIT ────────────────────────────────────
 * « Sur 1 000 HTG vous recevez 900 HTG » passe par `commissionAuTaux`, donc par
 * l'ARRONDI RÉELLEMENT EN VIGUEUR (`ROUNDING_IN_FORCE`). Un exemple écrit à la
 * main serait juste aujourd'hui et faux au premier changement de taux ou de
 * sens d'arrondi — et un chiffre faux montré à un vendeur avant qu'il s'engage
 * n'est pas une coquille, c'est une promesse non tenue.
 */

/** Base de l'exemple. Ronde exprès : elle se lit sans calculer. */
export const EXEMPLE_HTG = 1000;

export type CommissionLabels = {
  title: string;
  /** Contient {taux} et {palier}. */
  ligne: string;
  /** Contient {brut}, {net} et {taux}. */
  exemple: string;
  /** Ce que la commission ne prélève PAS. */
  gratuit: string;
};

/**
 * « 10 % », « 6 % », « 8,5 % » — les points de base rendus lisibles.
 *
 * La virgule décimale est celle du français et du kreyòl ; `fr-HT` la donne, et
 * `maximumFractionDigits: 2` évite « 10,00 % » sur le cas courant. Les taux
 * sont des entiers de points de base : 1000 → 10, 850 → 8,5.
 */
export function formaterTaux(bps: number): string {
  return `${new Intl.NumberFormat("fr-HT", { maximumFractionDigits: 2 }).format(bps / 100)} %`;
}

const fmtHtg = (n: number) => `${new Intl.NumberFormat("fr-HT").format(n)} HTG`;

export function CommissionAnnonce({
  taux,
  tier = "standard",
  labels,
}: {
  taux: TauxCommission;
  /** Le palier ANNONCÉ. `standard` : c'est celui de tout nouveau vendeur. */
  tier?: CreatorTier;
  labels: CommissionLabels;
}) {
  const bps = taux[tier];
  const net = EXEMPLE_HTG - commissionAuTaux(EXEMPLE_HTG, bps);

  return (
    <div className="mt-5 rounded-2xl border border-line bg-surface/40 p-5">
      <h2 className="text-sm font-semibold text-cloud">{labels.title}</h2>

      {/* Le taux, en gros : c'est le chiffre qu'on vient chercher. */}
      <p className="mt-2 text-3xl font-black tracking-tight text-cloud">
        <span className="numeric">{formaterTaux(bps)}</span>
      </p>
      <p className="mt-1 text-sm text-mist">
        {labels.ligne
          .replace("{taux}", formaterTaux(taux.standard))
          .replace("{palier}", formaterTaux(taux.elite))}
      </p>

      {/* L'exemple chiffré : un vendeur ne convertit pas un pourcentage de
          tête, surtout au téléphone. Les deux montants sont calculés. */}
      <p className="mt-3 text-sm text-cloud">
        {labels.exemple
          .replace("{brut}", fmtHtg(EXEMPLE_HTG))
          .replace("{net}", fmtHtg(net))
          .replace("{taux}", formaterTaux(bps))}
      </p>

      <p className="mt-2 text-xs text-mist">{labels.gratuit}</p>
    </div>
  );
}
