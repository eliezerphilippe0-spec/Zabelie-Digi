"use client";

/**
 * « Réessayer », sur la page hors réseau.
 *
 * Composant client pour une seule raison : `location.reload()` a besoin du
 * navigateur. Et c'est bien `reload()` qu'il faut, pas un lien — la page de
 * secours est servie À LA PLACE de la navigation qui a échoué, mais l'URL de
 * la barre d'adresse reste celle que l'utilisateur voulait. Recharger rejoue
 * donc SA demande, pas cette page-ci.
 *
 * ⚠️ Pas de détection de retour du réseau. `navigator.onLine` rend `true` sur
 * un wifi sans Internet — une pancarte « le réseau est revenu » fondée
 * là-dessus mentirait la moitié du temps, et sur ce terrain elle mentirait
 * plus souvent qu'ailleurs.
 */
export function BoutonReessayer({ libelle }: { libelle: string }) {
  return (
    <button
      type="button"
      onClick={() => location.reload()}
      className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-on-brand"
    >
      {libelle}
    </button>
  );
}
