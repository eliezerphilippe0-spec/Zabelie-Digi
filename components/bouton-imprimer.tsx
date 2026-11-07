"use client";

/** Le libellé vient du serveur : un composant client ne lit pas le cookie de langue. */
export function BoutonImprimer({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bouton bouton-primaire bouton-compact"
    >
      {label}
    </button>
  );
}
