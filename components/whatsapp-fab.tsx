import { MetricA } from "@/components/metric-a";

/**
 * Bouton WhatsApp FLOTTANT — accueil premium §4.6. 48 px, bas droite,
 * discret : il remplace la carte pleine largeur qui vivait AU-DESSUS des
 * produits. Rendu seulement si le numéro (ou le lien court) est posé :
 * un bouton vers personne est pire que rien (`lib/whatsapp.ts`).
 *
 * Décalé du bord et au-dessus du contenu (`z-40`, sous l'en-tête `z-50`) ;
 * le libellé vit en `aria-label`, l'icône est le seul visible.
 */
export function WhatsAppFab({ href, label }: { href: string | null; label: string }) {
  if (!href) return null;
  return (
    <MetricA
      event="whatsapp_clicked"
      href={href}
      className="fixed bottom-4 right-4 z-40 grid h-12 w-12 place-items-center rounded-full bg-chrome text-on-chrome shadow-lg transition active:scale-[0.97]"
    >
      <span className="sr-only">{label}</span>
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="h-6 w-6 fill-none stroke-current"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="M4 5h16v11H9l-5 4V5z" />
      </svg>
    </MetricA>
  );
}
