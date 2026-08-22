/**
 * Curseur de pagination — opaque pour l'appelant, par KEYSET et non par OFFSET.
 *
 * ── POURQUOI PAS `OFFSET` ───────────────────────────────────────────────────
 * `offset 20 limit 20` relit la page suivante d'un jeu qui a bougé entre-temps.
 * Un produit publié pendant la pagination décale tout : l'appelant reçoit deux
 * fois la même fiche et n'en voit jamais une autre. Sur une API destinée à
 * alimenter le contexte d'un modèle, ce doublon devient une affirmation.
 *
 * Le keyset pagine sur la DERNIÈRE LIGNE VUE — `(created_at, id)` — et reste
 * exact quoi qu'il arrive au reste de la table.
 *
 * ── POURQUOI `id` EN SECOND ─────────────────────────────────────────────────
 * `created_at` seul n'est pas unique : deux insertions dans la même
 * milliseconde partagent l'horodatage, et la page suivante en sauterait une ou
 * la répéterait. `id` tranche l'égalité. C'est la même raison pour laquelle le
 * tri porte sur les DEUX colonnes.
 *
 * ── OPACITÉ ─────────────────────────────────────────────────────────────────
 * Base64url d'un JSON. Ce n'est pas du chiffrement et ça ne prétend pas l'être :
 * l'opacité dit à l'appelant « ne construis pas ce jeton toi-même », elle ne
 * protège aucun secret. Rien de confidentiel n'y entre — un horodatage et un
 * identifiant que l'appelant vient de recevoir dans la réponse.
 */

export type Cle = { t: string; i: string };

export function encoderCurseur(cle: Cle): string {
  return Buffer.from(JSON.stringify(cle), "utf8").toString("base64url");
}

/**
 * Décode un curseur. Rend `null` si le jeton est illisible.
 *
 * ⚠️ L'APPELANT DOIT TRAITER `null` COMME UNE ERREUR D'ENTRÉE, jamais comme
 * « pas de curseur ». Un curseur corrompu qu'on ignore silencieusement renvoie
 * la PREMIÈRE page : l'appelant croit avancer, reçoit indéfiniment le même
 * début, et rien dans la réponse ne le lui dit. C'est la boucle infinie
 * silencieuse — exactement la classe de défaut que ce dépôt traque, où l'échec
 * se présente comme une réussite.
 */
export function decoderCurseur(brut: string): Cle | null {
  try {
    const v = JSON.parse(Buffer.from(brut, "base64url").toString("utf8")) as unknown;
    if (typeof v !== "object" || v === null) return null;
    const { t, i } = v as Record<string, unknown>;
    if (typeof t !== "string" || typeof i !== "string") return null;
    // L'horodatage doit être une date réelle : `new Date("x")` rend `Invalid
    // Date` sans lever, et la comparaison SQL qui suivrait serait muette.
    if (Number.isNaN(Date.parse(t))) return null;
    if (!/^[0-9a-f-]{36}$/i.test(i)) return null;
    return { t, i };
  } catch {
    return null;
  }
}
