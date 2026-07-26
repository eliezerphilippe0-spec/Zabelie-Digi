import Link from "next/link";

/**
 * Logo Zabelie — monogramme "Z" géométrique (chevrons), rampe
 * or → orange → brand du thème (SVG inline : les variables CSS des tokens
 * résolvent dans le DOM).
 */
export function BrandMark({
  gradId = "zt-grad",
  size = 32,
  className = "",
}: {
  gradId?: string;
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
      <defs>
        <linearGradient id={gradId} x1="4" y1="4" x2="44" y2="44">
          <stop offset="0" stopColor="var(--color-accent-gold)" />
          <stop offset="0.45" stopColor="var(--color-accent)" />
          <stop offset="1" stopColor="var(--color-brand)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill={`url(#${gradId})`} />
      {/* Z stylisé en chevrons */}
      <path
        d="M14 15h20l-13 12h13l-2 6H13l13-12H14z"
        fill="var(--color-ink)"
        fillOpacity="0.92"
      />
    </svg>
  );
}

export function BrandLogo({ className = "", gradId }: { className?: string; gradId?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2 ${className}`}>
      <BrandMark size={32} gradId={gradId} />
      <span className="text-sm font-semibold tracking-tight">
        Zabelie
      </span>
    </Link>
  );
}
