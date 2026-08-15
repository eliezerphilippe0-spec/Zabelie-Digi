/**
 * Visuel hero conçu en code (CSS/SVG) — aucune image externe.
 * Composition : mesh de dégradés + motif géométrique + cartes
 * "produits digitaux" flottantes en glassmorphism.
 */
export function HeroVisual() {
  return (
    <div className="relative aspect-square w-full max-w-md select-none">
      {/* Halo de dégradés (rampe accent → brand, scopé au visuel —
          ne pas réutiliser .bg-grain ici : c'est le wrapper de page) */}
      <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-accent/25 via-brand/10 to-transparent blur-2xl" />

      {/* Motif géométrique (chevrons) en filigrane */}
      <svg
        className="absolute inset-0 h-full w-full opacity-[0.12]"
        viewBox="0 0 200 200"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="chevrons"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path
              d="M0 10 L10 0 L20 10 M0 20 L10 10 L20 20"
              stroke="var(--color-accent-gold)"
              strokeWidth="1.5"
              fill="none"
            />
          </pattern>
        </defs>
        <rect width="200" height="200" fill="url(#chevrons)" />
      </svg>

      {/* Carte principale : "produit en vedette" */}
      <div className="glass glow-ring absolute left-6 top-10 w-52 rounded-2xl p-4">
        <div className="h-20 rounded-xl bg-gradient-to-br from-amber to-magenta" />
        <p className="mt-3 text-xs font-semibold text-cloud">
          Pack presets — Afro Tones
        </p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-[10px] text-mist">Naïka Studio</span>
          <span className="text-xs font-bold text-gradient">1 500 HTG</span>
        </div>
      </div>

      {/* Carte secondaire : "beat / audio" avec waveform */}
      <div className="glass absolute bottom-12 right-2 w-48 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-gold to-amber text-on-brand">
            ♪
          </span>
          <div className="flex-1">
            <p className="text-[11px] font-semibold text-cloud">Beat Kompa</p>
            <p className="text-[10px] text-mist">Prod. Lakay</p>
          </div>
        </div>
        {/* Waveform */}
        <div className="mt-3 flex h-8 items-end gap-[3px]">
          {[5, 11, 7, 16, 9, 22, 14, 28, 12, 19, 8, 24, 10, 15, 6].map(
            (h, i) => (
              <span
                key={i}
                className="flex-1 rounded-full bg-gradient-to-t from-violet to-teal"
                style={{ height: `${h * 1.1}px` }}
              />
            )
          )}
        </div>
      </div>

      {/* Badge "paiement confirmé" */}
      <div className="glass absolute right-8 top-4 flex items-center gap-2 rounded-full px-3 py-1.5">
        <span className="grid h-4 w-4 place-items-center rounded-full bg-success text-[9px] text-ink">
          ✓
        </span>
        <span className="text-[10px] font-medium text-cloud">
          Paiement confirmé
        </span>
      </div>

      {/* Pastille MonCash */}
      <div className="glass absolute bottom-2 left-12 flex items-center gap-2 rounded-full px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-gold" />
        <span className="text-[10px] font-medium text-cloud">
          Encaissé via MonCash
        </span>
      </div>
    </div>
  );
}
