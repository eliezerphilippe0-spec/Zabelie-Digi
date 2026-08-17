/**
 * Bouton de déconnexion — un `<form method="POST">`, pas un client component.
 *
 * ─── CE QU'IL ÉTAIT, ET LE DÉFAUT QU'IL PORTAIT ────────────────────────────
 * Un composant client qui appelait `createClient().auth.signOut()` sans
 * `scope` : révocation LOCALE seulement, cookies non effacés côté serveur.
 * L'utilisateur voyait l'accueil et se croyait sorti — sur un Android partagé
 * ou un poste de cybercafé, l'historique, l'adresse, le solde vendeur et les
 * pièces KYC restaient joignables. Un bouton qui ment sur son effet est plus
 * dangereux qu'un bouton absent.
 *
 * ─── POURQUOI UN FORMULAIRE PLUTÔT QU'UN `onClick` ─────────────────────────
 * Il fonctionne SANS JavaScript — sur un téléphone d'entrée de gamme dont
 * l'hydratation n'a pas abouti, un `onClick` ne fait rien du tout. Même
 * raison que le repli en liens simples de la barre mobile (BL-104). Et le
 * navigateur poste nativement : aucun risque de déconnexion déclenchée par
 * une balise `<img>` tierce, puisque la route n'expose pas de `GET`.
 *
 * Plus AUCUN `"use client"` ici : le libellé arrive toujours en prop (la
 * règle de `lib/i18n.ts` — `t()` est réservé au serveur), mais il n'y a plus
 * de code client du tout.
 */
export function SignOutButton({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  return (
    <form action="/api/auth/signout" method="POST" className="contents">
      <button
        type="submit"
        className={className || "text-sm text-mist transition hover:text-cloud"}
      >
        {label}
      </button>
    </form>
  );
}
