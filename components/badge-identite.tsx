/**
 * Badge « Identité vérifiée » (0138, décision porteur du 2026-10-14).
 *
 * Couleurs neutres, à dessein : l'orange est réservé aux actions et aux prix
 * (A12), le vert aux statuts d'argent (« payé ») ; emprunter l'un ou l'autre
 * ferait lire ce badge comme un bouton ou comme une garantie de paiement.
 *
 * Le libellé dit ce qui a été contrôlé, une pièce d'identité ; l'aide, lue par
 * les lecteurs d'écran et affichée au survol (et en clair sur la boutique),
 * dit ce que ce n'est PAS : une garantie sur les produits.
 */
export function BadgeIdentite({ label, aide }: { label: string; aide: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-cloud"
      title={aide}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      {label}
      <span className="sr-only">{aide}</span>
    </span>
  );
}
