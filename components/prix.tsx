import { formatNombreHTG } from "@/lib/sample-data";

/**
 * LE PRIX QU'ON MONTRE À L'ACHETEUR — brief design, Phase 1.3.
 *
 * Manrope 800, chiffres tabulaires, orange de texte (`--color-accent`, A1), devise
 * plus légère et plus petite (`.prix`, `app/globals.css`). La taille vient du
 * contexte : un `text-*` passé en `className` ou hérité du parent.
 *
 * Le texte lu reste celui de `formatHTG` au caractère près : seule l'apparence
 * change, jamais le nombre (`tests/prix.test.ts`). Aucun calcul ici. Le montant
 * reçu est déjà celui du serveur.
 *
 * Pour un prix barré, une ligne d'historique ou un montant dans une phrase,
 * `formatHTG` reste le bon outil.
 */
export function Prix({ montant, className = "" }: { montant: number; className?: string }) {
  return (
    <span className={`prix numeric ${className}`.trimEnd()}>
      {formatNombreHTG(montant)} <span className="prix-devise">HTG</span>
    </span>
  );
}
