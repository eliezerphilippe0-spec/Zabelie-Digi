"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LANG_COOKIE, isLang, type Lang } from "@/lib/i18n";
import { errLabels } from "@/lib/i18n-erreur";

/**
 * Frontière d'erreur globale. Composant CLIENT — Next.js l'exige.
 *
 * Ses libellés viennent de `lib/i18n-erreur.ts`, pas de `t()` : la règle en
 * tête de `lib/i18n.ts` réserve le dictionnaire au serveur, et cette page n'a
 * aucun parent serveur pour lui passer des props. La raison complète est
 * écrite dans `lib/i18n-erreur.ts`.
 *
 * LANGUE — le cookie n'est lisible qu'après hydratation. Rendre directement la
 * langue du cookie produirait un écart entre le HTML serveur (`fr`) et le
 * premier rendu client (`ht`), donc un avertissement d'hydratation ET, sur un
 * appareil lent, un texte qui change sous les yeux. On part donc de `fr` et on
 * corrige dans un effet : c'est le seul ordre qui ne ment jamais à React.
 *
 * `reset()` re-tente le rendu du segment. Il est offert AVANT le lien d'accueil
 * parce qu'une erreur transitoire — une requête coupée sur un réseau instable —
 * est le cas le plus fréquent ici, et qu'y répondre par « retournez à
 * l'accueil » ferait perdre la page à quelqu'un qui n'avait besoin que d'un
 * second essai.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>("fr");

  useEffect(() => {
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LANG_COOKIE}=`))
      ?.split("=")[1];
    if (isLang(raw)) setLang(raw);
  }, []);

  // L'absence de signal doit être un signal : sans cette trace, une erreur de
  // rendu capturée ici ne laisse RIEN — ni dans la console du navigateur, ni
  // dans les journaux serveur, puisque la frontière l'a justement absorbée.
  useEffect(() => {
    console.error("[zabelie] frontière d'erreur", error.digest ?? "", error);
  }, [error]);

  const l = errLabels(lang);

  return (
    <div className="bg-grain min-h-screen">
      <main className="mx-auto max-w-md px-5 py-24 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-danger text-2xl text-ink">
          !
        </span>
        <h1 className="mt-6 text-2xl font-extrabold">{l.title}</h1>
        <p className="mt-3 text-mist">{l.body}</p>
        {/* `digest` est l'identifiant que Next.js met aussi dans les journaux
            serveur : c'est ce qui permet de relier un écran vu par un vendeur à
            la trace correspondante. Affiché discrètement, jamais le message
            brut — il peut contenir un détail d'implémentation. */}
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-mist">{error.digest}</p>
        )}
        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-ink"
          >
            {l.retry}
          </button>
          <Link
            href="/"
            className="rounded-xl border border-line px-6 py-3 text-sm font-semibold text-cloud"
          >
            {l.home}
          </Link>
        </div>
      </main>
    </div>
  );
}
