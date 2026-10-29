import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_ZONES_PAR_REQUETE,
  filtreZoneNonSuspendue,
  lireZonesVoulues,
  pauseEnCours,
  planifierConditions,
  type ConditionsZone,
} from "../lib/zones-service";
import { conditionsPourZone, type ConditionZone, type ZoneRemiseNoeud } from "../lib/zone-remise";
import { database, loadRoute, type Query } from "./helpers/route-harness";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [Z1, Z2, Z3, Z4] = [U(1), U(2), U(3), U(4)];

/* ── lireZonesVoulues : la FORME du corps ───────────────────────────────────── */

test("lireZonesVoulues : un corps complet est lu tel quel, identifiants en minuscules", () => {
  const r = lireZonesVoulues({ zones: [{ zoneId: Z1.toUpperCase(), feeHtg: 150, delayHours: 24, pause: { action: "set", days: 7 } }] });
  assert.deepEqual(r, [{ zoneId: Z1, feeHtg: 150, delayHours: 24, pause: { action: "set", days: 7 } }]);
});

test("lireZonesVoulues : `undefined` = ne pas toucher, `null` = effacer — et le format d'avant n'efface RIEN", () => {
  const [a] = lireZonesVoulues({ zones: [{ zoneId: Z1, feeHtg: null, delayHours: null }] })!;
  assert.equal(a.feeHtg, null);
  assert.equal(a.delayHours, null);
  const [b] = lireZonesVoulues({ zones: [{ zoneId: Z1 }] })!;
  assert.equal(b.feeHtg, undefined);
  assert.deepEqual(b.pause, { action: "keep" });
  // Le format d'avant : un tableau d'identifiants, conditions intactes.
  const legacy = lireZonesVoulues({ zoneIds: [Z1, Z2] })!;
  assert.equal(legacy.length, 2);
  assert.ok(legacy.every((z) => z.feeHtg === undefined && z.delayHours === undefined && z.pause.action === "keep"));
});

test("lireZonesVoulues : chaque valeur hors forme rend null (400) — frais, délai, pause, identifiant, doublon, taille", () => {
  const mauvais: unknown[] = [
    null, undefined, "x", 12, [], {}, { zones: "x" },
    { zones: [null] }, { zones: [{}] }, { zones: [{ zoneId: "Delmas" }] }, { zones: [{ zoneId: 12 }] },
    { zones: [{ zoneId: Z1 }, { zoneId: Z1.toUpperCase() }] },                // doublon, casse comprise
    ...[-1, 100001, 1.5, "12", Number.NaN, Infinity, true].map((feeHtg) => ({ zones: [{ zoneId: Z1, feeHtg }] })),
    ...[0, 721, -3, 2.5, "24", Number.NaN].map((delayHours) => ({ zones: [{ zoneId: Z1, delayHours }] })),
    ...[{ action: "set", days: 0 }, { action: "set", days: 91 }, { action: "set", days: 1.5 }, { action: "set", days: "7" }, { action: "set" }, { action: "pause" }, "keep", null]
      .map((pause) => ({ zones: [{ zoneId: Z1, pause }] })),
    { zones: Array.from({ length: MAX_ZONES_PAR_REQUETE + 1 }, (_, i) => ({ zoneId: U(i + 1) })) },
  ];
  for (const corps of mauvais) assert.equal(lireZonesVoulues(corps), null, JSON.stringify(corps)?.slice(0, 90));
  // Bornes incluses : frais 0 et 100000, délai 1 et 720, pause 1 et 90 jours.
  assert.ok(lireZonesVoulues({ zones: [{ zoneId: Z1, feeHtg: 0, delayHours: 1, pause: { action: "set", days: 1 } }] }));
  assert.ok(lireZonesVoulues({ zones: [{ zoneId: Z1, feeHtg: 100000, delayHours: 720, pause: { action: "set", days: 90 } }] }));
  assert.ok(lireZonesVoulues({ zones: Array.from({ length: MAX_ZONES_PAR_REQUETE }, (_, i) => ({ zoneId: U(i + 1) })) }));
});

/* ── planifierConditions : ce qu'il faut écrire ─────────────────────────────── */

const MAINTENANT = new Date("2026-10-29T12:00:00.000Z");
const C = (feeHtg: number | null, delayHours: number | null, pausedUntil: string | null = null): ConditionsZone => ({ feeHtg, delayHours, pausedUntil });

test("planifierConditions : on n'écrit que la DIFFÉRENCE — zone neuve, zone modifiée, zone retirée, zone inchangée", () => {
  const actuelles = new Map([[Z1, C(100, 24)], [Z2, C(null, null)], [Z4, C(50, 12)]]);
  const voulues = lireZonesVoulues({ zones: [
    { zoneId: Z1, feeHtg: 100, delayHours: 24 },                       // inchangée
    { zoneId: Z2, feeHtg: 300 },                                       // modifiée (frais), délai non touché
    { zoneId: Z3, feeHtg: 0, delayHours: 6, pause: { action: "set", days: 7 } }, // neuve
  ] })!;
  const p = planifierConditions(actuelles, voulues, MAINTENANT);
  assert.deepEqual(p.finales, [Z1, Z2, Z3]);
  assert.deepEqual(p.retirer, [Z4]);
  assert.deepEqual(p.modifier, [{ zone_id: Z2, fee_htg: 300, delay_hours: null, paused_until: null }]);
  assert.deepEqual(p.ajouter, [{ zone_id: Z3, fee_htg: 0, delay_hours: 6, paused_until: "2026-11-05T12:00:00.000Z" }]);
});

test("planifierConditions : la pause se calcule à l'horloge du SERVEUR ; « garder » conserve la date ; « lever » l'efface", () => {
  const future = "2026-11-10T00:00:00.000Z";
  const actuelles = new Map([[Z1, C(null, null, future)], [Z2, C(null, null, future)]]);
  const voulues = lireZonesVoulues({ zones: [
    { zoneId: Z1, pause: { action: "keep" } },
    { zoneId: Z2, pause: { action: "clear" } },
  ] })!;
  const p = planifierConditions(actuelles, voulues, MAINTENANT);
  assert.deepEqual(p.modifier, [{ zone_id: Z2, fee_htg: null, delay_hours: null, paused_until: null }], "Z1 gardée : aucune écriture");
  const trois = planifierConditions(new Map([[Z1, C(null, null)]]), lireZonesVoulues({ zones: [{ zoneId: Z1, pause: { action: "set", days: 3 } }] })!, MAINTENANT);
  assert.equal(trois.modifier[0].paused_until, "2026-11-01T12:00:00.000Z");
});

test("planifierConditions : le format d'avant (zoneIds seul) ne réécrit et n'efface AUCUNE condition existante", () => {
  const actuelles = new Map([[Z1, C(150, 24, "2026-12-01T00:00:00.000Z")], [Z2, C(0, 48)]]);
  const p = planifierConditions(actuelles, lireZonesVoulues({ zoneIds: [Z1, Z2, Z3] })!, MAINTENANT);
  assert.deepEqual(p.modifier, [], "rien n'est réécrit");
  assert.deepEqual(p.retirer, []);
  assert.deepEqual(p.ajouter, [{ zone_id: Z3, fee_htg: null, delay_hours: null, paused_until: null }]);
});

/* ── pauseEnCours / filtre ──────────────────────────────────────────────────── */

test("pauseEnCours : seule une date FUTURE et lisible est une pause — jamais « suspendu pour toujours »", () => {
  assert.equal(pauseEnCours("2026-10-30T00:00:00.000Z", MAINTENANT), true);
  assert.equal(pauseEnCours("2026-10-29T11:59:59.000Z", MAINTENANT), false, "échue");
  assert.equal(pauseEnCours("2026-10-29T12:00:00.000Z", MAINTENANT), false, "à l'instant exact : échue");
  for (const v of [null, undefined, "", "pas une date", "0000"]) assert.equal(pauseEnCours(v as string, MAINTENANT), false, String(v));
});

test("filtreZoneNonSuspendue : pas de pause OU pause échue, à l'instant donné", () => {
  assert.equal(filtreZoneNonSuspendue(MAINTENANT), "paused_until.is.null,paused_until.lte.2026-10-29T12:00:00.000Z");
});

/* ── conditionsPourZone : la zone déclarée la plus proche ───────────────────── */

const ARBRE: ZoneRemiseNoeud[] = [
  { id: "ou", parent_id: null, level: "depatman" },
  { id: "delmas", parent_id: "ou", level: "komin" },
  { id: "d33", parent_id: "delmas", level: "katye" },
  { id: "tabarre", parent_id: "ou", level: "komin" },
];
const cond = (zoneId: string, feeHtg: number | null, pausedUntil: string | null = null): ConditionZone => ({ zoneId, feeHtg, delayHours: null, pausedUntil });

test("conditionsPourZone : la destination elle-même, sinon l'ancêtre déclaré LE PLUS BAS ; jamais un descendant, jamais un frère", () => {
  const conditions = [cond("ou", 500), cond("delmas", 200), cond("d33", 50)];
  assert.equal(conditionsPourZone(ARBRE, conditions, "d33")?.feeHtg, 50, "le quartier précis l'emporte");
  assert.equal(conditionsPourZone(ARBRE, conditions, "delmas")?.feeHtg, 200, "la commune, pas le département");
  assert.equal(conditionsPourZone(ARBRE, [cond("ou", 500), cond("delmas", 200)], "d33")?.feeHtg, 200, "l'ancêtre le plus bas : Delmas, pas l'Ouest");
  assert.equal(conditionsPourZone(ARBRE, [cond("ou", 500)], "d33")?.feeHtg, 500, "à défaut, le département");
  assert.equal(conditionsPourZone(ARBRE, [cond("d33", 50)], "delmas"), null, "un quartier déclaré ne donne pas de conditions à la commune entière");
  assert.equal(conditionsPourZone(ARBRE, [cond("tabarre", 10)], "delmas"), null, "une commune sœur non plus");
  assert.equal(conditionsPourZone(ARBRE, conditions, null), null);
  assert.equal(conditionsPourZone(ARBRE, [], "d33"), null);
});

test("conditionsPourZone : une zone en pause reste trouvée (l'écran dit « suspendue », pas « ne déclare pas »)", () => {
  const r = conditionsPourZone(ARBRE, [cond("delmas", 200, "2026-11-10T00:00:00.000Z")], "d33");
  assert.equal(r?.pausedUntil, "2026-11-10T00:00:00.000Z");
});

/* ── La route : ce qui est écrit, dans quel ordre, sous quelle identité ─────── */

type Ligne = { zone_id: string; fee_htg?: number | null; delay_hours?: number | null; paused_until?: string | null };
function route(options: { lignes?: Ligne[]; user?: boolean; erreurEcriture?: { code?: string; message: string }; erreurColonne?: boolean } = {}) {
  const ecritures: { op: string; table: string; payload?: unknown; filtres: [string, unknown[]][] }[] = [];
  let lectures = 0;
  const db = database(async (q: Query) => {
    const step = (n: string) => q.steps.find(([s]) => s === n)?.[1];
    if (q.table === "zabelie_service_zone_config") return { data: { max_zones: 20 }, error: null };
    if (step("delete") || step("update") || step("insert")) {
      const op = step("delete") ? "delete" : step("update") ? "update" : "insert";
      ecritures.push({ op, table: q.table, payload: step(op === "delete" ? "delete" : op)![0], filtres: q.steps.filter(([s]) => s === "eq" || s === "in") as [string, unknown[]][] });
      return { error: options.erreurEcriture ?? null };
    }
    lectures++;
    const colonnes = String(step("select")?.[0] ?? "");
    if (options.erreurColonne && colonnes.includes("fee_htg")) return { data: null, error: { code: "42703", message: "column does not exist" } };
    const lignes = (options.lignes ?? []).map((l) => (colonnes.includes("fee_htg") ? l : { zone_id: l.zone_id }));
    return { data: lignes, error: null };
  });
  const mod = loadRoute("app/api/seller/service-zones/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ ...db, auth: { getUser: async () => ({ data: { user: options.user === false ? null : { id: "session-vendeur" } } }) } }) },
    "@/lib/auth": { requireActiveAccount: async () => null },
    "@/lib/api-erreur": { erreurTraduite: async (cle: string, status: number, extra?: object) => Response.json({ error: cle, ...extra }, { status }) },
    "@/lib/product-media": { isMissingTable: (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" },
    "@/lib/zones-service": { lireZonesVoulues, planifierConditions },
  });
  const put = (corps: unknown) => mod.PUT(new Request("https://zabelie.test/api/seller/service-zones", { method: "PUT", body: JSON.stringify(corps) }));
  const get = () => mod.GET(new Request("https://zabelie.test/api/seller/service-zones"));
  return { put, get, ecritures, lectures: () => lectures };
}
const json = async (r: Response) => JSON.parse(JSON.stringify(await r.json()));

test("PUT : retrait, puis modification des SEULES lignes changées, puis ajout — sous l'identité de la session", async () => {
  const f = route({ lignes: [
    { zone_id: Z1, fee_htg: 100, delay_hours: 24, paused_until: null },
    { zone_id: Z2, fee_htg: null, delay_hours: null, paused_until: null },
    { zone_id: Z4, fee_htg: 50, delay_hours: 12, paused_until: null },
  ] });
  const res = await f.put({ sellerId: "pirate", zones: [
    { zoneId: Z1, feeHtg: 100, delayHours: 24 },
    { zoneId: Z2, feeHtg: 300 },
    { zoneId: Z3, feeHtg: 0, delayHours: 6, pause: { action: "set", days: 7 }, seller_id: "pirate" },
  ] });
  assert.equal(res.status, 200);
  assert.deepEqual((await json(res)).zoneIds, [Z1, Z2, Z3]);
  assert.deepEqual(f.ecritures.map((e) => e.op), ["delete", "update", "insert"], "retirer AVANT modifier AVANT ajouter ; Z1 inchangée n'est pas réécrite");
  const [del, upd, ins] = f.ecritures;
  assert.deepEqual(JSON.parse(JSON.stringify(del.filtres)), [["eq", ["seller_id", "session-vendeur"]], ["in", ["zone_id", [Z4]]]]);
  assert.deepEqual(JSON.parse(JSON.stringify(upd.payload)), { fee_htg: 300, delay_hours: null, paused_until: null });
  assert.deepEqual(JSON.parse(JSON.stringify(upd.filtres)), [["eq", ["seller_id", "session-vendeur"]], ["eq", ["zone_id", Z2]]]);
  const lignes = JSON.parse(JSON.stringify(ins.payload)) as Record<string, unknown>[];
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].seller_id, "session-vendeur", "un seller_id du corps ne passe jamais");
  assert.equal(lignes[0].zone_id, Z3);
  assert.equal(lignes[0].fee_htg, 0);
  const jours = (Date.parse(lignes[0].paused_until as string) - Date.now()) / 86_400_000;
  assert.ok(jours > 6.99 && jours < 7.01, `pause posée à l'horloge du serveur : ${jours} jours`);
});

test("PUT : le format d'avant ({ zoneIds }) ne touche à aucune condition existante", async () => {
  const f = route({ lignes: [{ zone_id: Z1, fee_htg: 150, delay_hours: 24, paused_until: "2030-01-01T00:00:00.000Z" }] });
  const res = await f.put({ zoneIds: [Z1] });
  assert.equal(res.status, 200);
  assert.deepEqual(f.ecritures, [], "rien n'est écrit");
});

test("PUT : un corps hors forme rend 400 AVANT toute lecture ou écriture ; sans session, 401", async () => {
  for (const corps of [{ zones: [{ zoneId: Z1, feeHtg: -5 }] }, { zones: [{ zoneId: Z1 }, { zoneId: Z1 }] }, { nimporte: "quoi" }, { zones: [{ zoneId: Z1, pause: { action: "set", days: 400 } }] }]) {
    const f = route();
    assert.equal((await f.put(corps)).status, 400, JSON.stringify(corps));
    assert.equal(f.lectures(), 0);
    assert.deepEqual(f.ecritures, []);
  }
  const anon = route({ user: false });
  assert.equal((await anon.put({ zones: [] })).status, 401);
  assert.equal(anon.lectures(), 0);
});

test("PUT : les refus de la base reviennent avec un CODE, jamais son message", async () => {
  const cas: [{ code?: string; message: string }, number, string | undefined][] = [
    [{ message: "ZB164 : pause de plus de 30 jours refusee", code: "23514" }, 422, "service_zones_pause"],
    [{ message: "ZB158 : plafond de 20 zones de service atteint" }, 422, "service_zones_max"],
    [{ message: "ZB158 : zone introuvable ou fermee" }, 422, "service_zones_zone"],
    [{ message: "new row violates check constraint \"zabelie_seller_service_zones_fee_htg_check\"", code: "23514" }, 422, "service_zones_valeur"],
    [{ message: "fk", code: "23503" }, 422, "service_zones_zone"],
    [{ message: "connexion perdue secret-interne", code: "08006" }, 500, "service_zones_ecriture"],
  ];
  for (const [erreur, statut, code] of cas) {
    const f = route({ lignes: [], erreurEcriture: erreur });
    const res = await f.put({ zones: [{ zoneId: Z1, feeHtg: 10 }] });
    assert.equal(res.status, statut, erreur.message);
    const corps = await json(res);
    assert.equal(corps.code, code);
    assert.ok(!JSON.stringify(corps).includes("secret-interne") && !JSON.stringify(corps).includes("violates"), "le message de la base fuit");
  }
});

test("GET : rend les conditions de chaque zone ; base en retard de migration → relecture sans les colonnes, conditions vides", async () => {
  const f = route({ lignes: [{ zone_id: Z1, fee_htg: 150, delay_hours: 24, paused_until: null }] });
  const corps = await json(await f.get());
  assert.deepEqual(corps.zones, [{ zoneId: Z1, feeHtg: 150, delayHours: 24, pausedUntil: null }]);
  assert.deepEqual(corps.zoneIds, [Z1], "le champ d'avant reste servi");
  const ancien = route({ lignes: [{ zone_id: Z1, fee_htg: 150 }], erreurColonne: true });
  const r = await ancien.get();
  assert.equal(r.status, 200);
  assert.deepEqual((await json(r)).zones, [{ zoneId: Z1, feeHtg: null, delayHours: null, pausedUntil: null }]);
});

/* ── Les structures qui COMMANDENT (lectures acheteur) ───────────────────────── */

const lire = (f: string) => readFileSync(f, "utf8");

test("une zone EN PAUSE ne compte pas comme desservie : filtre sur le classement ET sur le filtre catalogue, avec repli base ancienne", () => {
  for (const f of ["lib/zones.ts", "lib/proximite-serveur.ts"]) {
    const src = lire(f);
    assert.match(src, /\.or\(filtreZoneNonSuspendue\(new Date\(\)\)\)/, `${f} : pas de filtre de pause`);
    assert.match(src, /if \(error\?\.code === "42703"\) \(\{ data, error \} = await base\(\)\);/, `${f} : pas de repli base ancienne`);
  }
});

test("la fiche produit ne montre une pause que si le SERVEUR la juge en cours ; le navigateur ne compare aucune date", () => {
  const serveur = lire("lib/zone-remise-serveur.ts");
  assert.match(serveur, /pausedUntil: pauseEnCours\(l\.paused_until, maintenant\) \? \(l\.paused_until \?\? null\) : null,/);
  const comp = lire("components/zone-remise.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(comp, /Date\.now\(\)|new Date\(\)(?!\.)/, "le composant lit l'horloge du navigateur");
  // Les frais sont toujours dits hors du paiement Zabelie.
  assert.match(comp, /<p>\{labels\.termsNote\}<\/p>/);
});

test("la fiche affiche la pause à la place des conditions, et les frais à zéro disent « offerts » plutôt que 0 HTG", () => {
  const comp = lire("components/zone-remise.tsx");
  assert.match(comp, /\{cond\?\.pausedUntil \? \([\s\S]{0,300}labels\.paused[\s\S]{0,400}\) : cond && \(cond\.feeHtg !== null \|\| cond\.delayHours !== null\) \? \(/);
  assert.match(comp, /cond\.feeHtg === 0 \? labels\.feeFree : labels\.fee\.replace/);
});
