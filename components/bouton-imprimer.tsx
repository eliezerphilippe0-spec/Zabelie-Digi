"use client";

/** Le libellé vient du serveur : un composant client ne lit pas le cookie de langue. */
export function BoutonImprimer({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bouton inline-flex min-h-11 items-center rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-on-brand"
    >
      {label}
    </button>
  );
}
