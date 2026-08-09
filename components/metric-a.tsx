"use client";

/**
 * Ancre sortante mesurée — le seul clic que le serveur ne verra jamais.
 *
 * `sendBeacon` : part même si la page se décharge (c'est le cas — on ouvre
 * WhatsApp), n'attend rien, n'échoue jamais visiblement. Si l'API manque
 * (vieux WebView), le lien marche quand même : la mesure est un bonus, jamais
 * une condition.
 *
 * Composant client minimal : aucun libellé propre (les enfants viennent du
 * parent serveur), aucune donnée — juste l'événement, validé côté serveur.
 */
export function MetricA({
  event,
  href,
  className,
  children,
}: {
  event: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        try {
          navigator.sendBeacon?.(
            "/api/metrics/landing",
            new Blob([JSON.stringify({ event })], { type: "application/json" })
          );
        } catch {
          // La mesure ne casse jamais la navigation.
        }
      }}
    >
      {children}
    </a>
  );
}
