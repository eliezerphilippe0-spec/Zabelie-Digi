import { NextResponse } from "next/server";
import { getLang } from "@/lib/i18n-server";
import { t, type I18nKey } from "@/lib/i18n";

/**
 * ERREUR D'API TRADUITE — le message part déjà dans la langue du visiteur.
 *
 * ⚠️ POURQUOI CÔTÉ SERVEUR, ET NON PAR UN CODE RENVOYÉ AU CLIENT.
 *
 * L'autre conception — la route rend `{ code: "…" }` et chaque écran traduit —
 * était mesurable et disqualifiante : **350 messages dans 60 fichiers d'API**,
 * consommés par autant d'appelants qui font tous `data.error`. La faire passer
 * aurait demandé de modifier chaque appelant, et chaque appelant oublié aurait
 * affiché un code brut à la place d'une phrase.
 *
 * Ici, `data.error` reste `data.error`. **Aucun composant client ne change** —
 * et un appelant qu'on n'a pas encore converti continue de fonctionner, en
 * français, au lieu de casser. La conversion peut donc se faire route par
 * route, ce qui est la seule façon de traiter 163 messages distincts sans
 * tout casser d'un coup.
 *
 * ⚠️ `getLang()` lit le cookie de langue. Sur une route appelée hors
 * navigateur — un webhook d'opérateur, un cron — il n'y a pas de cookie et la
 * langue par défaut s'applique. C'est correct : personne ne LIT ces
 * messages-là, ils vont au journal.
 */
export async function erreurTraduite(
  cle: I18nKey,
  status: number,
  extra?: Record<string, unknown>
): Promise<NextResponse> {
  const lang = await getLang();
  return NextResponse.json({ error: t(lang, cle), ...extra }, { status });
}

/**
 * Variante synchrone, quand la langue a déjà été résolue dans la requête.
 *
 * Évite un second `await cookies()` par erreur rendue — sans importance sur un
 * chemin d'échec isolé, réel dans une boucle. À utiliser dès qu'une route
 * rend plusieurs erreurs.
 */
export function erreurAvecLangue(
  lang: Parameters<typeof t>[0],
  cle: I18nKey,
  status: number,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ error: t(lang, cle), ...extra }, { status });
}
