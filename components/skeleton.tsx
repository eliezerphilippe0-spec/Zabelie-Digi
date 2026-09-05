/**
 * SQUELETTES DE CHARGEMENT — la forme du contenu, pas un rond qui tourne.
 *
 * Toutes les pages publiques sont `force-dynamic` : chaque visite attend
 * Supabase. Sur 3G, ça se lisait comme un écran BLANC de une à trois
 * secondes — « ça ne marche pas », avant même la première image. Aucun
 * `loading.tsx` n'existait (audit UX du 2026-09-02, constat #1).
 *
 * Règles :
 *   • la forme suit le contenu réel (`product-card.tsx` : vignette h-40,
 *     trois lignes, une ligne de pied) — pas un gabarit générique ;
 *   • `animate-pulse` est coupé sous `prefers-reduced-motion`
 *     (`motion-reduce:animate-none`) ;
 *   • AUCUN texte : un squelette ne se traduit pas, et une chaîne en dur
 *     ferait rougir `i18n-chaines-en-dur`. L'état est porté par
 *     `aria-busy` sur le conteneur, que les lecteurs d'écran annoncent.
 */

const PULSE = "animate-pulse motion-reduce:animate-none rounded-lg bg-surface-brown/70";

export function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`${PULSE} ${className}`} />;
}

/** Une carte produit fantôme : même boîte que `ProductCard`. */
export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col overflow-hidden rounded-card border border-line bg-surface"
    >
      {/* Même anatomie que la carte (accueil premium §4.4) : image carrée,
          nom sur deux lignes, prix, vendeur — le squelette ne promet pas une
          autre forme que celle qui arrive. */}
      <SkeletonBlock className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <SkeletonBlock className="h-4 w-4/5" />
        <SkeletonBlock className="h-4 w-3/5" />
        <SkeletonBlock className="h-4 w-14" />
        <SkeletonBlock className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Grille de cartes fantômes, mêmes colonnes que le catalogue. */
export function SkeletonGrid({ n = 6 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: n }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Enveloppe de page : même `bg-grain` que les vraies pages, état annoncé. */
export function SkeletonPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-grain min-h-dvh" aria-busy="true" aria-live="polite">
      {children}
    </div>
  );
}
