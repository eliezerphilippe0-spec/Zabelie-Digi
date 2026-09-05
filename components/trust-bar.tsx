/**
 * BANDEAU DE CONFIANCE — promesses TENUES seulement.
 *
 * La maquette porteur du 2026-08-09 en proposait dix, dont « livraison rapide »
 * et « vendeurs vérifiés », qui n'existent pas dans le produit. Un bandeau de
 * confiance qui promet ce qu'on ne fait pas est le moyen le plus rapide de
 * perdre la confiance qu'il annonce. `tests/accueil-maquette.test.ts` refuse
 * ces mots dans les quatre langues, accents en frontière compris.
 *
 * Deux formes :
 *   • `compact` (accueil premium §4.5, 2026-09-04) : UNE ligne de quatre
 *     repères — icône + libellé court — posée juste sous la bannière, où la
 *     réassurance pèse le plus, AVANT que le visiteur ne descende. Pas de
 *     sous-texte : il vit sur la fiche produit et au paiement, là où la
 *     décision se prend.
 *   • pleine : titre + une phrase par item (fiche, panier, aide).
 */

type Icone = "bouclier" | "coffre" | "gourde" | "mobile" | "message";
type Item = { t: string; b?: string; icone: Icone };

const ICONES: Record<Icone, string> = {
  bouclier: "M12 2l7 4v6c0 4.4-3 8.4-7 10-4-1.6-7-5.6-7-10V6l7-4z",
  coffre: "M4 7h16v12H4zM4 7l2-3h12l2 3M9 13h6",
  gourde: "M12 3v18M8.5 7.5h5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5h5",
  mobile: "M7 3h10v18H7zM11 18.5h2",
  message: "M4 5h16v11H9l-5 4V5z",
};

export function TrustBar({ items, compact = false }: { items: Item[]; compact?: boolean }) {
  if (compact) {
    return (
      <section className="mx-auto max-w-6xl px-3 pt-3">
        <ul className="grid grid-cols-4 gap-1.5">
          {items.map((it) => (
            <li key={it.t} className="flex flex-col items-center gap-1 text-center">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="h-5 w-5 fill-none stroke-cloud"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={ICONES[it.icone]} />
              </svg>
              <span className="text-[11px] leading-tight text-mist sm:text-xs">{it.t}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
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
              {it.b && <p className="mt-0.5 text-xs leading-snug text-mist">{it.b}</p>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
