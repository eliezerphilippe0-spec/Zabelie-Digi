import { Icone } from "@/components/icone";
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
      className="etiquette etiquette-neutre"
      title={aide}
    >
      <Icone taille={16}>
        <path d="M12 3 5 6v5c0 4.4 3 8.3 7 9.5 4-1.2 7-5.1 7-9.5V6z" />
        <path d="m9 12 2 2 4-4" />
      </Icone>
      {label}
      <span className="sr-only">{aide}</span>
    </span>
  );
}
