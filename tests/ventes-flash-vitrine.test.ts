import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";

import { etatStockFlash, offresFlashVitrine } from "@/lib/flash";

/**
 * VENTES FLASH EN VITRINE (demandées le 2026-10-17, sur le modèle de Jumia).
 *
 * Ce qui est gardé : tout ce qui crée l'urgence vient de la BASE — la
 * fenêtre, le prix, les unités prises — et une offre que le checkout ne
 * tiendrait plus (épuisée, expirée) ne s'affiche pas.
 */

type Op = [string, unknown[]];
type Reponse = { data?: unknown; error?: unknown; count?: number | null };

/** Client Supabase factice : enregistre la chaîne d'appels, répond par table. */
function faux(reponses: Record<string, Reponse | ((ops: Op[]) => Reponse)>) {
  const appels: { table: string; ops: Op[] }[] = [];
  const client = {
    from(table: string) {
      const ops: Op[] = [];
      appels.push({ table, ops });
      const chaine: Record<string, unknown> = new Proxy({}, {
        get(_, prop) {
          if (prop === "then") {
            const r = reponses[table] ?? { data: null, error: null };
            const v = typeof r === "function" ? r(ops) : r;
            return (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve({ error: null, ...v }).then(ok, ko);
          }
          return (...args: unknown[]) => {
            ops.push([String(prop), args]);
            return chaine;
          };
        },
      });
      return chaine;
    },
  };
  return { client: client as unknown as SupabaseClient, appels };
}

const MAINTENANT = new Date("2026-10-17T12:00:00Z");
const offre = (product_id: string, fin: string, unites_max: number | null = null, id = `o-${product_id}-${fin}`) => ({
  id, product_id, prix_flash_htg: 700, debut: "2026-10-17T10:00:00Z", fin, unites_max,
});

test("V1 — la fenêtre et l'annulation sont filtrées EN BASE, sur les seuls produits affichés", async () => {
  const { client, appels } = faux({ zabelie_flash_sales: { data: [] } });
  await offresFlashVitrine(client, null, ["p1", "p2"], MAINTENANT);
  const ops = appels[0].ops.map(([n, a]) => `${n}(${JSON.stringify(a)})`);
  assert.ok(ops.includes(`in(${JSON.stringify(["product_id", ["p1", "p2"]])})`));
  assert.ok(ops.includes(`is(${JSON.stringify(["annulee_a", null])})`));
  assert.ok(ops.includes(`lte(${JSON.stringify(["debut", MAINTENANT.toISOString()])})`));
  assert.ok(ops.includes(`gt(${JSON.stringify(["fin", MAINTENANT.toISOString()])})`));
});

test("V2 — une offre par produit : celle qui finit le plus tôt", async () => {
  const { client } = faux({
    zabelie_flash_sales: { data: [offre("p1", "2026-10-17T13:00:00Z"), offre("p1", "2026-10-17T18:00:00Z"), offre("p2", "2026-10-17T14:00:00Z")] },
  });
  const r = await offresFlashVitrine(client, null, ["p1", "p2"], MAINTENANT);
  assert.deepEqual(r.map((o) => [o.productId, o.fin]), [["p1", "2026-10-17T13:00:00Z"], ["p2", "2026-10-17T14:00:00Z"]]);
  assert.equal(r[0].prixFlashHtg, 700);
});

test("V3 — unités prises comptées comme au checkout ; une offre épuisée disparaît", async () => {
  const lecteur = faux({ zabelie_flash_sales: { data: [offre("p1", "2026-10-17T13:00:00Z", 5), offre("p2", "2026-10-17T14:00:00Z", 5)] } });
  const admin = faux({
    orders: (ops) => {
      const produit = ops.find(([n, a]) => n === "eq" && a[0] === "product_id")?.[1][1];
      return { count: produit === "p1" ? 5 : 2 };
    },
  });
  const r = await offresFlashVitrine(lecteur.client, admin.client, ["p1", "p2"], MAINTENANT);
  assert.deepEqual(r.map((o) => [o.productId, o.vendues]), [["p2", 2]], "p1 est épuisée : le checkout la facturerait au prix normal");
  /* Même règle que `flashEpuisee` : non annulées, depuis le début de l'offre. */
  const ops = admin.appels[0].ops.map(([n, a]) => `${n}:${JSON.stringify(a)}`);
  assert.ok(ops.includes(`neq:${JSON.stringify(["status", "cancelled"])}`));
  assert.ok(ops.includes(`gte:${JSON.stringify(["created_at", "2026-10-17T10:00:00Z"])}`));
});

test("V4 — un comptage en échec garde l'offre, sans barre ; une lecture en échec ne casse rien", async () => {
  const lecteur = faux({ zabelie_flash_sales: { data: [offre("p1", "2026-10-17T13:00:00Z", 5)] } });
  const admin = faux({ orders: { error: { message: "panne" } } });
  const r = await offresFlashVitrine(lecteur.client, admin.client, ["p1"], MAINTENANT);
  assert.equal(r.length, 1);
  assert.equal(r[0].vendues, null, "un chiffre inconnu ne s'affiche pas");
  assert.deepEqual(await offresFlashVitrine(faux({ zabelie_flash_sales: { error: { message: "x" } } }).client, null, ["p1"], MAINTENANT), []);
  const vide = faux({});
  assert.deepEqual(await offresFlashVitrine(vide.client, null, [], MAINTENANT), []);
  assert.equal(vide.appels.length, 0, "aucun produit : aucune requête");
});

test("V5 — la barre dit la part réellement prise, bornée", () => {
  assert.deepEqual(etatStockFlash(10, 3), { restantes: 7, part: 0.3 });
  assert.deepEqual(etatStockFlash(10, 12), { restantes: 0, part: 1 });
  assert.equal(etatStockFlash(null, 3), null, "sans plafond, pas de barre");
  assert.equal(etatStockFlash(10, null), null, "sans comptage, pas de barre");
});

test("V6 — la rangée n'existe que pour une vraie remise, et ne double pas les titres", () => {
  const src = readFileSync("components/ventes-flash.tsx", "utf8");
  assert.match(src, /return p && o\.prixFlashHtg < p\.priceHTG \? \[\{ o, p \}\] : \[\];/, "une « remise » nulle ou négative s'afficherait");
  assert.match(src, /if \(cartes\.length === 0\) return null;/, "un titre « Ventes flash » au-dessus du néant");
  const cartes = src.slice(src.indexOf("<ul className=\"flash-rangee\">"));
  assert.doesNotMatch(cartes, /<h[1-6]/, "un titre de carte doublerait celui de la rangée principale");
});

test("V7 — chaque animation est jouée une fois, et seulement si le mouvement n'est pas refusé", () => {
  const css = readFileSync("app/ventes-flash.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /infinite/, "une animation sans fin à côté du contenu (WCAG 2.2.2)");
  const i = css.indexOf("@media (prefers-reduced-motion: no-preference)");
  assert.ok(i > -1);
  const hors = css.slice(0, i);
  assert.doesNotMatch(hors, /animation:/, "une animation hors du bloc tournerait en mouvement réduit");
});
