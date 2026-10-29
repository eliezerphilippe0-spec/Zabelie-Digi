import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { demandeParZone } from "../lib/zone-demande";
import type { ZoneRemiseNoeud } from "../lib/zone-remise";
import { loadRoute } from "./helpers/route-harness";

/*   OU ─ Delmas ─ D33          ND ─ Cap
 *      └ Tabarre                                                       */
const Z: ZoneRemiseNoeud[] = [
  { id: "ou", parent_id: null, level: "depatman" },
  { id: "delmas", parent_id: "ou", level: "komin" },
  { id: "d33", parent_id: "delmas", level: "katye" },
  { id: "tabarre", parent_id: "ou", level: "komin" },
  { id: "nd", parent_id: null, level: "depatman" },
  { id: "cap", parent_id: "nd", level: "komin" },
];

test("demandeParZone : les clics de plusieurs jours s'additionnent, par zone", () => {
  const r = demandeParZone(Z, [
    { zone_id: "cap", hits: 3 }, { zone_id: "cap", hits: 2 }, { zone_id: "delmas", hits: 1 },
  ], []);
  assert.deepEqual(r, [
    { zoneId: "cap", hits: 5, vendeurs: 0 },
    { zoneId: "delmas", hits: 1, vendeurs: 0 },
  ]);
});

test("demandeParZone : un vendeur compte une fois, par couverture (zone, ancêtre, descendant) — pas pour un frère", () => {
  const services = [
    { seller_id: "s1", zone_id: "ou" },        // tout l'Ouest : couvre Delmas
    { seller_id: "s2", zone_id: "d33" },       // un quartier de Delmas : recouvre Delmas
    { seller_id: "s2", zone_id: "tabarre" },   // même vendeur, deux zones : compté UNE fois
    { seller_id: "s3", zone_id: "tabarre" },   // commune sœur : ne recouvre pas Delmas
    { seller_id: "s4", zone_id: "nd" },        // autre département
  ];
  const [delmas] = demandeParZone(Z, [{ zone_id: "delmas", hits: 4 }], services);
  assert.equal(delmas.vendeurs, 2, "s1 (ancêtre) et s2 (descendant) ; ni s3 ni s4");
  const [cap] = demandeParZone(Z, [{ zone_id: "cap", hits: 1 }], services);
  assert.equal(cap.vendeurs, 1, "s4 déclare tout le Nord");
});

test("demandeParZone : tri — le plus de demande d'abord, à égalité la zone la moins desservie", () => {
  const r = demandeParZone(Z,
    [{ zone_id: "delmas", hits: 2 }, { zone_id: "cap", hits: 2 }, { zone_id: "tabarre", hits: 9 }],
    [{ seller_id: "s1", zone_id: "delmas" }]);
  assert.deepEqual(r.map((l) => l.zoneId), ["tabarre", "cap", "delmas"]);
});

test("demandeParZone : des compteurs nuls, négatifs ou illisibles ne créent pas de ligne", () => {
  assert.deepEqual(demandeParZone(Z, [{ zone_id: "cap", hits: 0 }, { zone_id: "cap", hits: -3 }, { zone_id: "cap", hits: Number.NaN }], []), []);
  assert.deepEqual(demandeParZone(Z, [], [{ seller_id: "s1", zone_id: "ou" }]), []);
});

/* ── La route ───────────────────────────────────────────────────────────────── */

const ZONE = "5B1D6C0E-3A54-4F6E-9D2A-0C7E3A9B8F10";
function route(options: { limite?: boolean; rpc?: { data: unknown; error: { code: string } | null }; configure?: boolean } = {}) {
  const appels: { rpc: [string, Record<string, unknown>][]; limites: string[] } = { rpc: [], limites: [] };
  const mod = loadRoute("app/api/zone/demande/route.ts", {
    "node:crypto": { createHash },
    "@/lib/api-erreur": { erreurTraduite: async (cle: string, status: number, extra?: object) => Response.json({ error: cle, ...extra }, { status }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (nom: string, args: Record<string, unknown>) => { appels.rpc.push([nom, args]); return options.rpc ?? { data: true, error: null }; } }) },
    "@/lib/products": { isSupabaseConfigured: () => options.configure !== false },
    "@/lib/zabelie-rate-limit": {
      clientIp: (req: Request) => req.headers.get("x-forwarded-for") ?? "unknown",
      rateLimit: async (_a: unknown, cle: string) => { appels.limites.push(cle); return options.limite !== false; },
    },
    "@/lib/zone-remise": { parseZoneRemise: (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v.toLowerCase() : null) },
  }, {}, { console: { warn: () => {}, error: () => {} } });
  const poste = (corps: unknown, entetes: Record<string, string> = {}) =>
    mod.POST(new Request("https://zabelie.test/api/zone/demande", {
      method: "POST", headers: { host: "zabelie.test", "x-forwarded-for": "203.0.113.9", ...entetes },
      body: typeof corps === "string" ? corps : JSON.stringify(corps),
    }));
  return { poste, appels };
}

test("la demande enregistre UNIQUEMENT l'identifiant de zone : aucun autre champ n'atteint la base", async () => {
  const r = route();
  const res = await r.poste({ zoneId: ZONE, nom: "Marie", telephone: "34123456", q: "batterie" });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  assert.equal(r.appels.rpc.length, 1);
  const [nom, args] = r.appels.rpc[0];
  assert.equal(nom, "zabelie_record_zone_demand");
  assert.deepEqual(JSON.parse(JSON.stringify(args)), { p_zone: ZONE.toLowerCase() }, "ni compte, ni IP, ni texte libre");
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("la demande refuse une autre origine, un corps illisible et un identifiant mal formé — sans toucher la base", async () => {
  for (const [corps, entetes, statut] of [
    [{ zoneId: ZONE }, { origin: "https://autre.example" }, 403],
    ["pas du json", {}, 400],
    [{ zoneId: "Delmas" }, {}, 422],
    [{ zoneId: 12 }, {}, 422],
    [{}, {}, 422],
  ] as const) {
    const r = route();
    const res = await r.poste(corps, entetes);
    assert.equal(res.status, statut, JSON.stringify(corps));
    assert.equal(r.appels.rpc.length, 0, "aucune écriture");
    assert.equal(r.appels.limites.length, 0, "refusée avant même le débit");
  }
});

test("le débit borné ferme l'accès AVANT toute écriture : par IP hachée à la minute et au jour, puis en global", async () => {
  const ok = route();
  await ok.poste({ zoneId: ZONE });
  assert.equal(ok.appels.limites.length, 3);
  assert.match(ok.appels.limites[0], /^zone_demande:[0-9a-f]{64}$/);
  assert.match(ok.appels.limites[1], /^zone_demande_jour:[0-9a-f]{64}$/);
  assert.equal(ok.appels.limites[2], "zone_demande_global");
  assert.ok(!ok.appels.limites.join("|").includes("203.0.113.9"), "l'IP brute n'est jamais une clé");

  const bloque = route({ limite: false });
  const res = await bloque.poste({ zoneId: ZONE });
  assert.equal(res.status, 429);
  assert.equal(bloque.appels.rpc.length, 0, "refusé par le débit : rien n'est incrémenté");
});

test("la panne ou la zone refusée par la base ne se déguisent jamais en succès", async () => {
  const panne = route({ rpc: { data: null, error: { code: "42883" } } });
  assert.equal((await panne.poste({ zoneId: ZONE })).status, 503, "fonction absente (code avant schéma)");
  const fermee = route({ rpc: { data: false, error: null } });
  const res = await fermee.poste({ zoneId: ZONE });
  assert.equal(res.status, 422, "zone inconnue ou fermée refusée par la fonction");
  assert.equal((await res.json()).code, "zone_inconnue");
  const demo = route({ configure: false });
  assert.equal((await demo.poste({ zoneId: ZONE })).status, 503, "mode démo : rien n'est enregistré");
});

/* ── Les structures qui COMMANDENT ───────────────────────────────────────────── */

const lire = (f: string) => readFileSync(f, "utf8");

test("le catalogue n'affiche « zone sans vendeur » que lorsque la zone est le SEUL filtre actif", () => {
  const src = lire("app/catalogue/page.tsx");
  // La condition, avec ses six termes : zone, ni recherche, ni univers, ni rayon, ni sous-rayon, ni prix.
  assert.match(src, /const zoneSeule = Boolean\(zoneActive\) && !q && !universe && activeCat === "Tout" && !sous && minPrice === undefined && maxPrice === undefined;/);
  // La branche est consommée AVANT le message générique « aucun résultat » du filtre prix/zone.
  assert.match(src, /\) : zoneSeule && zoneActive \? \([\s\S]{0,900}<ZoneSansVendeur[\s\S]{0,1500}\) : minPrice !== undefined \|\| maxPrice !== undefined \|\| !!zoneId \? \(/);
});

test("le composant ne parle qu'à /api/zone/demande, avec le seul identifiant de zone, et sans t()", () => {
  const src = lire("components/zone-sans-vendeur.tsx");
  assert.match(src, /fetch\("\/api\/zone\/demande", \{[\s\S]{0,160}body: JSON\.stringify\(\{ zoneId \}\)/);
  assert.doesNotMatch(src, /from "@\/lib\/i18n(-server)?"/);
  assert.doesNotMatch(src, /\bt\(/);
  assert.match(src, /^"use client";/);
  // Le garde « un clic par zone et appareil » est une commodité : il ne remplace pas le débit serveur.
  assert.match(src, /if \(busy \|\| dejaDit\) return;/);
});

test("l'administration lit la demande sous service-role, sur 30 jours, avec repli si la table manque", () => {
  const src = lire("app/admin/zones/page.tsx");
  assert.match(src, /admin\.from\("zabelie_zone_demand"\)\.select\("zone_id, hits"\)\.gte\("day", depuis\)/);
  assert.match(src, /const depuis = new Date\(Date\.now\(\) - 30 \* 86_400_000\)/);
  assert.match(src, /demErr \? \[\] : /, "table absente → liste vide, la page tient");
});
