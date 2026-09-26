import { t, type I18nKey, type Lang } from "@/lib/i18n";
import { variation, type LigneEntonnoir } from "@/lib/entonnoir";

/** Clés LITTÉRALES : le croisement des clés mortes (tests/i18n-cles-mortes) doit les voir. */
const ETIQUETTE: Record<string, I18nKey> = {
  comptes: "funnel.step.comptes",
  offres: "funnel.step.offres",
  recherches_vides: "funnel.step.recherches_vides",
  commandes: "funnel.step.commandes",
  paiements_ok: "funnel.step.paiements_ok",
  paiements_ko: "funnel.step.paiements_ko",
};

/** Rendu serveur, zéro JavaScript : le back-office reste lisible sur une connexion dégradée. */
export function EntonnoirSemaine({ lignes, lang }: { lignes: LigneEntonnoir[]; lang: Lang }) {
  const n = (v: number | null) => (v === null ? t(lang, "funnel.unavailable") : String(v));
  return (
    <section className="mt-10" aria-labelledby="entonnoir-titre">
      <h2 id="entonnoir-titre" className="text-lg font-semibold">{t(lang, "funnel.title")}</h2>
      <p className="mt-1 text-xs text-mist">{t(lang, "funnel.intro")}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-mist">
            <tr>
              <th className="py-2 pr-4 font-semibold">{t(lang, "funnel.col.step")}</th>
              <th className="py-2 pr-4 text-right font-semibold">{t(lang, "funnel.col.week")}</th>
              <th className="py-2 pr-4 text-right font-semibold">{t(lang, "funnel.col.before")}</th>
              <th className="py-2 text-right font-semibold">{t(lang, "funnel.col.change")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lignes.map((l) => (
              <tr key={l.cle}>
                <td className="py-2 pr-4">{t(lang, ETIQUETTE[l.cle])}</td>
                <td className={`numeric py-2 pr-4 text-right ${l.courant === null ? "text-warning-text" : ""}`}>{n(l.courant)}</td>
                <td className={`numeric py-2 pr-4 text-right ${l.precedent === null ? "text-warning-text" : ""}`}>{n(l.precedent)}</td>
                <td className="numeric py-2 text-right">{variation(l.courant, l.precedent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
