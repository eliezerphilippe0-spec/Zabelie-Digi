import { siteUrl } from "@/lib/site-url";

/**
 * Le domaine atteint-il CE déploiement ? (0125)
 *
 * Sur un domaine vendeur, le proxy renvoie tout chemin autre que la racine
 * vers zabelie.com en signant la réponse (`x-zabelie-domaine: <hôte>`). Une
 * redirection posée chez le registraire vers zabelie.com ne porte pas cette
 * signature : elle ne suffit pas à activer.
 */
export async function domainePointeVersZabelie(
  domaine: string,
  recuperer: typeof fetch = fetch,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await recuperer(`https://${domaine}/zabelie-sonde-domaine`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const signe = res.headers.get("x-zabelie-domaine") === domaine;
    const vers = res.headers.get("location") ?? "";
    if (res.status === 308 && signe && vers.startsWith(siteUrl())) return { ok: true, detail: "ok" };
    return { ok: false, detail: `HTTP ${res.status}${signe ? "" : " sans signature Zabelie"}` };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.name : "injoignable" };
  }
}
