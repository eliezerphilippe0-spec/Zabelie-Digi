import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { getLang } from "@/lib/i18n-server";
import { t, type Lang } from "@/lib/i18n";
import { POLICY_VERSION } from "@/lib/policy";

export const metadata = {
  title: "Ce qui ne peut pas être vendu — Zabelie",
};

/**
 * Politique « produits interdits » (lot R1).
 *
 * Règle de PLATEFORME, volontairement plus stricte que la loi : elle est
 * opposable au vendeur parce qu'il l'accepte, pas parce qu'elle transcrit un
 * texte. Aucun numéro d'article n'y figure — le code douanier de 1987 et un
 * décret de 2023 coexistent, et lequel gouverne n'est pas tranché. On cite la
 * catégorie, jamais l'article.
 *
 * La version (`POLICY_VERSION`) est l'identifiant que l'attestation vendeur
 * enregistrera (R3). Elle est affichée ici pour qu'un vendeur puisse dire
 * quelle version il a lue.
 */

/** Les listes sont stockées en une clé, un élément par ligne (idiome du dépôt). */
function items(value: string): string[] {
  return value.split("\n").filter((l) => l.trim().length > 0);
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-mist">
        {children}
      </div>
    </section>
  );
}

function List({ lang, k }: { lang: Lang; k: Parameters<typeof t>[1] }) {
  return (
    <ul className="list-disc space-y-2 pl-5">
      {items(t(lang, k)).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export default async function ProduitsInterditsPage() {
  const lang = await getLang();

  return (
    <div className="bg-grain min-h-screen">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-5 py-16">
        <h1 className="text-3xl font-black tracking-tight">
          {t(lang, "policy.title")}
        </h1>
        <p className="mt-2 text-sm text-mist">
          {POLICY_VERSION} — {t(lang, "policy.date")}
        </p>

        <Section title={t(lang, "policy.why.h")}>
          <p>{t(lang, "policy.why.p")}</p>
        </Section>

        <Section title={t(lang, "policy.objects.h")}>
          <List lang={lang} k="policy.objects.items" />
        </Section>

        <Section title={t(lang, "policy.counterfeit.h")}>
          <p>{t(lang, "policy.counterfeit.p1")}</p>
          <p className="font-semibold text-cloud">
            {t(lang, "policy.counterfeit.p2")}
          </p>
        </Section>

        {/* Les deux phrases DOIVENT rester côte à côte : sans la seconde, la
            règle se lit comme une interdiction du rayon otomobil-moto, qui est
            le rayon principal de la plateforme. */}
        <Section title={t(lang, "policy.confusion.h")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <p className="rounded-xl border border-danger/50 bg-surface/60 p-4 font-semibold text-danger-text">
              {t(lang, "policy.confusion.banned")}
            </p>
            <p className="rounded-xl border border-line bg-surface/60 p-4 font-semibold text-cloud">
              {t(lang, "policy.confusion.allowed")}
            </p>
          </div>
          <p>{t(lang, "policy.confusion.p")}</p>
        </Section>

        <Section title={t(lang, "policy.tools.h")}>
          <p>{t(lang, "policy.tools.p1")}</p>
          <p>{t(lang, "policy.tools.p2")}</p>
          <List lang={lang} k="policy.tools.items" />
          <p className="font-semibold text-cloud">{t(lang, "policy.tools.p3")}</p>
        </Section>

        <Section title={t(lang, "policy.services.h")}>
          <p>{t(lang, "policy.services.p1")}</p>
          <List lang={lang} k="policy.services.items" />
          <p>{t(lang, "policy.services.p2")}</p>
          <p>{t(lang, "policy.services.p3")}</p>
        </Section>

        <Section title={t(lang, "policy.digital.h")}>
          <List lang={lang} k="policy.digital.items" />
        </Section>

        <Section title={t(lang, "policy.sanctions.h")}>
          <p>{t(lang, "policy.sanctions.p1")}</p>
          <p className="font-semibold text-cloud">
            {t(lang, "policy.sanctions.p2")}
          </p>
          <p>{t(lang, "policy.sanctions.p3")}</p>
        </Section>

        <Section title={t(lang, "policy.review.h")}>
          <p>{t(lang, "policy.review.p")}</p>
        </Section>

        <p className="mt-10 border-t border-line pt-6 text-xs text-mist">
          {POLICY_VERSION} — {t(lang, "policy.date")}. {t(lang, "policy.version.note")}
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
