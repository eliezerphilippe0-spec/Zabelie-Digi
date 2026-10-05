import { t } from "@/lib/i18n";
import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { metaLangue } from "@/lib/langue-url";
import { TrackerPreferences } from "@/components/tracker-preferences";
import { CONFIDENTIALITE_VERSION } from "@/lib/legal-acceptance";
import {
  POLITIQUE,
  resoudre,
  type Bloc,
  type Politique,
} from "@/lib/policy-privacy";

const META = {
  title: "Politique de confidentialité — Zabelie",
  description:
    "La politique de confidentialité de Zabelie : les données traitées sur la marketplace, leur usage et vos droits.",
};

// Canonique et hreflang selon la langue servie (/ht/, /fr/ — lib/langue-url.ts).
export async function generateMetadata() {
  return { ...META, ...metaLangue("/confidentialite", await getLang()) };
}

// Dernière mise à jour de la politique (à actualiser à chaque changement).
const LAST_UPDATE = "5 octobre 2026";

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

function Section({ titre, ancre, blocs, lang, children }: { titre: string; ancre?: string; blocs: Bloc[]; lang: Parameters<typeof resoudre>[1]; children?: React.ReactNode }) {
  return (
    <section id={ancre} className="mt-10 scroll-mt-24">
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
      {children}
    </section>
  );
}

export default async function ConfidentialitePage() {
  const lang = await getLang();
  const doc: Politique = POLITIQUE[lang];

  return (
    <div className="bg-grain min-h-dvh">
      <SiteNav />
      <main id="main" data-policy-version={CONFIDENTIALITE_VERSION} className="mx-auto max-w-2xl px-5 py-16">
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

        <section className="mt-10">
          <h2 className="text-xl font-bold">{t(lang, "collections.privacy.title")}</h2>
          <p className="mt-3 leading-relaxed text-mist">{t(lang, "collections.privacy.body")}</p>
        </section>
        {doc.sections.map((s) => (
          <Section key={s.titre} titre={s.titre} ancre={s.ancre} blocs={s.blocs} lang={lang}>
            {s.ancre === "traceurs" && (
              <TrackerPreferences
                labels={{
                  title: t(lang, "pixels.prefs.title"),
                  current: t(lang, "pixels.prefs.current"),
                  yes: t(lang, "pixels.prefs.yes"),
                  no: t(lang, "pixels.prefs.no"),
                  none: t(lang, "pixels.prefs.none"),
                  saved: t(lang, "pixels.prefs.saved"),
                  hint: t(lang, "pixels.prefs.hint"),
                  accept: t(lang, "pixels.consent.accept"),
                  refuse: t(lang, "pixels.consent.refuse"),
                }}
              />
            )}
          </Section>
        ))}
      </main>
      <SiteFooter />
    </div>
  );
}
