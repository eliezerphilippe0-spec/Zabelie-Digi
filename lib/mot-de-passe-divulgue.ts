/**
 * MOTS DE PASSE DIVULGUÉS — le contrôle fait dans le code (instruction du
 * porteur, 2026-10-29). La protection native de Supabase Auth exige le plan
 * Pro ; le projet est en Free.
 *
 * ─── K-ANONYMAT, DE BOUT EN BOUT ───────────────────────────────────────────
 * Le NAVIGATEUR calcule le SHA-1 du mot de passe et n'envoie que ses CINQ
 * premiers caractères hexadécimaux à notre route (`/api/auth/fuites/<préfixe>`),
 * qui interroge Have I Been Pwned (Pwned Passwords, API `range`) et rend la
 * liste des suffixes connus pour ce préfixe — quelques centaines, complétée de
 * faux suffixes (`Add-Padding`). La comparaison se fait ICI, dans le navigateur.
 * Ni Zabelie ni HIBP ne voient le mot de passe, ni son empreinte complète ; HIBP
 * ne voit pas non plus l'adresse de l'utilisateur, seulement celle du serveur.
 *
 * ─── CE QUE ÇA NE FERME PAS ────────────────────────────────────────────────
 * L'inscription et le changement de mot de passe passent par le client
 * Supabase du navigateur : quelqu'un qui appelle Supabase Auth directement
 * contourne ce contrôle. Il protège les vrais utilisateurs contre eux-mêmes,
 * pas la plateforme contre un attaquant. La protection native (plan Pro) le
 * ferait côté serveur.
 *
 * ─── EN CAS DE PANNE : ON LAISSE PASSER ────────────────────────────────────
 * `null` = contrôle impossible (réseau, HIBP indisponible, quota). L'appelant
 * continue : bloquer toutes les inscriptions parce qu'un service tiers est
 * tombé serait pire que le risque couvert. C'est le seul « fail-open » voulu.
 */

/** Empreinte SHA-1 en hexadécimal MAJUSCULE, le format de Pwned Passwords. */
export async function empreinteSha1(motDePasse: string): Promise<string> {
  const octets = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(motDePasse));
  return [...new Uint8Array(octets)].map((o) => o.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export const PREFIXE_RE = /^[0-9A-F]{5}$/;

/**
 * Le suffixe figure-t-il dans la réponse `range` ? Lignes `SUFFIXE:COMPTE`.
 * Les lignes de remplissage (`Add-Padding`) portent un compte de 0 : elles ne
 * désignent aucun mot de passe réel et ne comptent jamais.
 */
export function suffixeDivulgue(reponse: string, suffixe: string): boolean {
  const cible = suffixe.toUpperCase();
  for (const ligne of reponse.split(/\r?\n/)) {
    const [s, compte] = ligne.trim().split(":");
    if (s?.toUpperCase() === cible && Number(compte) > 0) return true;
  }
  return false;
}

/**
 * `true` divulgué, `false` absent des fuites connues, `null` contrôle impossible.
 * Seuls les cinq premiers caractères de l'empreinte quittent l'appareil.
 */
export async function motDePasseDivulgue(
  motDePasse: string,
  fetcher: typeof fetch = fetch,
  delaiMs = 4000,
): Promise<boolean | null> {
  try {
    const empreinte = await empreinteSha1(motDePasse);
    const prefixe = empreinte.slice(0, 5);
    const controleur = new AbortController();
    const minuterie = setTimeout(() => controleur.abort(), delaiMs);
    try {
      const reponse = await fetcher(`/api/auth/fuites/${prefixe}`, {
        method: "GET",
        credentials: "omit",
        cache: "force-cache",
        signal: controleur.signal,
      });
      if (!reponse.ok) return null;
      return suffixeDivulgue(await reponse.text(), empreinte.slice(5));
    } finally {
      clearTimeout(minuterie);
    }
  } catch {
    return null;
  }
}
