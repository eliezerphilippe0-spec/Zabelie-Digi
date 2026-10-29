import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { niveauDesserte, perimetresProximite } from "../lib/proximite";
import { estProche, fusionnerNiveaux, type NiveauProximite } from "../lib/proximite-niveaux";
import { rankShoppingCandidates, type ShoppingCandidate, type ShoppingIntent } from "../lib/shopping-ai";
import { planifierZones } from "../lib/zones-service";
import { SHOPPING_COPY } from "../lib/shopping-ai-copy";
import { DICT, LANGS } from "../lib/i18n";
import type { Zone } from "../lib/zones";

/**
 * Zones de service des vendeurs (docs/77 §8, migration 0158 ; décision du porteur,
 * 2026-10-29 : « les vendeurs auront à faire leur propre livraison »).
 *
 * Le jeu de zones reprend les vraies graphies du Nord (voir tests/proximite.test.ts).
 * Chaque instrument est éprouvé sur un cas connu-POSITIF et un connu-NÉGATIF :
 * une fusion qui renverrait toujours « desserte » passerait les cas positifs.
 */

const Z = (id: string, level: Zone["level"], parent: string | null, slug: string, kr: string, fr: string): Zone => ({
  id, parent_id: parent, level, slug, label_kr: kr, label_fr: fr, label_en: null, label_es: null,
});
const ZONES: Zone[] = [
  Z("d-nord", "depatman", null, "nord", "Nò", "Nord"),
  Z("d-ouest", "depatman", null, "ouest", "Lwès", "Ouest"),
  Z("k-okap", "komin", "d-nord", "cap-haitien", "Okap", "Cap-Haïtien"),
  Z("k-limbe", "komin", "d-nord", "limbe", "Lenbe", "Limbé"),
  Z("q-carenage", "katye", "k-okap", "carenage", "Karenaj", "Carénage"),
  Z("q-hautcap", "katye", "k-okap", "haut-du-cap", "Odikap", "Haut-du-Cap"),
];
const per = (zoneId: string) => {
  const p = perimetresProximite(ZONES, zoneId);
  assert.ok(p, `périmètres introuvables pour ${zoneId}`);
  return p;
};

// ───────────────────────── planifierZones ─────────────────────────────────────

test("planifierZones : seul le delta est écrit — ajouts, retraits, inchangés", () => {
  const r = planifierZones(["a", "b", "c"], ["b", "c", "d"]);
  assert.deepEqual(r.ajouter, ["d"]);
  assert.deepEqual(r.retirer, ["a"]);
  assert.deepEqual(r.finales, ["b", "c", "d"]);
});

test("planifierZones : connus-négatifs — rien à faire, doublons, tout retirer, tout poser", () => {
  assert.deepEqual(planifierZones(["a"], ["a"]), { finales: ["a"], ajouter: [], retirer: [] });
  assert.deepEqual(planifierZones([], ["a", "a", "b"]), { finales: ["a", "b"], ajouter: ["a", "b"], retirer: [] });
  assert.deepEqual(planifierZones(["a", "b"], []), { finales: [], ajouter: [], retirer: ["a", "b"] });
});

// ───────────────────────── fusionnerNiveaux ───────────────────────────────────

const F = (maison: NiveauProximite, desserte: NiveauProximite) => fusionnerNiveaux(maison, desserte);

test("fusion : la desserte plus PROCHE que l'installation l'emporte, et se dit « desservi »", () => {
  assert.deepEqual(F("ailleurs", "komin"), { niveau: "komin", dessert: true });
  assert.deepEqual(F("inconnue", "katye"), { niveau: "katye", dessert: true });
  assert.deepEqual(F("depatman", "komin"), { niveau: "komin", dessert: true });
});

test("fusion : à égalité ou installation plus proche, le fait de localisation prime sur la déclaration", () => {
  assert.deepEqual(F("komin", "komin"), { niveau: "komin", dessert: false });
  assert.deepEqual(F("katye", "komin"), { niveau: "katye", dessert: false });
  assert.deepEqual(F("komin", "ailleurs"), { niveau: "komin", dessert: false });
  assert.deepEqual(F("depatman", "inconnue"), { niveau: "depatman", dessert: false });
});

test("fusion : sans niveau proche, « ailleurs » seulement si l'un des deux est CONNU et lointain", () => {
  assert.deepEqual(F("ailleurs", "inconnue"), { niveau: "ailleurs", dessert: false });
  assert.deepEqual(F("inconnue", "ailleurs"), { niveau: "ailleurs", dessert: false });
  assert.deepEqual(F("ailleurs", "ailleurs"), { niveau: "ailleurs", dessert: false });
  // Le piège : ne rien savoir n'est pas être loin.
  assert.deepEqual(F("inconnue", "inconnue"), { niveau: "inconnue", dessert: false });
});

test("fusion : « dessert » n'est jamais vrai pour un niveau non proche", () => {
  const niveaux: NiveauProximite[] = ["katye", "komin", "depatman", "inconnue", "ailleurs"];
  for (const m of niveaux) for (const d of niveaux) {
    const r = F(m, d);
    if (r.dessert) assert.ok(estProche(r.niveau), `${m}+${d} → desservi mais ${r.niveau}`);
  }
});

// ───────────────────────── niveauDesserte ─────────────────────────────────────

test("desserte : acheteur dans un quartier — le plus petit périmètre qui contient une zone desservie", () => {
  const p = per("q-carenage");
  assert.equal(niveauDesserte(["q-carenage"], p), "katye");
  assert.equal(niveauDesserte(["q-hautcap"], p), "komin", "autre quartier de la même commune");
  assert.equal(niveauDesserte(["k-okap"], p), "komin", "toute la commune");
  assert.equal(niveauDesserte(["k-limbe"], p), "depatman", "autre commune du département");
  assert.equal(niveauDesserte(["d-nord"], p), "depatman", "tout le département");
});

test("desserte : connus-négatifs — rien de déclaré = inconnue, déclaré ailleurs = ailleurs", () => {
  const p = per("q-carenage");
  assert.equal(niveauDesserte([], p), "inconnue");
  assert.equal(niveauDesserte(["d-ouest"], p), "ailleurs");
});

test("desserte : le MEILLEUR niveau gagne, quel que soit l'ordre des zones", () => {
  const p = per("q-carenage");
  assert.equal(niveauDesserte(["d-ouest", "k-limbe", "q-carenage"], p), "katye");
  assert.equal(niveauDesserte(["q-carenage", "k-limbe", "d-ouest"], p), "katye");
  assert.equal(niveauDesserte(["d-ouest", "k-okap"], p), "komin");
});

test("desserte : un acheteur qui n'a dit que sa commune — un quartier de cette commune compte comme « commune »", () => {
  const p = per("k-okap");
  assert.equal(p.katye, null, "pas de quartier déclaré : on ne prétend pas savoir");
  assert.equal(niveauDesserte(["q-hautcap"], p), "komin");
  assert.equal(niveauDesserte(["k-limbe"], p), "depatman");
});

// ───────────────────────── classement ─────────────────────────────────────────

const intent: ShoppingIntent = { query: "chaise", need: "", budgetHtg: 5000, location: "Okap", kind: null };
const offre = (id: string, seller: string): ShoppingCandidate => ({
  id, slug: id, title: "Chaise", description: "chaise en bois", sellerId: seller,
  kind: "physical" as ShoppingCandidate["kind"], priceHtg: 1000, ratingAverage: null, ratingCount: 0, available: true,
});

test("classement : un vendeur installé ailleurs mais qui DÉCLARE livrer dans la commune passe devant un vendeur lointain", () => {
  const carte = new Map([
    ["s-loin", { niveau: "ailleurs" as const, dessert: false }],
    ["s-livre", { niveau: "komin" as const, dessert: true }],
  ]);
  const r = rankShoppingCandidates([offre("a", "s-loin"), offre("b", "s-livre")], intent, undefined, carte);
  assert.deepEqual(r.map((x) => x.id), ["b", "a"]);
  assert.equal(r[0].dessert, true);
  assert.equal(r[1].dessert, false);
});

test("classement : sans carte, ou pour un non-physique, « dessert » reste faux", () => {
  assert.equal(rankShoppingCandidates([offre("a", "s")], intent)[0].dessert, false);
  const fichier = { ...offre("f", "s"), kind: "file" as ShoppingCandidate["kind"] };
  const carte = new Map([["s", { niveau: "katye" as const, dessert: true }]]);
  const r = rankShoppingCandidates([fichier], intent, undefined, carte);
  assert.equal(r[0].dessert, false, "un fichier numérique n'est jamais « livré »");
  assert.equal(r[0].proximite, null);
});

// ───────────────────────── câblage serveur ────────────────────────────────────

const SERVEUR = readFileSync("lib/proximite-serveur.ts", "utf8");

test("serveur : les zones desservies sont lues par vendeur, et fusionnées avec l'installation", () => {
  assert.match(SERVEUR, /\.from\("zabelie_seller_service_zones"\)\s*\.select\("seller_id, zone_id"\)\s*\.in\("seller_id", vendeurIds\)/);
  assert.match(SERVEUR, /const maison = niveauProximite\(id, ensembles\);[\s\S]{0,200}fusionnerNiveaux\(maison, niveauDesserte\(desservies\.get\(id\) \?\? \[\], perimetres\)\)/);
});

test("serveur : une lecture des zones desservies qui échoue dégrade vers l'installation SEULE, jamais vers un faux proche", () => {
  assert.match(SERVEUR, /if \(!desservies\) return \{ niveau: maison, dessert: false \}/);
  assert.match(SERVEUR, /if \(error && !isMissingTable\(error\)\) console\.warn/);
});

// ───────────────────────── libellés ───────────────────────────────────────────

test("libellés : la desserte existe en quatre langues, ATTRIBUÉE au vendeur — jamais une promesse de Zabelie", () => {
  const attribution = /déclar|deklar|declar|says/i;
  const livraison = /livr|deliver|entreg/i;
  for (const lang of LANGS) {
    const c = SHOPPING_COPY[lang];
    for (const cle of ["desserteKatye", "desserteKomin", "desserteDepatman"] as const) {
      assert.match(c[cle], attribution, `${lang} : ${cle} n'est pas attribué au vendeur`);
      assert.match(c[cle], livraison, `${lang} : ${cle} ne dit pas ce que le vendeur déclare`);
    }
  }
});

test("libellés : les quatre langues ne partagent pas la même phrase de desserte (aucune copie du français)", () => {
  const fr = SHOPPING_COPY.fr.desserteKomin;
  for (const lang of LANGS.filter((l) => l !== "fr")) {
    assert.notEqual(SHOPPING_COPY[lang].desserteKomin, fr, `${lang} reprend le français`);
  }
});

test("i18n : les clés svc.* existent dans les quatre langues, non vides, avec leurs variables", () => {
  const cles = Object.keys(DICT.fr).filter((k) => k.startsWith("svc."));
  assert.ok(cles.length >= 14, `seulement ${cles.length} clés svc.*`);
  for (const lang of LANGS) {
    for (const k of cles) assert.ok((DICT[lang] as Record<string, string>)[k]?.trim().length > 2, `${lang} : ${k} vide`);
    assert.ok(DICT[lang]["svc.remove" as keyof typeof DICT.fr].includes("{zone}"), `${lang} : svc.remove sans {zone}`);
    const compte = DICT[lang]["svc.count" as keyof typeof DICT.fr];
    assert.ok(compte.includes("{n}") && compte.includes("{max}"), `${lang} : svc.count sans {n}/{max}`);
  }
});

test("i18n : le texte d'aide dit que Zabelie ne livre pas, dans les quatre langues", () => {
  const nonLivraison = { fr: /ne livre pas/i, ht: /pa livre/i, en: /does not deliver/i, es: /no entrega/i } as const;
  for (const lang of LANGS) {
    assert.match(DICT[lang]["svc.hint" as keyof typeof DICT.fr], nonLivraison[lang], `${lang} : svc.hint ne rappelle pas que Zabelie ne livre pas`);
  }
});

// ───────────────────────── la route ───────────────────────────────────────────

const ROUTE = readFileSync("app/api/seller/service-zones/route.ts", "utf8");
const SANS_COMMENTAIRES = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE_CODE = SANS_COMMENTAIRES(ROUTE);

test("route : sous la SESSION du vendeur — jamais le client de service", () => {
  assert.doesNotMatch(ROUTE_CODE, /createAdminClient|supabase\/admin/);
  assert.match(ROUTE_CODE, /import \{ createClient \} from "@\/lib\/supabase\/server"/);
});

test("route : authentification, puis compte actif, avant toute lecture", () => {
  const put = ROUTE_CODE.slice(ROUTE_CODE.indexOf("export async function PUT"));
  assert.match(put, /if \(!user\) return erreurTraduite\("api\.auth\.required", 401\);\s*const refus = await requireActiveAccount\(user\.id\);\s*if \(refus\) return refus;/);
  const get = ROUTE_CODE.slice(ROUTE_CODE.indexOf("export async function GET"), ROUTE_CODE.indexOf("export async function PUT"));
  assert.match(get, /if \(!user\) return erreurTraduite\("api\.auth\.required", 401\);\s*const refus = await requireActiveAccount\(user\.id\);\s*if \(refus\) return refus;/);
});

test("route : la FORME du corps est contrôlée (identifiants, bornes, doublons) AVANT toute lecture ou écriture", () => {
  // Depuis 0164 le contrôle vit dans `lireZonesVoulues` (lib/zones-service, éprouvé dans tests/zones-conditions.test.ts) ;
  // ici, seulement le fait qu'il COMMANDE : un corps invalide rend 400 avant `lireMesZones`.
  assert.match(ROUTE_CODE, /voulues = lireZonesVoulues\(await req\.json\(\)\);[\s\S]{0,160}if \(!voulues\) return erreurTraduite\("api\.params\.invalid", 400\);\s*const lecture = await lireMesZones/);
});

test("route : le seller_id écrit vient de la SESSION, jamais du corps", () => {
  assert.match(ROUTE_CODE, /insert\(ajouter\.map\(\(l\) => \(\{ \.\.\.l, seller_id: user\.id \}\)\)\)/);
  assert.match(ROUTE_CODE, /\.delete\(\)\s*\.eq\("seller_id", user\.id\)\s*\.in\("zone_id", retirer\)/);
  assert.match(ROUTE_CODE, /\.update\(\{ fee_htg: l\.fee_htg, delay_hours: l\.delay_hours, paused_until: l\.paused_until \}\)\s*\.eq\("seller_id", user\.id\)\s*\.eq\("zone_id", l\.zone_id\)/);
  assert.doesNotMatch(ROUTE_CODE, /body\.seller|seller_id: (?!user\.id)/);
});

test("route : les retraits PRÉCÈDENT les ajouts (remplacer ne bute pas sur le plafond)", () => {
  // La condition de chaque bloc est dans le motif : un `delete()` laissé dans le
  // fichier mais rendu inatteignable (`if (false)`) ne passe pas.
  assert.match(
    ROUTE_CODE,
    /if \(retirer\.length\) \{\s*const \{ error \} = await supabase\s*\.from\("zabelie_seller_service_zones"\)\s*\.delete\(\)[\s\S]{0,500}for \(const l of modifier\)[\s\S]{0,600}if \(ajouter\.length\) \{\s*const \{ error \} = await supabase\s*\.from\("zabelie_seller_service_zones"\)\s*\.insert\(/
  );
});

test("route : ZB158 revient en 422 avec un CODE, et le message de la base ne part jamais au client", () => {
  assert.match(ROUTE_CODE, /error\.message\.includes\("ZB158"\)[\s\S]{0,200}erreurTraduite\("api\.params\.invalid", 422,/);
  assert.match(ROUTE_CODE, /error\.message\.includes\("plafond"\) \? "service_zones_max" : "service_zones_zone"/);
  // `error.message` n'est jamais lu que pour y CHERCHER un code (`.includes(`), jamais renvoyé ni journalisé.
  assert.doesNotMatch(ROUTE_CODE, /error\.message(?!\.includes\()/);
  assert.equal(/error\.message(?!\.includes\()/.test("json({ error: error.message })"), true, "instrument : le motif voit une fuite");
});

// ───────────────────────── l'éditeur et la page ───────────────────────────────

const EDITEUR = readFileSync("components/service-zones-editor.tsx", "utf8");
const PAGE = readFileSync("app/tableau-de-bord/boutique/page.tsx", "utf8");

test("éditeur : composant client sans t() — les libellés arrivent en props", () => {
  assert.match(EDITEUR, /^"use client";/);
  assert.doesNotMatch(SANS_COMMENTAIRES(EDITEUR), /from "@\/lib\/i18n"/);
});

test("éditeur : la zone ajoutée est la plus profonde choisie, et un doublon ou le plafond bloquent l'ajout", () => {
  assert.match(EDITEUR, /const cible = zq \|\| zk \|\| zd;/);
  assert.match(EDITEUR, /const pleine = max !== null && choisies\.length >= max;/);
  assert.match(EDITEUR, /if \(!cible \|\| pleine \|\| choisies\.some\(\(c\) => c\.zoneId === cible\)\) return;/);
  assert.match(EDITEUR, /disabled=\{!cible \|\| pleine \|\| choisies\.some\(\(c\) => c\.zoneId === cible\)\}/);
});

test("éditeur : les codes de refus sont traduits en libellés, les autres en message générique", () => {
  assert.match(EDITEUR, /data\.code === "service_zones_max" \? labels\.errMax\s*: data\.code === "service_zones_zone" \? labels\.errZone\s*: data\.code === "service_zones_pause" \? labels\.errPause\s*: data\.code === "service_zones_valeur" \? labels\.errValue\s*: labels\.errGeneric/);
  // Le navigateur envoie « suspendre N jours » : jamais une date (l'horloge du client ne décide pas d'une pause).
  assert.match(EDITEUR, /method: "PUT"[\s\S]{0,200}JSON\.stringify\(\{\s*zones: choisies\.map\(\(c\) => \(\{\s*zoneId: c\.zoneId,\s*feeHtg: c\.fee === "" \? null : Number\(c\.fee\),\s*delayHours: c\.delay === "" \? null : Number\(c\.delay\),\s*pause: c\.pause,/);
  assert.doesNotMatch(SANS_COMMENTAIRES(EDITEUR), /new Date\(Date\.now|\.toISOString\(\)|setDate\(/);
});

test("page : la section n'apparaît que si les zones desservies sont lisibles (table présente)", () => {
  assert.match(PAGE, /const zonesService = svcErr \|\| zonesPourForm\.length === 0 \? null :/);
  assert.match(PAGE, /\{zonesService && \(\s*<section id="zones-service"/);
  assert.match(PAGE, /<ServiceZonesEditor[\s\S]{0,200}initial=\{zonesService\.initial\}[\s\S]{0,100}max=\{zonesService\.max\}/);
});

test("page : le plafond vient de la config en base, jamais d'une constante", () => {
  assert.match(PAGE, /\.from\("zabelie_service_zone_config"\)\.select\("max_zones"\)/);
  assert.doesNotMatch(SANS_COMMENTAIRES(PAGE + EDITEUR + ROUTE), /max\s*[=:]\s*20\b|\b20\s*zones/);
});

// ───────────────────────── la migration ───────────────────────────────────────

const MIGRATION = readFileSync("supabase/migrations/0158_zabelie_seller_service_zones.sql", "utf8");
const SQL = MIGRATION.replace(/^\s*--.*$/gm, "");

test("0158 : RLS dès la création sur les deux tables, préfixe zabelie_, aucun drop, aucun security definer", () => {
  for (const t of ["zabelie_service_zone_config", "zabelie_seller_service_zones"]) {
    assert.match(SQL, new RegExp(`create table ${t}\\b`));
    assert.match(SQL, new RegExp(`alter table ${t} enable row level security`));
  }
  assert.doesNotMatch(SQL, /\bdrop\b/i);
  assert.doesNotMatch(SQL, /security\s+definer/i);
});

test("0158 : la première instruction est le garde de rejeu", () => {
  assert.match(MIGRATION, /^select zabelie_migration_garde\('0158_zabelie_seller_service_zones\.sql'\);/);
});

test("0158 : l'écriture est liée à la session, le retrait aussi, et AUCUN update n'est accordé PAR CETTE MIGRATION (0164 en ajoute un, par colonne)", () => {
  assert.match(SQL, /for insert to authenticated\s+with check \(seller_id = auth\.uid\(\)\)/);
  assert.match(SQL, /for delete to authenticated\s+using \(seller_id = auth\.uid\(\)\)/);
  assert.match(SQL, /grant insert, delete on zabelie_seller_service_zones to authenticated/);
  assert.doesNotMatch(SQL, /grant[^;]*\bupdate\b[^;]*zabelie_seller_service_zones/);
  assert.doesNotMatch(SQL, /create policy [a-z_]+ on zabelie_seller_service_zones\s+for update/);
});

test("0158 : le plafond se lit dans la config, sérialisé par un verrou, et le garde est ZB158", () => {
  assert.match(SQL, /select max_zones into v_max from zabelie_service_zone_config where id/);
  assert.match(SQL, /perform pg_advisory_xact_lock\(hashtext\('zabelie_service_zones:' \|\| new\.seller_id::text\)\)/);
  assert.match(SQL, /if v_nb >= coalesce\(v_max, 20\) then/);
  assert.equal((SQL.match(/raise exception 'ZB158/g) ?? []).length, 2, "deux refus : zone fermée, plafond");
});

test("harnais : le test SQL et le test concurrent existent, et le second est lancé par run.sh", () => {
  assert.ok(readFileSync("supabase/tests/service_zones.test.sql", "utf8").includes("S4b"));
  assert.match(readFileSync("supabase/tests/run.sh", "utf8"), /bash "\$ROOT\/supabase\/tests\/service_zones_concurrent\.sh"/);
  assert.match(readFileSync("supabase/tests/service_zones_concurrent.sh", "utf8"), /select pg_sleep\(0\.4\); commit;/);
});
