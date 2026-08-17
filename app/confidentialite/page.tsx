import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import {
  POLITIQUE,
  resoudre,
  type Bloc,
  type Politique,
} from "@/lib/policy-privacy";

export const metadata = {
  title: "Politique de confidentialité — Zabelie",
};

// Dernière mise à jour de la politique (à actualiser à chaque changement).
const LAST_UPDATE = "15 août 2026";

/**
 * `**gras**` et `*italique*` → JSX.
 *
 * Écrit à la main plutôt qu'avec une bibliothèque markdown : le texte est
 * connu, la grammaire tient en deux marqueurs, et une dépendance de plus sur
 * un chemin juridique se justifierait mal. Le découpage capture les
 * délimiteurs pour qu'aucun caractère du texte ne se perde en route.
 */
function riche(texte: string): React.ReactNode[] {
  return texte.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean).map((bout, i) => {
    if (bout.startsWith("**") && bout.endsWith("**")) {
      return (
        <strong key={i} className="text-cloud">
          {bout.slice(2, -2)}
        </strong>
      );
    }
    if (bout.startsWith("*") && bout.endsWith("*")) {
      return <em key={i}>{bout.slice(1, -1)}</em>;
    }
    return <span key={i}>{bout}</span>;
  });
}

function Section({ titre, blocs, lang }: { titre: string; blocs: Bloc[]; lang: Parameters<typeof resoudre>[1] }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight">{titre}</h2>
      <div className="mt-3 space-y-3 text-base leading-relaxed text-mist">
        {blocs.map((bloc, i) =>
          "p" in bloc ? (
            <p key={i}>{riche(resoudre(bloc.p, lang))}</p>
          ) : (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {bloc.ul.map((item, j) => (
                <li key={j}>{riche(resoudre(item, lang))}</li>
              ))}
            </ul>
          ),
        )}
      </div>
    </section>
  );
}

export default async function ConfidentialitePage() {
  const lang = await getLang();
  const doc: Politique = POLITIQUE[lang];

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-2xl px-5 py-16">
        <h1 className="text-3xl font-black tracking-tight">{doc.titre}</h1>
        <p className="mt-2 text-sm text-mist">
          {doc.majLabel} : {LAST_UPDATE}
        </p>
        {/* Sur les versions traduites seulement : dire laquelle fait foi. Une
            traduction non relue par un juriste qui se présenterait comme le
            texte de référence serait un engagement qu'on n'a pas pris. */}
        {doc.avisTraduction && (
          <p className="mt-4 rounded-xl border border-line px-4 py-3 text-xs text-mist">
            {doc.avisTraduction}
          </p>
        )}

        {doc.sections.map((s) => (
          <Section key={s.titre} titre={s.titre} blocs={s.blocs} lang={lang} />
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
