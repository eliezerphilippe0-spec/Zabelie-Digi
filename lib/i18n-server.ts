import { cookies } from "next/headers";
import { LANG_COOKIE, isLang, type Lang } from "@/lib/i18n";

/**
 * Langue courante côté serveur (cookie), FR par défaut.
 *
 * ⚠️ « FR par défaut » est une DÉCISION, pas un reste : tranchée par le
 * porteur le 2026-09-02 (« Oui fr »), après que l'audit pré-déploiement
 * (constat #4) et `docs/47` §3 l'avaient posée comme un arbitrage ouvert —
 * le repli valait `fr` depuis l'origine sans que personne ne l'ait choisi.
 * Il est choisi. Un crawler, un premier visiteur, un lien partagé sans
 * cookie : français. Le kreyòl reste à un clic (`lang-toggle`) et dans le
 * cookie pour qui l'a choisi.
 *
 * Ce que ça ne tranche PAS : la langue dans l'URL (`/ht/`, `/fr/`), qui est
 * la seule façon d'indexer les deux — `docs/47` §3, toujours ouvert.
 */
export async function getLang(): Promise<Lang> {
  const store = await cookies();
  const v = store.get(LANG_COOKIE)?.value;
  return isLang(v) ? v : "fr";
}
