"use client";

import { useState } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { OnlineStatus } from "@/components/admin/online-status";

/**
 * Bloc identité de l'admin connecté — avatar à initiales, nom, rôle,
 * pastille de connexion, menu `⋮`.
 *
 * Le menu ne contient QUE des destinations qui existent : Tableau de bord et
 * Déconnexion. « Profil » et « Paramètres » (maquette) n'ont AUCUNE page dans
 * le dépôt — un lien vers rien est un faux bouton, interdit par la règle
 * absolue. Ils apparaîtront quand leurs pages existeront.
 *
 * Données : la session existante uniquement (props depuis le serveur).
 * Aucune requête nouvelle, aucune PII journalisée.
 */
export function IdentityBlock({ name }: { name: string }) {
  const [ouvert, setOuvert] = useState(false);
  const initiales = name
    .split(/\s+/)
    .map((m) => m[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="relative flex items-center gap-2.5"
      onKeyDown={(e) => e.key === "Escape" && setOuvert(false)}
    >
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand text-sm font-extrabold text-ink">
        {initiales || "A"}
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-ink">
          <OnlineStatus variant="dot" />
        </span>
      </span>
      <span className="hidden min-w-0 sm:block">
        <span className="block max-w-[10rem] truncate text-sm font-semibold text-cloud">
          {name}
        </span>
        <span className="block text-xs text-mist">Administrateur</span>
      </span>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        aria-expanded={ouvert}
        aria-label="Menu du compte"
        className="grid h-9 w-9 place-items-center rounded-lg text-mist transition hover:bg-black/20 hover:text-cloud"
      >
        <span aria-hidden="true">⋮</span>
      </button>

      {ouvert && (
        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-line bg-surface p-1.5 shadow-xl">
          <Link
            href="/tableau-de-bord"
            className="block rounded-lg px-3 py-2 text-sm text-cloud hover:bg-black/20"
            onClick={() => setOuvert(false)}
          >
            Tableau de bord
          </Link>
          <SignOutButton
            label="Déconnexion"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-cloud hover:bg-black/20"
          />
        </div>
      )}
    </div>
  );
}
