import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumn, runTolerantOfMissingStock } from "../lib/products";

/**
 * Dérive de schéma — le catalogue doit se dégrader, pas tomber.
 *
 * Le code part en production tout seul (Vercel, à la fusion) ; les migrations
 * sont appliquées à la main. Entre les deux, le code interroge une colonne qui
 * n'existe pas encore. `/catalogue` a rendu un 500 pour cette exact raison :
 * `.eq("in_stock", true)` posé avant l'application de `0040`.
 *
 * Ces tests interdisent le retour du 500, ET interdisent l'excès inverse :
 * avaler n'importe quelle erreur de base pour « faire passer » la page.
 */

type Res = { data: string[] | null; error: { code?: string; message?: string } | null };

const UNDEFINED_COLUMN = {
  code: "42703",
  message: 'column products.in_stock does not exist',
};

test("SD1 — colonne absente : la requête est rejouée sans le filtre de stock", async () => {
  const calls: boolean[] = [];
  const res = await runTolerantOfMissingStock<string[]>((withStockFilter) => {
    calls.push(withStockFilter);
    return Promise.resolve(
      withStockFilter
        ? ({ data: null, error: UNDEFINED_COLUMN } as Res)
        : ({ data: ["produit"], error: null } as Res)
    );
  });

  assert.deepEqual(calls, [true, false], "la seconde tentative doit être sans filtre");
  assert.equal(res.error, null);
  assert.deepEqual(res.data, ["produit"], "le catalogue est servi malgré la migration en retard");
});

test("SD2 — colonne présente : aucune seconde requête", async () => {
  const calls: boolean[] = [];
  const res = await runTolerantOfMissingStock<string[]>((withStockFilter) => {
    calls.push(withStockFilter);
    return Promise.resolve({ data: ["produit"], error: null } as Res);
  });

  assert.deepEqual(calls, [true], "une seule requête quand 0040 est appliquée");
  assert.deepEqual(res.data, ["produit"]);
});

test("SD3 — toute AUTRE erreur remonte telle quelle, sans repli", async () => {
  const calls: boolean[] = [];
  const permissionDenied = { code: "42501", message: "permission denied for table products" };
  const res = await runTolerantOfMissingStock<string[]>((withStockFilter) => {
    calls.push(withStockFilter);
    return Promise.resolve({ data: null, error: permissionDenied } as Res);
  });

  assert.deepEqual(calls, [true], "une panne de droits ne doit PAS déclencher un repli");
  assert.equal(res.error, permissionDenied);
});

test("SD4 — reconnaissance de l'erreur PostgREST", () => {
  assert.equal(isMissingColumn(UNDEFINED_COLUMN), true);
  // PostgREST ne renvoie pas toujours le code SQL brut : le message suffit.
  assert.equal(
    isMissingColumn({ message: 'column products.in_stock does not exist' }),
    true
  );
  assert.equal(isMissingColumn(null), false);
  assert.equal(isMissingColumn({ code: "42501", message: "permission denied" }), false);
  // Une colonne absente qui n'est PAS in_stock, sans code : pas notre repli.
  assert.equal(isMissingColumn({ message: "column products.foo does not exist" }), false);
});
