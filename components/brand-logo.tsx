import Link from "next/link";

/**
 * Logo Zabelie — monogramme "Z" géométrique (chevrons).
 *
 * Le Z porte `--color-brand` (#f26a21), c'est-à-dire EXACTEMENT l'orange du
 * bouton « Rechercher » (`bg-brand`) — demande porteur du 2026-08-11. La tuile
 * passe donc à `--color-ink` : un Z orange sur la rampe or→orange d'avant
 * aurait disparu dans son propre fond. Contraste mesuré `#f26a21` sur
 * `#0a0a0a` = **6,5:1**, au-dessus du seuil AA.
 *
 * Le liseré brand à 40 % existe pour une seule raison : l'en-tête est lui-même
 * sombre, et sans lui la tuile n'a plus de silhouette — le Z flotterait.
 *
 * ⚠️ DEUXIÈME COPIE : `app/icon.svg` (favicon), où les variables CSS ne
 * résolvent pas et où les hex sont donc écrits en dur. Les deux sont croisées
 * par `tests/logo-deux-copies.test.ts` — elles avaient DÉJÀ divergé (le
 * favicon portait `#17123a`, un ink qui n'existe plus dans le thème) sans que
 * rien ne le dise.
 */
export function BrandMark({
  size = 32,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="11"
        fill="var(--color-ink)"
        stroke="var(--color-brand)"
        strokeOpacity="0.4"
        strokeWidth="2"
      />
      {/* Z stylisé en chevrons */}
      <path d="M14 15h20l-13 12h13l-2 6H13l13-12H14z" fill="var(--color-brand)" />
    </svg>
  );
}

export function BrandLogo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <BrandMark size={32} />
      <span className="text-sm font-semibold tracking-tight">
        Zabelie
      </span>
    </Link>
  );
}
