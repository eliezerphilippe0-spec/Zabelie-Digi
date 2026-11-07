import { Icone } from "@/components/icone";

/**
 * MESSAGE D'ERREUR — texte ET icône, jamais la couleur seule (brief Phase 2.2,
 * WCAG 1.4.1).
 *
 * Avant : `<p role="alert" className="text-danger-text">`, écrit à la main
 * dans chaque formulaire. Le texte disait l'erreur, mais rien d'autre que le
 * rouge ne la distinguait d'une aide, et un écran délavé au soleil efface le
 * rouge en premier.
 *
 * `role="alert"` : annoncé dès qu'il apparaît. Pour une erreur qui porte sur un
 * champ, passer `id` et le relier au champ (`aria-describedby`, avec
 * `aria-invalid`) : le lecteur d'écran la relit quand on y revient.
 */
export function MessageErreur({
  id,
  className = "",
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p id={id} role="alert" className={className ? `message-erreur ${className}` : "message-erreur"}>
      <Icone taille={16}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.25" />
        <path d="M12 16.5h.01" />
      </Icone>
      <span>{children}</span>
    </p>
  );
}
