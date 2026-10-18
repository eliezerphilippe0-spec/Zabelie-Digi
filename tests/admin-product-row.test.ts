import { test } from "node:test";
import assert from "node:assert/strict";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

import { loadRoute } from "./helpers/route-harness";

/**
 * MODÉRATION : CHAQUE SÉLECTEUR DE STATUT A UN NOM.
 *
 * Constaté le 2026-10-18 en publiant une fiche depuis /admin : la liste
 * déroulante draft / published / archived n'avait AUCUN nom accessible. Un
 * lecteur d'écran annonçait « liste déroulante, draft » pour chaque fiche,
 * sans dire laquelle, et le test de bout en bout devait la chercher par sa
 * position dans la ligne.
 *
 * Le composant appelle `useRouter` de Next.js, absent hors de l'application :
 * il est chargé par le harnais avec ce seul appel simulé, puis rendu en HTML.
 */

function rendre(titre: string): string {
  const mod = loadRoute("components/admin-product-row.tsx", {
    react: React,
    "react/jsx-runtime": jsxRuntime,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
  });
  const Ligne = mod.AdminProductRow as unknown as React.FC<{ id: string; title: string; seller: string; status: string }>;
  return renderToStaticMarkup(React.createElement(Ligne, { id: "p1", title: titre, seller: "Vandè", status: "draft" }));
}

test("le sélecteur de statut porte le titre de la fiche", () => {
  const html = rendre("Retouche photo express");
  const select = html.match(/<select[^>]*>/)?.[0] ?? "";
  assert.ok(select, "un sélecteur est rendu");
  assert.match(select, /aria-label="Statut de « Retouche photo express »"/);
});

test("deux fiches, deux noms distincts : on sait laquelle on publie", () => {
  const nom = (titre: string) => rendre(titre).match(/<select[^>]*aria-label="([^"]*)"/)?.[1];
  assert.notEqual(nom("Guide A"), nom("Guide B"));
  // Le titre est échappé comme du texte, jamais interprété.
  assert.match(rendre(`Gid "lakay" <b>`), /aria-label="Statut de « Gid &quot;lakay&quot; &lt;b&gt; »"/);
});
