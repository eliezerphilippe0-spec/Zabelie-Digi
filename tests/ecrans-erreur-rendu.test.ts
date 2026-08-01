import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GlobalError from "../app/error";
import { ERR } from "../lib/i18n-erreur";

/**
 * La frontière d'erreur doit RENDRE, pas seulement compiler.
 *
 * POURQUOI CE TEST EXISTE
 * -----------------------
 * Les autres gardes vérifient la parité des clés et la discipline d'import :
 * aucune n'instancie le composant. Or une frontière d'erreur qui lève une
 * exception à son tour renvoie l'utilisateur sur l'écran par défaut de
 * Next.js — exactement ce qu'elle existe pour éviter, et dans le seul cas où
 * personne ne regarde. Un `error.tsx` cassé est invisible tant qu'aucune erreur
 * ne survient, puis doublement coûteux le jour où il en survient une.
 *
 * CE QUE `renderToStaticMarkup` COUVRE, ET CE QU'IL NE COUVRE PAS
 * `useState` s'exécute, `useEffect` NON (React ne lance pas les effets au rendu
 * serveur). On vérifie donc l'état initial — celui que l'utilisateur voit en
 * premier, et le seul qui compte si le JavaScript n'arrive jamais, ce qui est
 * un cas ordinaire sur le terrain visé. La bascule de langue par cookie n'est
 * pas couverte ici : elle demande un navigateur.
 *
 * `app/not-found.tsx` n'est pas testé de cette façon : c'est un composant
 * serveur asynchrone qui appelle `cookies()` de Next.js, indisponible hors
 * requête. Sa couverture passe par le build (présence de `/_not-found`) et par
 * un parcours e2e — noté, pas fait.
 */

/**
 * React échappe les entités HTML : « Quelque chose s'est mal passé » sort en
 * `s&#x27;est`. Comparer le balisage brut aux libellés du dictionnaire échouait
 * donc sur des chaînes pourtant présentes — le premier jet de ce test l'a
 * appris à ses dépens. On décode avant de comparer, plutôt que d'assouplir
 * l'assertion en cherchant un fragment sans apostrophe : un test qui contourne
 * ce qu'il devrait vérifier est pire qu'un test absent.
 */
function texte(html: string): string {
  return html
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

/** Un faux `reset` : la frontière ne doit pas l'appeler au rendu. */
function reset() {
  throw new Error("reset() ne doit pas être appelé pendant le rendu");
}

test("app/error.tsx rend sans lever", () => {
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: new Error("panne simulée"), reset })
  );
  assert.ok(html.length > 0, "rendu vide");
});

test("l'état initial affiche le FRANÇAIS (le cookie n'est lu qu'après hydratation)", () => {
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: new Error("panne simulée"), reset })
  );
  assert.ok(
    texte(html).includes(ERR.fr.title),
    "le titre français doit être présent au premier rendu"
  );
  assert.ok(
    !texte(html).includes(ERR.ht.title),
    "le kreyòl ne doit PAS être rendu côté serveur : un écart avec le premier " +
      "rendu client produirait un avertissement d'hydratation et un texte qui " +
      "change sous les yeux sur un appareil lent"
  );
});

test("une sortie existe toujours — bouton réessayer ET lien accueil", () => {
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: new Error("panne simulée"), reset })
  );
  assert.ok(texte(html).includes(ERR.fr.retry), "bouton de nouvelle tentative absent");
  assert.ok(texte(html).includes(ERR.fr.home), "libellé du lien accueil absent");
  assert.ok(
    html.includes('href="/"'),
    "un cul-de-sac traduit reste un cul-de-sac : il faut un lien qui sorte"
  );
});

test("le digest s'affiche, le message brut JAMAIS", () => {
  const err = Object.assign(new Error("détail interne: table zabelie_x"), {
    digest: "abc123",
  });
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: err, reset })
  );
  assert.ok(html.includes("abc123"), "le digest doit être affiché");
  assert.ok(
    !texte(html).includes("détail interne"),
    "le message d'erreur brut ne doit jamais atteindre l'utilisateur"
  );
});

test("sans digest, aucune ligne vide n'est rendue à sa place", () => {
  const html = renderToStaticMarkup(
    createElement(GlobalError, { error: new Error("sans digest"), reset })
  );
  assert.ok(!html.includes("font-mono"), "bloc digest rendu alors qu'il est absent");
});
