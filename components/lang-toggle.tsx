"use client";

import { useRouter } from "next/navigation";
import { LANG_COOKIE, LANGS, type Lang } from "@/lib/i18n";

/**
 * Libellés du sélecteur. Ils ne passent PAS par `t()` : le nom d'une langue
 * s'écrit dans cette langue, pas dans celle de l'interface — quelqu'un qui ne
 * lit pas le français doit reconnaître « Kreyòl ». Et `t()` est de toute façon
 * interdit côté client (règle en tête de `lib/i18n.ts`).
 *
 * `Record<Lang, …>` : ajouter une langue sans son libellé ne compile pas.
 */
const ABBR: Record<Lang, string> = { fr: "FR", ht: "KR", en: "EN" };
const NOM: Record<Lang, string> = {
  fr: "Français",
  ht: "Kreyòl ayisyen",
  en: "English",
};

/**
 * Sélecteur FR / Kreyòl / EN — cookie 1 an, puis re-rendu serveur.
 *
 * Trois boutons plutôt qu'une bascule : à deux langues, alterner suffisait ;
 * à trois, « basculer » n'a plus de sens et l'utilisateur doit voir où il va.
 * La liste vient de `LANGS`, pas d'une énumération recopiée — une quatrième
 * langue apparaîtra ici sans qu'on y touche, et si son libellé manque le
 * compilateur le dira (`Record<Lang, …>`).
 */
export function LangToggle({ current }: { current: Lang }) {
  const router = useRouter();

  function set(lang: Lang) {
    if (lang === current) return;
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  // `key` : avec deux boutons écrits à la main il n'en fallait pas ; dès qu'on
  // rend une LISTE, React en exige une. L'oubli ne casse rien à l'affichage —
  // il ne produit qu'un avertissement dans le journal du serveur, du genre que
  // personne ne lit. Vu le 2026-08-01 dans la sortie de `npm run dev`.
  const btn = (lang: Lang, label: string, title: string) => (
    <button
      key={lang}
      onClick={() => set(lang)}
      title={title}
      aria-pressed={current === lang}
      className={`rounded-md px-3 py-2 transition ${
        current === lang ? "bg-cloud font-semibold text-ink" : "text-mist hover:text-cloud"
      }`}
    >
      {label}
    </button>
  );

  // BL-124 : zones tactiles élargies (~40 px) — c'était ~22×18 px sur LE
  // bouton de bascule de langue, sur Android bas de gamme. Le passage à trois
  // boutons ne doit pas reprendre ce qui a été gagné là : `px-3 py-2` est
  // conservé tel quel, c'est la largeur du conteneur qui grandit.
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line p-0.5 text-xs">
      {LANGS.map((l) => btn(l, ABBR[l], NOM[l]))}
    </div>
  );
}
