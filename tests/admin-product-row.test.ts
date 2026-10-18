import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { loadRoute } from "./helpers/route-harness";
import { t, type Lang } from "../lib/i18n";

/**
 * MODÉRATION : LE SÉLECTEUR DE STATUT DE CHAQUE FICHE.
 *
 * Constaté le 2026-10-18 en publiant une fiche depuis /admin, trois défauts :
 *   - AUCUN nom accessible : un lecteur d'écran annonçait « liste déroulante,
 *     draft » pour chaque fiche, sans dire laquelle ;
 *   - des choix en anglais brut (draft, published, archived) ;
 *   - une cible d'environ 28 px, sous les 44 px d'un doigt sur téléphone.
 *
 * Le composant appelle `useRouter` de Next.js, absent hors de l'application :
 * il est chargé par le harnais avec ce seul appel simulé, puis rendu en HTML.
 */

const libelles = (lang: Lang) => ({
  statuts: { draft: t(lang, "status.draft"), published: t(lang, "status.published"), archived: t(lang, "status.archived") },
  nom: t(lang, "admin.status.aria"),
});

function rendre(titre: string, lang: Lang = "fr"): string {
  const mod = loadRoute("components/admin-product-row.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
  });
  const Ligne = mod.AdminProductRow as unknown as React.FC<Record<string, unknown>>;
  return renderToStaticMarkup(React.createElement(Ligne, { id: "p1", title: titre, seller: "Vandè", status: "draft", labels: libelles(lang) }));
}

const nom = (html: string) => html.match(/<select[^>]*aria-label="([^"]*)"/)?.[1];
const options = (html: string) => [...html.matchAll(/<option value="([a-z]+)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2]]);

test("le sélecteur porte le titre de la fiche, dans la langue de l'écran", () => {
  assert.equal(nom(rendre("Retouche photo express")), "Statut de « Retouche photo express »");
  assert.equal(nom(rendre("Retouche photo express", "ht")), "Estati « Retouche photo express »");
  assert.notEqual(nom(rendre("Guide A")), nom(rendre("Guide B")), "deux fiches, deux noms : on sait laquelle on publie");
  // Le titre reste du texte, jamais interprété.
  assert.match(rendre(`Gid "lakay" <b>`), /aria-label="Statut de « Gid &quot;lakay&quot; &lt;b&gt; »"/);
});

test("les choix sont traduits ; la valeur envoyée au serveur ne change pas", () => {
  assert.deepEqual(options(rendre("X")), [["draft", "Brouillon"], ["published", "Publié"], ["archived", "Archivé"]]);
  assert.deepEqual(options(rendre("X", "ht")), [["draft", "Poko pibliye"], ["published", "Pibliye"], ["archived", "Achive"]]);
  for (const lang of ["en", "es"] as Lang[]) {
    for (const [, texte] of options(rendre("X", lang))) assert.ok(texte && !["draft", "published", "archived"].includes(texte), `${lang} : ${texte}`);
  }
});

test("cible tactile de 44 px", () => {
  const select = rendre("X").match(/<select[^>]*>/)?.[0] ?? "";
  assert.match(select, /\bmin-h-11\b/);
  assert.doesNotMatch(select, /\bpy-1\.5\b|\btext-xs\b/);
});

test("les deux libellés neufs existent dans les quatre langues", () => {
  const src = readFileSync("lib/i18n.ts", "utf8");
  for (const cle of ["status.archived", "admin.status.aria"]) {
    assert.equal(src.split(`"${cle}":`).length - 1, 4, cle);
  }
  for (const lang of ["fr", "ht", "en", "es"] as Lang[]) assert.match(t(lang, "admin.status.aria"), /\{titre\}/, lang);
});
