"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Le libellé arrive en PROP, jamais de `t()` ici : ce composant est client,
 * et `t()`/`DICT` sont réservés au serveur (règle en tête de `lib/i18n.ts`).
 *
 * Il était écrit en dur — « Déconnexion » — pendant que `nav.logout` existait,
 * traduite dans les quatre langues, sans aucun site d'appel. Un utilisateur en
 * kreyòl voyait donc un bouton en français. La clé morte et le texte en dur
 * étaient les deux faces du même défaut ; `tests/i18n-cles-mortes.test.ts`
 * ferme la classe.
 */
export function SignOutButton({
  className = "",
  label,
}: {
  className?: string;
  label: string;
}) {
  const router = useRouter();

  async function signOut() {
    try {
      await createClient().auth.signOut();
    } catch {
      // Supabase non configuré : on renvoie quand même à l'accueil.
    }
    router.push("/");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className={className || "text-sm text-mist transition hover:text-cloud"}
    >
      {label}
    </button>
  );
}
