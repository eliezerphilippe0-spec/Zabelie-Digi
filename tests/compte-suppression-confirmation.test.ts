import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { loadRoute } from "./helpers/route-harness";
import { LANGS, t, type Lang } from "../lib/i18n";

/**
 * M5 (audit du 2026-10-27) — LA SUPPRESSION DE COMPTE SE CONFIRME DANS LA PAGE.
 *
 * Avant : `window.confirm(...)` en français en dur pour une action
 * IRRÉVERSIBLE, deux libellés en dur, et `text-danger` comme couleur de texte
 * — interdit par `app/zabelie-theme.css` (les tokens de base sont des fonds,
 * le texte prend `*-text`). Boutons mesurés à 42 px.
 *
 * Ce qui est gardé : (1) le premier clic n'envoie RIEN, il ouvre l'encadré ;
 * (2) l'encadré dit les conséquences dans la langue du vendeur, prend le
 * focus, se ferme par Annuler ou Échap ; (3) l'appel DELETE n'est lié qu'au
 * bouton de confirmation ; (4) jetons de thème et cibles de 44 px.
 *
 * Le rendu est statique (pas de DOM dans la suite) : l'étape 2 est obtenue en
 * forçant l'état initial du PREMIER `useState` du composant (`confirmation`).
 * Si l'ordre des hooks change, C2 échoue bruyamment — il ne passe pas à vide.
 */

const labels = (lang: Lang) => ({
  exportData: t(lang, "vendeur.compte.exporter"),
  delete: t(lang, "vendeur.compte.supprimer"),
  confirmTitle: t(lang, "vendeur.compte.supprimer.titre"),
  confirmBody: t(lang, "vendeur.compte.supprimer.texte"),
  confirm: t(lang, "vendeur.compte.supprimer.confirmer"),
  cancel: t(lang, "vendeur.compte.supprimer.annuler"),
  deleting: t(lang, "vendeur.compte.supprimer.encours"),
  failed: t(lang, "vendeur.compte.supprimer.echec"),
  network: t(lang, "error.network"),
});

function rendre(lang: Lang, etape2: boolean): string {
  let premier = true;
  const reactForce = {
    ...React,
    useState: <S,>(init: S | (() => S)) => {
      const forcer = etape2 && premier;
      premier = false;
      return React.useState(forcer ? (true as unknown as S) : init);
    },
  };
  const mod = loadRoute("components/account-actions.tsx", {
    react: reactForce,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/lib/appel-session": { appelAvecSession: async () => { throw new Error("aucun appel au rendu"); } },
  });
  const Comp = mod.AccountActions as unknown as React.FC<Record<string, unknown>>;
  return renderToStaticMarkup(React.createElement(Comp, { actorId: "a", labels: labels(lang) }));
}

const brut = readFileSync("components/account-actions.tsx", "utf8");
const SRC = brut.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ");

for (const lang of LANGS) {
  test(`C1 — étape 1 : export et suppression traduits, aucun encadré, aucun bouton de confirmation (${lang})`, () => {
    const html = rendre(lang, false);
    assert.ok(html.includes(`>${t(lang, "vendeur.compte.exporter")}</a>`), html);
    assert.ok(html.includes(`>${t(lang, "vendeur.compte.supprimer")}</button>`), html);
    assert.ok(!html.includes('role="region"'), "l'encadré ne doit pas être ouvert au premier rendu");
    assert.ok(!html.includes(t(lang, "vendeur.compte.supprimer.confirmer")), "bouton de confirmation visible avant le premier clic");
    // Une seule action possible : ouvrir l'encadré.
    assert.equal((html.match(/<button/g) ?? []).length, 1);
  });

  test(`C2 — étape 2 : l'encadré dit les conséquences, prend le focus, offre confirmer ou annuler (${lang})`, () => {
    const html = rendre(lang, true);
    const region = /<div id="suppression-compte" role="region" tabindex="-1" aria-labelledby="suppression-compte-titre" aria-describedby="suppression-compte-texte"[^>]*>/.exec(html);
    assert.ok(region, `encadré absent ou mal nommé — l'ordre des hooks a-t-il changé ?\n${html}`);
    assert.ok(html.includes(`<p id="suppression-compte-titre" class="text-sm font-bold text-danger-text">${t(lang, "vendeur.compte.supprimer.titre")}</p>`));
    // Les conséquences du `confirm` d'origine, traduites — irréversibilité comprise.
    const texte = t(lang, "vendeur.compte.supprimer.texte").replace(/'/g, "&#x27;");
    assert.ok(html.includes(`<p id="suppression-compte-texte" class="mt-1 text-sm text-cloud">${texte}</p>`), html);
    const boutons = [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(boutons.map(([, l]) => l), [
      t(lang, "vendeur.compte.supprimer.confirmer").replace(/'/g, "&#x27;"),
      t(lang, "vendeur.compte.supprimer.annuler"),
    ]);
    for (const [classes] of boutons) assert.match(classes, /\bmin-h-11\b/);
    // Le bouton d'ouverture a cédé la place : pas deux chemins vers la suppression.
    assert.ok(!html.includes(`>${t(lang, "vendeur.compte.supprimer")}</button>`));
  });
}

test("C3 — l'appel DELETE n'est lié qu'au bouton de confirmation, dans l'encadré", () => {
  assert.doesNotMatch(SRC, /window\.confirm|confirm\(/, "boîte de confirmation du navigateur");
  // Le premier bouton ne fait qu'ouvrir l'encadré.
  assert.match(SRC, /onClick=\{\(\) => setConfirmation\(true\)\}/);
  // L'appel vit dans `supprimer`, et `supprimer` n'est branché qu'une fois, sous `{confirmation && (`.
  assert.match(SRC, /async function supprimer\(\) \{\s*if \(busy\) return;\s*setBusy\(true\);\s*setMsg\(null\);\s*const issue = await appelAvecSession\("\/api\/account", \{\s*method: "DELETE",/);
  assert.equal((SRC.match(/onClick=\{supprimer\}/g) ?? []).length, 1);
  assert.match(SRC, /\{confirmation && \(\s*<div[\s\S]*?onClick=\{supprimer\}/);
  // La route et ce qu'elle reçoit ne changent pas.
  assert.match(SRC, /body: JSON\.stringify\(\{ expectedActorId: actorId \}\),/);
});

test("C4 — focus, Échap et retour : l'encadré est utilisable au clavier", () => {
  assert.match(SRC, /const focaliserEncadre = useCallback\(\(el: HTMLDivElement \| null\) => \{\s*el\?\.focus\(\);\s*\}, \[\]\);/);
  assert.match(SRC, /ref=\{focaliserEncadre\}\s*id="suppression-compte"\s*role="region"\s*tabIndex=\{-1\}/);
  assert.match(SRC, /onKeyDown=\{\(e\) => \{\s*if \(e\.key === "Escape"\) annuler\(\);/);
  assert.match(SRC, /function annuler\(\) \{\s*if \(busy\) return;\s*setMsg\(null\);\s*retourAuBouton\.current = true;\s*setConfirmation\(false\);/);
  assert.match(SRC, /if \(el && retourAuBouton\.current\) \{\s*retourAuBouton\.current = false;\s*el\.focus\(\);/);
  assert.match(SRC, /ref=\{focaliserBouton\}/);
});

test("C5 — l'échec est annoncé et traduit ; réseau et refus ne se confondent pas", () => {
  assert.match(SRC, /setMsg\(issue\.etat === "reseau" \? labels\.network : \(issue\.error \?\? labels\.failed\)\);/);
  assert.match(SRC, /\{msg && \(\s*<p role="alert"[^>]*>\s*\{msg\}/);
  assert.doesNotMatch(SRC, /"Échec de la suppression|"Suppression…"|"Supprimer mon compte"|>\s*Exporter mes données\s*</);
});

test("C6 — jetons de thème : jamais `text-danger` comme couleur de texte", () => {
  assert.doesNotMatch(SRC, /\btext-danger(?!-text)\b/, "le token de base `danger` est un fond (3:1), le texte prend `text-danger-text`");
  assert.match(SRC, /href="\/api\/account\/export"\s*className="[^"]*\bmin-h-11\b/);
});

test("C7 — la page passe les neuf libellés par t()", () => {
  const page = readFileSync("app/tableau-de-bord/compte/page.tsx", "utf8");
  for (const [prop, cle] of [
    ["exportData", "vendeur.compte.exporter"], ["delete", "vendeur.compte.supprimer"],
    ["confirmTitle", "vendeur.compte.supprimer.titre"], ["confirmBody", "vendeur.compte.supprimer.texte"],
    ["confirm", "vendeur.compte.supprimer.confirmer"], ["cancel", "vendeur.compte.supprimer.annuler"],
    ["deleting", "vendeur.compte.supprimer.encours"], ["failed", "vendeur.compte.supprimer.echec"],
    ["network", "error.network"],
  ]) {
    assert.match(page, new RegExp(`${prop}: t\\(lang, "${cle.replace(/\./g, "\\.")}"\\)`), prop);
  }
});

test("C8 — après un échec, le focus reste dans l'encadré : boutons `aria-disabled`, jamais `disabled` (m4)", () => {
  // Un bouton `disabled` pendant l'appel perdait le focus (tombé sur `body`) :
  // après un refus, Échap — écouté par l'encadré — ne fermait plus rien.
  assert.doesNotMatch(SRC, /(?<![-\w])disabled=\{busy\}/, "bouton `disabled` pendant l'appel");
  assert.match(SRC, /onClick=\{supprimer\}\s*aria-disabled=\{busy\}/);
  assert.match(SRC, /onClick=\{annuler\}\s*aria-disabled=\{busy\}/);
  // La garde du second envoi est dans le handler, puisque le bouton reste actif.
  assert.match(SRC, /async function supprimer\(\) \{\s*if \(busy\) return;/);
  assert.match(SRC, /function annuler\(\) \{\s*if \(busy\) return;/);
  // Rendu : l'état d'attente ne retire pas les boutons du parcours clavier.
  const html = rendre("fr", true);
  assert.doesNotMatch(html, /<button[^>]* disabled=""/, "un bouton de l'encadré est rendu `disabled`");
  assert.match(html, /<button[^>]*aria-disabled="false"[^>]*>[^<]*<\/button>/);
});
