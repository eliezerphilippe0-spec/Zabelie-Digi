/**
 * L'ORIGINE VERS LAQUELLE ON REDIRIGE — et pourquoi ce n'est pas
 * `NEXT_PUBLIC_SITE_URL` tout court.
 *
 * ⚠️ CE FICHIER CORRIGE UNE PANNE DE CLASSE, PAS UN CAS. Les routes de retour
 * (`/auth/callback`, `/api/moncash/return`) faisaient :
 *
 *     const site = process.env.NEXT_PUBLIC_SITE_URL ?? url.origin;
 *     return NextResponse.redirect(`${site}${next}`);
 *
 * Si la variable vaut `https://zabelie.com` et que le visiteur est arrivé sur
 * `https://www.zabelie.com`, la séquence est :
 *
 *   1. Supabase pose le cookie de session sur l'hôte QUI A SERVI la requête,
 *      donc `www.zabelie.com` ;
 *   2. la route redirige vers `zabelie.com` — une AUTRE origine ;
 *   3. le cookie ne suit pas. L'utilisateur atterrit déconnecté, sans erreur.
 *
 * « Rien ne se passe » — le symptôme le plus difficile à diagnostiquer qui
 * soit, parce qu'aucune ligne d'erreur n'est produite nulle part. Le dépôt
 * connaissait déjà le mécanisme : `components/forgot-password-form.tsx:44`
 * l'énonce (« le couple zabelie.com / www.zabelie.com suffit à le casser »).
 * Le mot de passe oublié a été corrigé le 2026-08-11 en contournant
 * `/auth/callback` ; les deux routes qui restent n'avaient jamais été
 * reprises.
 *
 * ─── LA RÈGLE, ET SA LIMITE ────────────────────────────────────────────────
 * On garde l'origine de la REQUÊTE quand elle ne diffère de l'origine
 * configurée que par le préfixe `www.` — c'est-à-dire quand les deux hôtes
 * partagent le même domaine enregistrable et que le cookie ne peut donc pas
 * être perdu par notre faute. Dans TOUT autre cas, on redirige vers l'origine
 * configurée, exactement comme avant.
 *
 * ⚠️ C'est délibérément étroit. `url.origin` vient de l'en-tête `Host`, qui
 * est fourni par le client : l'accepter largement rouvrirait l'open redirect
 * que `safeNext` referme sur le chemin. La seule variation admise est
 * l'ajout ou le retrait de `www.`, et le protocole doit correspondre.
 */

/** L'hôte, débarrassé d'un éventuel `www.` de tête. */
function sansWww(host: string): string {
  return host.replace(/^www\./i, "");
}

/**
 * @param requestUrl  l'URL de la requête entrante (`new URL(req.url)`)
 * @param configured  `process.env.NEXT_PUBLIC_SITE_URL`
 * @returns l'origine absolue à utiliser pour les redirections, sans barre finale
 */
export function siteOrigin(
  requestUrl: URL | string,
  configured: string | undefined | null
): string {
  const req = typeof requestUrl === "string" ? new URL(requestUrl) : requestUrl;
  const attendu = configured?.trim().replace(/\/+$/, "");

  // Pas de variable : le comportement d'avant, l'origine de la requête.
  if (!attendu) return req.origin;

  let cible: URL;
  try {
    cible = new URL(attendu);
  } catch {
    // Variable malformée : on ne fabrique pas une URL invalide, on retombe sur
    // la requête. Une redirection vers un hôte cassé est pire qu'un repli.
    return req.origin;
  }

  // Même hôte : rien à arbitrer.
  if (cible.host === req.host) return cible.origin.replace(/\/+$/, "");

  // Apex ↔ www, même protocole : on garde l'origine de la requête pour que le
  // cookie de session survive au saut. C'est TOUT le correctif.
  if (
    cible.protocol === req.protocol &&
    sansWww(cible.host).toLowerCase() === sansWww(req.host).toLowerCase()
  ) {
    return req.origin;
  }

  // Hôte étranger (ou protocole différent) : on impose l'origine configurée,
  // comme avant. C'est ce qui empêche un en-tête `Host` forgé de détourner la
  // redirection.
  return cible.origin.replace(/\/+$/, "");
}
