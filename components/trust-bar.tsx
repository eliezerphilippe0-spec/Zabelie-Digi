/**
 * BANDEAU DE CONFIANCE — cinq promesses, et chacune est TENUE.
 *
 * La maquette porteur en proposait cinq autres : « Livraison rapide partout en
 * Haïti », « Produits de qualité — vendeurs vérifiés », « Satisfait ou
 * remboursé », « Support 7j/7 ». Aucune n'existe :
 *   • Zabelie ne livre pas et n'observe pas la remise (0043, docs/21) ;
 *   • aucun KYC vendeur n'est implémenté — le chantier 2 est une SPEC ;
 *   • aucun processus de remboursement automatisé n'existe ;
 *   • une seule personne répond, pas une équipe 7j/7.
 *
 * Le bandeau reste au même endroit et pèse le même poids visuel ; ce sont les
 * phrases qui changent. Chacune de celles-ci s'adosse à un mécanisme réel :
 *   1. confirmation serveur-à-serveur — invariant de paiement (b) ;
 *   2. escrow gelé jusqu'à la remise — `gated_on_delivery`, 0043 §2 ;
 *   3. ledger en gourdes entières — règle dure n°3 ;
 *   4. rail MonCash, aucun compte bancaire requis ;
 *   5. WhatsApp — et la carte se masque si le numéro n'est pas posé.
 *
 * ⚠️ Ne pas y ajouter de promesse sans mécanisme. `tests/promesse-vendeur.test.ts`
 * croise les affirmations sur les vendeurs avec ce qui les adosse, et rougit
 * quand l'adossement manque.
 */

type Item = { t: string; b: string; icone: "bouclier" | "coffre" | "gourde" | "mobile" | "message" };

const ICONES: Record<Item["icone"], string> = {
  // Bouclier — paiement vérifié côté serveur.
  bouclier: "M12 2l7 4v6c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-4z",
  // Coffre — l'argent gardé.
  coffre: "M4 7h16v12H4zM4 7l2-3h12l2 3M9 13h6",
  // Pièce — la gourde.
  gourde: "M12 3v18M8.5 7.5h5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5h5",
  // Téléphone — MonCash sans banque.
  mobile: "M7 3h10v18H7zM11 18.5h2",
  // Bulle — l'aide humaine.
  message: "M4 5h16v11H9l-5 4V5z",
};

export function TrustBar({ items }: { items: Item[] }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-6">
      <ul className="grid grid-cols-1 gap-4 rounded-2xl border border-line bg-surface/40 px-5 py-5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((it) => (
          <li key={it.t} className="flex items-start gap-3">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="mt-0.5 h-6 w-6 shrink-0 fill-none stroke-accent"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={ICONES[it.icone]} />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-cloud">{it.t}</p>
              <p className="mt-0.5 text-xs leading-snug text-mist">{it.b}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
