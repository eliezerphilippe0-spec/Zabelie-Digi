import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  formeImpossible,
  guideIntrouvable,
  motsDeRecherche,
  ressourceDuChemin,
  ressourceExiste,
  viderCacheExistence,
  TTL_ABSENT_MS,
  TTL_EXISTE_MS,
} from "@/lib/existence-publique";

/**
 * UNE PAGE PUBLIQUE INEXISTANTE RÉPOND 404 (audit page par page du 2026-10-17).
 *
 * Mesuré en production le jour de l'audit : `/produit/x`, `/boutik/x` et
 * `/guides/ht/x` inexistants répondaient 200 pour un navigateur, Googlebot,
 * Bingbot, WhatsApp et facebookexternalhit. Le proxy tranche désormais avant
 * tout rendu ; ces gardes portent sur ce qu'il décide, et surtout sur ce
 * qu'il ne doit JAMAIS faire : cacher un produit qui existe parce que la base
 * a hésité.
 */

const CONFIG = { url: "https://base.test", key: "cle-anon" };
const UUID = "11111111-2222-4333-8444-555555555555";

/** Un `fetch` factice qui répond `corps` et compte ses appels. */
function faux(corps: unknown, statut = 200) {
  const appels: string[] = [];
  const f = (async (url: string | URL | Request) => {
    appels.push(String(url));
    return new Response(JSON.stringify(corps), { status: statut, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, appels };
}

beforeEach(() => viderCacheExistence());

test("E1 — seules trois formes d'adresse sont concernées", () => {
  assert.deepEqual(ressourceDuChemin("/produit/sak-pay"), { type: "produit", cle: "sak-pay" });
  assert.deepEqual(ressourceDuChemin("/boutik/atelye-lakay/"), { type: "boutik", cle: "atelye-lakay" });
  assert.deepEqual(ressourceDuChemin(`/createur/${UUID}`), { type: "createur", cle: UUID });
  for (const autre of ["/", "/produit", "/produit/a/b", "/catalogue", "/mes-achats", "/produit/%E0%A4%A"]) {
    assert.equal(ressourceDuChemin(autre), null, autre);
  }
});

test("E2 — une forme impossible est absente sans question à la base", async () => {
  assert.equal(formeImpossible({ type: "createur", cle: "pas-un-uuid" }), true);
  assert.equal(formeImpossible({ type: "boutik", cle: "Pas_Valide!" }), true);
  assert.equal(formeImpossible({ type: "produit", cle: "x".repeat(201) }), true);
  const { f, appels } = faux([]);
  assert.equal(await ressourceExiste({ type: "createur", cle: "abc" }, CONFIG, f), false);
  assert.equal(appels.length, 0, "une forme impossible ne doit pas devenir une requête");
});

test("E3 — produit : publié → existe, rien → absent, et la requête filtre sur « publié »", async () => {
  const oui = faux([{ id: "p1" }]);
  assert.equal(await ressourceExiste({ type: "produit", cle: "sak-pay" }, CONFIG, oui.f), true);
  assert.match(oui.appels[0], /\/rest\/v1\/products\?select=id&status=eq\.published&slug=eq\.sak-pay&limit=1$/);
  viderCacheExistence();
  const non = faux([]);
  assert.equal(await ressourceExiste({ type: "produit", cle: "sak-pay" }, CONFIG, non.f), false);
});

test("E4 — boutique et créateur passent par la fiche publique", async () => {
  const fiche = faux({ id: UUID, display_name: "Atelye" });
  assert.equal(await ressourceExiste({ type: "boutik", cle: "atelye-lakay" }, CONFIG, fiche.f), true);
  assert.match(fiche.appels[0], /\/rest\/v1\/rpc\/zabelie_boutik_public$/);
  const vide = faux(null);
  assert.equal(await ressourceExiste({ type: "createur", cle: UUID }, CONFIG, vide.f), false);
});

test("E5 — dans le doute, on ne sait pas : jamais un faux « absent »", async () => {
  /* ⚠️ LE GARDE QUI COMPTE. Une base lente ou en panne ne doit pas faire
   * répondre 404 à un produit qui existe : le proxy ne réécrit que sur un
   * `false` explicite. */
  assert.equal(await ressourceExiste({ type: "produit", cle: "a" }, null, faux([]).f), null, "sans base");
  assert.equal(await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, faux({ message: "x" }, 503).f), null, "erreur HTTP");
  const panne = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  assert.equal(await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, panne), null, "réseau coupé");
  /* Et une réponse inconnue n'est pas mise en cache : la prochaine visite redemande. */
  const ok = faux([{ id: "p1" }]);
  assert.equal(await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, ok.f), true);
});

test("E6 — le cache évite la requête, et un « absent » expire plus vite qu'un « existe »", async () => {
  const t0 = 1_000_000;
  const oui = faux([{ id: "p1" }]);
  await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, oui.f, t0);
  await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, oui.f, t0 + TTL_EXISTE_MS - 1);
  assert.equal(oui.appels.length, 1, "le second appel aurait dû venir du cache");
  await ressourceExiste({ type: "produit", cle: "a" }, CONFIG, oui.f, t0 + TTL_EXISTE_MS + 1);
  assert.equal(oui.appels.length, 2, "une entrée périmée doit être redemandée");

  const non = faux([]);
  await ressourceExiste({ type: "produit", cle: "b" }, CONFIG, non.f, t0);
  await ressourceExiste({ type: "produit", cle: "b" }, CONFIG, non.f, t0 + TTL_ABSENT_MS + 1);
  assert.equal(non.appels.length, 2, "un produit qu'on vient de publier ne doit pas rester caché longtemps");
  assert.ok(TTL_ABSENT_MS < TTL_EXISTE_MS);
});

test("E7 — guides : liste fixe du dépôt, aucune requête", () => {
  assert.equal(guideIntrouvable("/guides/fr"), false);
  assert.equal(guideIntrouvable("/guides/ht/acheter-en-haiti"), false);
  assert.equal(guideIntrouvable("/guides/ht/inexistant"), true);
  assert.equal(guideIntrouvable("/guides/de"), true);
  assert.equal(guideIntrouvable("/guides/de/acheter-en-haiti"), true);
  assert.equal(guideIntrouvable("/catalogue"), false);
});

test("E8 — les mots d'une adresse relancent une recherche lisible", () => {
  assert.equal(motsDeRecherche("sak-pay_ble"), "sak pay ble");
  assert.equal(motsDeRecherche("filtre--huile<script>"), "filtre huilescript");
  assert.equal(motsDeRecherche(undefined), "");
  assert.ok(motsDeRecherche("a-".repeat(100)).length <= 60);
});

test("E9 — le proxy ne réécrit qu'au chargement complet, et seulement sur un « false »", () => {
  const src = readFileSync("proxy.ts", "utf8");
  /* Next retire `RSC` et `Next-Router-Prefetch` avant le proxy (mesuré : une
   * requête RSC y arrivait sans eux et partait en réécriture). */
  assert.match(
    src,
    /const chargementComplet = \(request\.method === "GET" \|\| request\.method === "HEAD"\)\s*&& \(destination === null \|\| destination === "document"\);/,
    "une navigation dans l'application attendrait la base"
  );
  assert.match(src, /const destination = request\.headers\.get\("sec-fetch-dest"\);/);
  assert.match(src, /\(await ressourceExiste\(ressource, config\)\) === false/, "le proxy réécrit sur un doute");
  assert.match(
    src,
    /NextResponse\.rewrite\(new URL\(absent, request\.url\), \{ status: 404,/,
    "la page introuvable n'est plus servie en 404"
  );
});

test("E10 — la page indisponible reste hors index et ne lit jamais un brouillon", () => {
  const src = readFileSync("app/indisponible/page.tsx", "utf8");
  assert.match(src, /robots: \{ index: false, follow: false \}/);
  assert.match(src, /\.neq\("status", "draft"\)/, "l'adresse d'un brouillon révélerait son vendeur");
});
