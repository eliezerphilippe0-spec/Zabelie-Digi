import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lienTelephone, lirePointsRetrait, pointsPourZone, type PointRetrait } from "../lib/points-retrait";
import type { ZoneRemiseNoeud } from "../lib/zone-remise";
import { DICT, LANGS } from "../lib/i18n";
import { database, loadRoute } from "./helpers/route-harness";

const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

/*   OU ─ Delmas ─ D33          ND ─ Cap
 *      │         └ D31
 *      └ Tabarre                                                       */
const Z: ZoneRemiseNoeud[] = [
  { id: "ou", parent_id: null, level: "depatman" },
  { id: "delmas", parent_id: "ou", level: "komin" },
  { id: "d33", parent_id: "delmas", level: "katye" },
  { id: "d31", parent_id: "delmas", level: "katye" },
  { id: "tabarre", parent_id: "ou", level: "komin" },
  { id: "nd", parent_id: null, level: "depatman" },
  { id: "cap", parent_id: "nd", level: "komin" },
];
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const pt = (id: string, zoneId: string, position = 0, nom = id): PointRetrait => ({ id, nom, adresse: "Rue 1", telefon: null, zoneId, position });

// ───────────── lirePointsRetrait ─────────────

test("lirePointsRetrait : une ligne valide, espaces retirés, téléphone vide → null", () => {
  const r = lirePointsRetrait([{ id: U(1), nom: "  Pharmacie Delmas ", adresse: " Route de Delmas 33 ", telefon: "  ", zone_id: U(2).toUpperCase(), position: 3 }]);
  assert.deepEqual(json(r), [{ id: U(1), nom: "Pharmacie Delmas", adresse: "Route de Delmas 33", telefon: null, zoneId: U(2), position: 3 }]);
});

test("lirePointsRetrait : une ligne mal formée ou sans zone est ignorée, les autres restent", () => {
  const bonne = { id: U(1), nom: "Boutik", adresse: "Rue 5, Delmas", telefon: "+509 3712 3456", zone_id: U(2), position: 0 };
  const r = lirePointsRetrait([
    null, "x", 3, {},
    { ...bonne, id: "pas-un-uuid" },
    { ...bonne, zone_id: null },          // un point sans zone n'est rapprochable d'aucune destination
    { ...bonne, zone_id: "zone" },
    { ...bonne, nom: "  " },
    { ...bonne, adresse: 5 },
    bonne,
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].id, U(1));
  assert.equal(r[0].telefon, "+509 3712 3456");
});

test("lirePointsRetrait : ce qui n'est pas un tableau rend []", () => {
  for (const v of [null, undefined, {}, "x", 4]) assert.deepEqual(lirePointsRetrait(v), []);
});

// ───────────── pointsPourZone ─────────────

test("pointsPourZone : la zone elle-même, un ancêtre et un descendant recouvrent — un frère non", () => {
  const points = [pt("a", "d33"), pt("b", "delmas"), pt("c", "ou"), pt("d", "d31"), pt("e", "tabarre"), pt("f", "cap")];
  // Acheteur à Delmas 33 : son quartier, sa commune, son département ; ni Delmas 31 (frère), ni Tabarre, ni le Nord.
  assert.deepEqual(pointsPourZone(Z, points, "d33").map((p) => p.id).sort(), ["a", "b", "c"]);
  // Acheteur à Delmas (commune) : un point dans un de ses quartiers est dans sa commune.
  assert.deepEqual(pointsPourZone(Z, points, "delmas").map((p) => p.id).sort(), ["a", "b", "c", "d"]);
  assert.deepEqual(pointsPourZone(Z, points, "cap").map((p) => p.id), ["f"]);
});

test("pointsPourZone : sans destination, rien — jamais « tous les points »", () => {
  assert.deepEqual(pointsPourZone(Z, [pt("a", "d33")], null), []);
  assert.deepEqual(pointsPourZone(Z, [pt("a", "d33")], ""), []);
});

test("pointsPourZone : une zone inconnue ne recouvre que le point de cette même zone", () => {
  assert.deepEqual(pointsPourZone(Z, [pt("a", "d33"), pt("b", "zone-fantome")], "zone-fantome").map((p) => p.id), ["b"]);
});

test("pointsPourZone : la zone exacte d'abord, puis la position de l'admin, puis le nom — et c'est stable", () => {
  // La position et le nom se CONTREDISENT exprès : « Mmm » (position 5) passe avant « Zzz » (position 1) si la position est ignorée.
  const points = [pt("loin", "ou", 0, "Aaa"), pt("proche-tard", "d33", 5, "Mmm"), pt("proche-tot", "d33", 1, "Zzz"), pt("commune", "delmas", 0, "Bbb")];
  const ordre = pointsPourZone(Z, points, "d33").map((p) => p.id);
  assert.deepEqual(ordre, ["proche-tot", "proche-tard", "loin", "commune"]);
  assert.deepEqual(pointsPourZone(Z, [...points].reverse(), "d33").map((p) => p.id), ordre, "l'ordre d'entrée ne change rien");
});

test("pointsPourZone : à position égale le nom se trie selon la langue (accents inclus)", () => {
  const points = [pt("z", "d33", 0, "Zèbre"), pt("e", "d33", 0, "Étang"), pt("a", "d33", 0, "Ancien")];
  assert.deepEqual(pointsPourZone(Z, points, "d33", "fr").map((p) => p.nom), ["Ancien", "Étang", "Zèbre"]);
});

test("pointsPourZone : ne modifie pas la liste reçue", () => {
  const points = [pt("b", "d33", 2), pt("a", "d33", 1)];
  pointsPourZone(Z, points, "d33");
  assert.deepEqual(points.map((p) => p.id), ["b", "a"]);
});

// ───────────── lienTelephone ─────────────

test("lienTelephone : chiffres et « + » initial seulement ; sans chiffre, pas de lien", () => {
  assert.equal(lienTelephone("+509 3712-3456"), "tel:+50937123456");
  assert.equal(lienTelephone("(509) 3712 3456"), "tel:50937123456");
  assert.equal(lienTelephone("3712 3456 ext. 2"), "tel:371234562");
  assert.equal(lienTelephone("appelez-nous"), null);
  assert.equal(lienTelephone(""), null);
  assert.equal(lienTelephone("javascript:alert(1)"), "tel:1", "aucun caractère de schéma ne survit");
});

// ───────────── le lecteur serveur ─────────────

function chargeur(resolve: (q: { table: string; steps: [string, unknown[]][] }) => unknown, { lance = false } = {}) {
  const db = database(resolve);
  const avertissements: string[] = [];
  const mod = loadRoute("lib/points-retrait-serveur.ts", {
    "@/lib/supabase/server": { createClient: async () => { if (lance) throw new Error("panne"); return db; } },
    "@/lib/product-media": { isMissingTable: (e: { code?: string }) => e?.code === "42P01" },
    "@/lib/points-retrait": { lirePointsRetrait },
  }, {}, { console: { warn: (m: string) => avertissements.push(m), log() {}, error() {} } });
  return { chargerPointsRetrait: mod.chargerPointsRetrait as unknown as () => Promise<PointRetrait[]>, db, avertissements, MAX: (mod as unknown as { MAX_POINTS_CHARGES: number }).MAX_POINTS_CHARGES };
}

test("chargerPointsRetrait : la requête filtre sur actif ET sur la zone renseignée, est ordonnée et bornée", async () => {
  const { chargerPointsRetrait, db, MAX } = chargeur(() => ({ data: [{ id: U(1), nom: "Boutik", adresse: "Rue 5, Delmas", telefon: null, zone_id: U(2), position: 0 }], error: null }));
  const r = await chargerPointsRetrait();
  assert.equal(r.length, 1);
  const [q] = db.queries;
  assert.equal(q.table, "zabelie_pickup_points");
  const etapes = json(q.steps) as [string, unknown[]][];
  assert.deepEqual(etapes.find(([m]) => m === "eq"), ["eq", ["actif", true]], "le filtre actif est répété côté code, au cas où la policy serait élargie");
  assert.deepEqual(etapes.find(([m]) => m === "not"), ["not", ["zone_id", "is", null]]);
  assert.deepEqual(etapes.filter(([m]) => m === "order").map(([, a]) => a[0]), ["position", "created_at"]);
  assert.deepEqual(etapes.find(([m]) => m === "limit"), ["limit", [MAX]]);
  assert.equal(MAX, 200);
});

test("chargerPointsRetrait : table absente → [] sans bruit ; autre erreur ou exception → [] ET une trace", async () => {
  let c = chargeur(() => ({ data: null, error: { code: "42P01", message: "relation absente" } }));
  assert.deepEqual(json(await c.chargerPointsRetrait()), []); // JSON : le tableau vient d'un autre « realm » (vm)
  assert.equal(c.avertissements.length, 0, "table absente : le code se déploie avant la migration, c'est normal");

  c = chargeur(() => ({ data: null, error: { code: "XX000", message: "incident" } }));
  assert.deepEqual(json(await c.chargerPointsRetrait()), []); // JSON : le tableau vient d'un autre « realm » (vm)
  assert.equal(c.avertissements.length, 1, "un échec silencieux se lirait « aucun point de retrait »");
  assert.match(c.avertissements[0], /^\[retrait\]/);

  c = chargeur(() => ({ data: [], error: null }), { lance: true });
  assert.deepEqual(json(await c.chargerPointsRetrait()), []); // JSON : le tableau vient d'un autre « realm » (vm)
  assert.equal(c.avertissements.length, 1);
});

test("chargerPointsRetrait : une ligne mal formée de la base n'empêche pas les autres", async () => {
  const { chargerPointsRetrait } = chargeur(() => ({
    data: [{ id: "x" }, { id: U(1), nom: "Boutik", adresse: "Rue 5, Delmas", telefon: null, zone_id: U(2), position: 0 }], error: null,
  }));
  assert.equal((await chargerPointsRetrait()).length, 1);
});

// ───────────── les écrans : ce qui COMMANDE ─────────────

test("catalogue : les points ne se chargent que pour une zone seule SANS résultat, et se montrent dans cet écran", () => {
  const src = sansCommentairesTs(lire("app/catalogue/page.tsx"));
  assert.match(src, /const pointsZone = zoneSeule && zoneActive && total === 0\s*\?\s*pointsPourZone\(zones, await chargerPointsRetrait\(\), zoneActive\.id,/);
  assert.match(src, /zoneSeule && zoneActive \? \([\s\S]{0,1200}\{pointsZone\.length > 0 && \([\s\S]{0,300}<PointsRetrait points=\{pointsZone\}/);
});

test("fiche produit : les points viennent du chargeur de zone et se rapprochent de la zone CHOISIE", () => {
  const serveur = sansCommentairesTs(lire("lib/zone-remise-serveur.ts"));
  assert.match(serveur, /return \{ zones, couverture, conditions, points: await chargerPointsRetrait\(\) \};/);
  const selecteur = sansCommentairesTs(lire("components/zone-remise.tsx"));
  assert.match(selecteur, /<PointsRetrait points=\{pointsPourZone\(zones, points, effective, locale\)\} labels=\{pointsLabels\} \/>/);
  const bouton = sansCommentairesTs(lire("components/buy-button.tsx"));
  assert.match(bouton, /points=\{zoneRemise\.points\} pointsLabels=\{zoneRemise\.pointsLabels\}/);
  const page = sansCommentairesTs(lire("app/produit/[slug]/page.tsx"));
  assert.match(page, /pointsLabels: \{ title: t\(lang, "pr\.title"\), note: t\(lang, "pr\.note"\), call: t\(lang, "pr\.call"\) \}/);
});

test("composant : rien à montrer → rien de rendu (un encadré vide serait une promesse vide)", () => {
  const src = sansCommentairesTs(lire("components/points-retrait.tsx"));
  assert.match(src, /if \(points\.length === 0\) return null;/);
  assert.doesNotMatch(src, /\bt\(|i18n/, "un composant partagé avec le client ne lit pas la langue");
  assert.doesNotMatch(src, /commission|gratuit|offert/i, "aucune commission ni gratuité promise : l'arbitrage est au porteur");
});

test("les libellés existent dans les quatre langues, la note dit que Zabelie ne livre pas", () => {
  for (const lang of LANGS) {
    const d = DICT[lang];
    assert.ok(d["pr.title"].length > 8, lang);
    assert.match(d["pr.call"], /\{nom\}/, lang);
    assert.ok(d["pr.note"].length > 60, lang);
  }
  assert.match(DICT.fr["pr.note"], /Zabelie ne livre pas/);
  assert.match(DICT.en["pr.note"], /Zabelie does not deliver/);
  assert.match(DICT.ht["pr.note"], /Zabelie pa livre/);
  assert.match(DICT.es["pr.note"], /Zabelie no entrega/);
});

test("le lecteur est en lecture seule et ne passe pas par le service-role", () => {
  const src = sansCommentairesTs(lire("lib/points-retrait-serveur.ts"));
  assert.doesNotMatch(src, /createAdminClient|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  assert.match(src, /createClient\(\)/);
});
