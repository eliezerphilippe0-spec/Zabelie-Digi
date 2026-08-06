import { t, type Lang } from "@/lib/i18n";
import { ROUNDING_IN_FORCE } from "@/lib/commission";

/**
 * La FAQ — extraite de l'accueil pour être partagée avec /aide.
 *
 * Composant SERVEUR : `t()` reste autorisé ici. Un seul endroit porte les
 * cinq questions ; les deux pages qui les affichent ne peuvent plus diverger.
 */
export function FaqList({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-3">
      {([1, 2, 3, 4, 5] as const).map((i) => (
        <details
          key={i}
          className="group rounded-2xl border border-line bg-surface/40 px-5 py-4"
        >
          <summary className="cursor-pointer list-none font-semibold marker:content-none">
            <span className="mr-2 inline-block text-accent transition group-open:rotate-90">›</span>
            {t(lang, `faq.q${i}` as Parameters<typeof t>[1])}
          </summary>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            {/* La réponse 3 annonce le taux ET l'arrondi. Elle suit donc la
                règle DÉPLOYÉE (`ROUNDING_IN_FORCE`) au lieu d'attendre qu'on
                pense à la réécrire le jour où `0044` est appliquée : une
                annonce commerciale qu'il faut penser à mettre à jour finit
                toujours par décrire l'état d'avant. */}
            {t(
              lang,
              i === 3 && ROUNDING_IN_FORCE === "floor"
                ? "faq.a3.floor"
                : (`faq.a${i}` as Parameters<typeof t>[1]),
            )}
          </p>
        </details>
      ))}
    </div>
  );
}
