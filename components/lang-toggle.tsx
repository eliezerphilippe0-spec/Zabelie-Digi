"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { editorialLanguagePath, editorialLangFromPath } from "@/lib/editorial-routing";
import { guideLanguagePath } from "@/lib/guide-routing";
import { LANG_COOKIE, LANGS, type Lang } from "@/lib/i18n";

/**
 * Libellés du sélecteur. Ils ne passent PAS par `t()` : le nom d'une langue
 * s'écrit dans cette langue, pas dans celle de l'interface — quelqu'un qui ne
 * lit pas le français doit reconnaître « Kreyòl ». Et `t()` est de toute façon
 * interdit côté client (règle en tête de `lib/i18n.ts`).
 *
 * `Record<Lang, …>` : ajouter une langue sans son libellé ne compile pas.
 */
const ABBR: Record<Lang, string> = { fr: "FR", ht: "KR", en: "EN", es: "ES" };
const NOM: Record<Lang, string> = {
  fr: "Français",
  ht: "Kreyòl ayisyen",
  en: "English",
  es: "Español",
};

// Conservé pendant une navigation cliente qui remonte la page et son en-tête.
// N'est renseigné que par un clic utilisateur dans le navigateur.
let languageFocusPath: string | null = null;

function closeMenu(menu: HTMLDetailsElement | null, restoreFocus = false) {
  if (!menu) return;
  menu.open = false;
  if (restoreFocus) menu.querySelector("summary")?.focus({ preventScroll: true });
}

/**
 * Sélecteur FR / Kreyòl / EN — cookie 1 an, puis re-rendu serveur.
 *
 * Trois boutons plutôt qu'une bascule : à deux langues, alterner suffisait ;
 * à trois, « basculer » n'a plus de sens et l'utilisateur doit voir où il va.
 * La liste vient de `LANGS`, pas d'une énumération recopiée — une quatrième
 * langue apparaîtra ici sans qu'on y touche, et si son libellé manque le
 * compilateur le dira (`Record<Lang, …>`).
 */
export function LangToggle({
  current,
  compact = false,
}: {
  current: Lang;
  /**
   * PASTILLE D'EN-TÊTE — la forme retenue le 2026-09-05, après avoir constaté
   * que le sélecteur n'était atteignable qu'au fond du menu compte.
   *
   * ─── CE QUI A ÉTÉ CORRIGÉ ───────────────────────────────────────────────
   * La Phase 2 de la refonte avait rangé ce sélecteur DANS le menu compte pour
   * tenir l'en-tête sous 100 px (critère A2). Le compromis était mesuré, il
   * était payé au mauvais endroit : sur toutes les pages sauf `/connexion`,
   * changer de langue demandait de cliquer une icône de personne — qui
   * n'annonce rien d'une langue — puis de descendre un menu. Rien à l'écran
   * ne disait qu'on POUVAIT changer, ni dans quelle langue on était.
   *
   * C'est plus grave ici qu'ailleurs : le kreyòl est la langue de référence du
   * produit, le français est servi par défaut (V-18), donc un kreyòlophone
   * arrive systématiquement dans la mauvaise langue et doit deviner comment en
   * sortir.
   *
   * ─── CE QUE FONT LES GRANDS, ET CE QU'ON EN GARDE ───────────────────────
   * Amazon et AliExpress affichent la langue COURANTE dans l'en-tête, en
   * permanence, et l'ouvrent en un geste. Airbnb et Booking posent un globe :
   * il annonce la fonction mais **ne dit pas où l'on est** — c'est une
   * faiblesse, pas un modèle. On garde donc le code de langue en clair
   * (« FR »), qui informe sans interaction, et qui tient en deux caractères.
   *
   * Ce qu'on écarte volontairement : la BANNIÈRE d'auto-détection façon Google
   * (« Ou vle kontinye an Kreyòl ? »). Deux raisons, et la première suffit —
   * V-18 est une décision du porteur qui fixe le français par défaut sans
   * cookie ; basculer sur `Accept-Language` la contredirait, et ce n'est pas à
   * l'agent de trancher un positionnement. La seconde : une bande en haut de
   * page coûte de la hauteur là où le critère A1 exige qu'une rangée de
   * produits tienne au-dessus du pli.
   *
   * ─── LA FORME ───────────────────────────────────────────────────────────
   * `<details>` natif, comme le menu compte : aucun JavaScript pour ouvrir,
   * donc le contrôle fonctionne avant l'hydratation — ce qui compte sur les
   * Android d'entrée de gamme visés. La cible fait 44 px (A13), la pastille
   * ajoute de la LARGEUR et pas de hauteur (A2 intact), et chaque langue est
   * écrite dans sa propre langue.
   */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!compact || languageFocusPath !== pathname) return;
    const frame = requestAnimationFrame(() => {
      menuRef.current?.querySelector("summary")?.focus({ preventScroll: true });
      languageFocusPath = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [compact, pathname, current]);

  useEffect(() => {
    if (!compact) return;
    function dismissOutside(event: PointerEvent) {
      const menu = menuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) closeMenu(menu);
    }
    function dismissEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && menuRef.current?.open) {
        event.preventDefault();
        closeMenu(menuRef.current, true);
      }
    }
    document.addEventListener("pointerdown", dismissOutside, true);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [compact]);

  function set(lang: Lang) {
    // router.refresh() preserves native <details> state. Close it immediately,
    // even for the current language, and restore keyboard focus outside the list.
    closeMenu(menuRef.current, true);
    if (lang === current || isPending) return;
    document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
    const guidePath = guideLanguagePath(pathname, lang) ?? (editorialLangFromPath(pathname) ? editorialLanguagePath(pathname, lang) : null);
    if (compact && guidePath) languageFocusPath = guidePath;
    startTransition(() => {
      if (guidePath) router.push(guidePath + window.location.search + window.location.hash, { scroll: false });
      else router.refresh();
    });
  }

  if (compact) {
    return (
      <details ref={menuRef} className="relative shrink-0 [&[open]>summary+div]:block">
        <summary
          aria-label={NOM[current]}
          className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center gap-1 rounded-xl text-sm font-semibold text-on-chrome transition marker:content-none hover:bg-on-chrome/10 [&::-webkit-details-marker]:hidden"
          aria-busy={isPending}
        >
          {isPending && <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 motion-safe:animate-spin fill-none stroke-current" strokeWidth="2"><path d="M12 3a9 9 0 1 1-9 9" /></svg>}
          {ABBR[current]}
        </summary>
        <div className="absolute right-0 z-50 mt-1 hidden w-44 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              disabled={isPending}
              onClick={() => set(l)}
              aria-pressed={current === l}
              className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left text-sm transition ${
                current === l ? "font-semibold text-cloud" : "text-mist hover:text-cloud"
              }`}
            >
              {/* Le nom dans SA langue — quelqu'un qui ne lit pas le français
                  doit reconnaître « Kreyòl ayisyen » sans traduction. */}
              <span>{NOM[l]}</span>
              <span className="text-xs opacity-70">{ABBR[l]}</span>
            </button>
          ))}
        </div>
      </details>
    );
  }

  // `key` : avec deux boutons écrits à la main il n'en fallait pas ; dès qu'on
  // rend une LISTE, React en exige une. L'oubli ne casse rien à l'affichage —
  // il ne produit qu'un avertissement dans le journal du serveur, du genre que
  // personne ne lit. Vu le 2026-08-01 dans la sortie de `npm run dev`.
  const btn = (lang: Lang, label: string, title: string) => (
    <button
      key={lang}
      type="button"
      disabled={isPending}
      aria-busy={isPending}
      onClick={() => set(lang)}
      title={title}
      aria-pressed={current === lang}
      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 transition ${
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
