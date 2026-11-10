"use client";

import { useEffect, useState } from "react";

/**
 * RAPPEL D'ACHAT de la fiche, sur téléphone (audit du 2026-11-10, P0-6).
 *
 * Mesuré à 360 × 800 : le bouton de paiement était à 1 012 px (fichier) et
 * 1 216 px (service), soit plus d'un écran de défilement, et rien ne le
 * rappelait. Cette barre pose le prix et UN lien vers `#acheter`, le bloc
 * d'achat existant. Ce n'est pas un second point d'achat : aucun état, aucun
 * appel, le paiement reste dans `BuyButton`.
 *
 * ⚠️ EXCEPTION NOMMÉE à « pas de bouton flottant » (`docs/design/DESIGN-SYSTEM.md`),
 * accordée par le porteur le 2026-11-10 pour cette seule barre. Ce qui la tient :
 *
 * * elle S'EFFACE dès que le bloc d'achat, ou n'importe quel autre bouton
 *   principal de la page, est à l'écran : jamais deux boutons orange ensemble ;
 * * elle n'apparaît qu'après le premier rendu, en position fixe : aucun
 *   décalage de mise en page ; sans JavaScript, elle n'existe pas et la fiche
 *   reste celle d'avant ;
 * * elle se pose AU-DESSUS de la barre de navigation, sans la recouvrir.
 *
 * Le contenu (prix, libellé traduit) arrive du serveur en `children` : `t()` et
 * le formatage du prix ne passent pas dans le bundle.
 */
export function RappelAchat({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const cibles = document.querySelectorAll("#acheter, main .bouton.bouton-primaire:not([data-rappel-achat] *)");
    if (cibles.length === 0) return;
    const enVue = new Set<Element>();
    const observateur = new IntersectionObserver((entrees) => {
      for (const entree of entrees) {
        if (entree.isIntersecting) enVue.add(entree.target);
        else enVue.delete(entree.target);
      }
      setVisible(enVue.size === 0);
    });
    cibles.forEach((cible) => observateur.observe(cible));
    return () => observateur.disconnect();
  }, []);

  if (!visible) return null;
  return (
    <div data-rappel-achat className="rappel-achat flex items-center justify-between gap-3 md:hidden">
      {children}
    </div>
  );
}
