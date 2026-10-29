import { lienTelephone, type PointRetrait } from "@/lib/points-retrait";

/**
 * Les points de retrait d'une zone (0082, docs/77 §12.6) — présentation seule, sans état :
 * le même composant sert le sélecteur de zone du bouton d'achat (côté client) et l'écran
 * « aucune offre pour cette zone » du catalogue (côté serveur).
 *
 * Tous les libellés arrivent en props, résolus côté serveur : un composant client ne lit pas
 * le cookie de langue (tests/i18n-client-discipline.test.ts).
 *
 * Rend `null` quand il n'y a rien à montrer : un encadré vide serait une promesse vide.
 */
export type PointsRetraitLabels = {
  title: string;
  /** Zabelie ne livre pas, aucune commission affichée : à convenir avec le vendeur. */
  note: string;
  /** Nom accessible du lien téléphone, contient `{nom}`. */
  call: string;
};

export function PointsRetrait({ points, labels }: { points: readonly PointRetrait[]; labels: PointsRetraitLabels }) {
  if (points.length === 0) return null;
  return (
    <section className="space-y-2 rounded-lg border border-line p-3 text-left text-xs text-mist" aria-label={labels.title}>
      <h3 className="text-sm font-semibold text-cloud">{labels.title}</h3>
      <ul className="space-y-2">
        {points.map((p) => (
          <li key={p.id}>
            <p className="font-semibold text-cloud">{p.nom}</p>
            <p className="break-words">{p.adresse}</p>
            {p.telefon && lienTelephone(p.telefon) ? (
              <a href={lienTelephone(p.telefon) ?? undefined} aria-label={labels.call.replace("{nom}", p.nom)} className="inline-flex min-h-11 items-center underline">
                {p.telefon}
              </a>
            ) : p.telefon ? (
              <p>{p.telefon}</p>
            ) : null}
          </li>
        ))}
      </ul>
      <p>{labels.note}</p>
    </section>
  );
}
