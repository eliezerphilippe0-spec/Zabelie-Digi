import { Icone } from "@/components/icone";
/** Menu natif : ouverture sans JavaScript, fermeture et cadrage via HeaderShell. */
export function AccountMenu({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <details className="relative shrink-0" data-header-menu name="header-menu">
      <summary
        aria-label={label}
        title={label}
        className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-2 rounded-xl lg:px-2 text-on-chrome transition hover:bg-on-chrome/10 [&::-webkit-details-marker]:hidden"
      >
        <Icone taille={24}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        </Icone>
        <span className="hidden text-sm font-semibold lg:inline">{label}</span>
      </summary>
      <div className="header-menu-panel absolute right-0 top-full z-(--z-header) mt-2 w-64 rounded-xl border border-line bg-surface p-2 text-cloud shadow-lg">
        {children}
      </div>
    </details>
  );
}

/** Un lien du menu compte : pleine largeur, cible tactile de 44 px. */
export const MENU_LINK =
  "flex min-h-11 items-center rounded-lg px-3 text-sm text-cloud transition hover:bg-brand/10";
