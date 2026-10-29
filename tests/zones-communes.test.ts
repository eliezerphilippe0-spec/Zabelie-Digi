import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zoneDepuisTexte } from "../lib/proximite";
import { slugifierZone, type Zone } from "../lib/zones";

/**
 * Les communes des neuf autres départements (0159, demande directe du porteur,
 * 2026-10-29). Données de l'AGENT, non vérifiées contre une source ouverte (le
 * réseau de la session refusait Wikipédia) : ces tests ne prouvent pas que la
 * liste est exacte, ils prouvent qu'elle est COHÉRENTE — effectifs, forme,
 * fermeture, et qu'elle ne rend pas ambiguë la reconnaissance de lieu.
 */
const BRUT = readFileSync("supabase/migrations/0159_zabelie_zones_communes.sql", "utf8");
const SQL = BRUT.replace(/^\s*--.*$/gm, "");

const LIGNES = [...SQL.matchAll(/^\s*\('(HT-[A-Z]{2})', '((?:[^']|'')+)', '((?:[^']|'')+)', '((?:[^']|'')+)'\),?$/gm)]
  .map((m) => ({ code: m[1], slug: m[2], kr: m[3].replace(/''/g, "'"), fr: m[4].replace(/''/g, "'") }));

const ATTENDU: Record<string, number> = { "HT-AR": 15, "HT-CE": 12, "HT-GA": 12, "HT-NI": 11, "HT-NE": 13, "HT-NO": 10, "HT-OU": 20, "HT-SD": 18, "HT-SE": 10 };

test("0159 : 121 communes, au bon effectif par département", () => {
  assert.equal(LIGNES.length, 121);
  for (const [code, n] of Object.entries(ATTENDU)) {
    assert.equal(LIGNES.filter((l) => l.code === code).length, n, `${code} : effectif`);
  }
  assert.equal(LIGNES.some((l) => l.code === "HT-ND"), false, "le Nord est déjà en base, 0159 n'y touche pas");
});

test("0159 : le slug est celui que le code calculerait (SQL et TS d'accord)", () => {
  for (const l of LIGNES) assert.equal(l.slug, slugifierZone(l.fr), `${l.code} ${l.fr}`);
});

test("0159 : aucun doublon de slug dans un département, aucun libellé vide", () => {
  for (const code of Object.keys(ATTENDU)) {
    const slugs = LIGNES.filter((l) => l.code === code).map((l) => l.slug);
    assert.equal(new Set(slugs).size, slugs.length, `${code} : doublon de slug`);
  }
  for (const l of LIGNES) {
    assert.ok(l.kr.trim().length > 1 && l.fr.trim().length > 1, `${l.code} ${l.slug} : libellé vide`);
  }
});

test("0159 : toutes les communes entrent FERMÉES, et la migration le vérifie avant de se déclarer faite", () => {
  assert.match(SQL, /select d\.id, 'komin', v\.slug, v\.label_kr, v\.label_fr, false\s+from \(values/);
  assert.match(SQL, /if v_ouvertes <> 0 then\s+raise exception '0159 KO/);
  assert.match(SQL, /if v_total <> 140 then\s+raise exception '0159 KO/);
});

test("0159 : le garde de rejeu d'abord, aucune suppression, aucune fonction, aucun droit", () => {
  assert.match(BRUT, /^select zabelie_migration_garde\('0159_zabelie_zones_communes\.sql'\);/);
  assert.doesNotMatch(SQL, /\b(drop|delete|truncate|grant|revoke|create function|alter table)\b/i);
});

test("0159 : la provenance non vérifiée est écrite dans la migration, pas seulement dans le rapport", () => {
  assert.match(BRUT, /PROVENANCE : NON VÉRIFIÉE CONTRE UNE SOURCE OUVERTE/);
  assert.match(BRUT, /EN ATTENTE DE RELECTURE\s+-- NATIVE/);
  assert.match(BRUT, /146 communes/);
});

// ── La reconnaissance de lieu sur la liste complète ─────────────────────────

const NORD: [string, string, string][] = [
  ["acul-du-nord", "Akil dinò", "Acul-du-Nord"], ["bahon", "Bawon", "Bahon"], ["bas-limbe", "Ba Lenbe", "Bas-Limbé"],
  ["borgne", "Bòny", "Borgne"], ["cap-haitien", "Okap", "Cap-Haïtien"], ["dondon", "Dondon", "Dondon"],
  ["grande-riviere-du-nord", "Grann Rivyè dinò", "Grande-Rivière-du-Nord"], ["la-victoire", "Lavictwa", "La Victoire"],
  ["limbe", "Lenbe", "Limbé"], ["limonade", "Limonad", "Limonade"], ["milot", "Milo", "Milot"], ["pignon", "Pinyon", "Pignon"],
  ["pilate", "Pilat", "Pilate"], ["plaine-du-nord", "Plèn dinò", "Plaine-du-Nord"], ["plaisance", "Plezans", "Plaisance"],
  ["port-margot", "Pò Mago", "Port-Margot"], ["quartier-morin", "Katye Moren", "Quartier-Morin"], ["ranquitte", "Rankit", "Ranquitte"],
  ["saint-raphael", "Sen Rafayèl", "Saint-Raphaël"],
];
const DEPS: [string, string, string][] = [
  ["HT-AR", "Latibonit", "Artibonite"], ["HT-CE", "Sant", "Centre"], ["HT-GA", "Grandans", "Grand'Anse"], ["HT-NI", "Nip", "Nippes"],
  ["HT-ND", "Nò", "Nord"], ["HT-NE", "Nòdès", "Nord-Est"], ["HT-NO", "Nòdwès", "Nord-Ouest"], ["HT-OU", "Lwès", "Ouest"],
  ["HT-SD", "Sid", "Sud"], ["HT-SE", "Sidès", "Sud-Est"],
];
const ZONES: Zone[] = [
  ...DEPS.map(([code, kr, fr]): Zone => ({ id: `d-${code}`, parent_id: null, level: "depatman", slug: slugifierZone(fr), label_kr: kr, label_fr: fr, label_en: null, label_es: null })),
  ...NORD.map(([slug, kr, fr]): Zone => ({ id: `k-${slug}`, parent_id: "d-HT-ND", level: "komin", slug, label_kr: kr, label_fr: fr, label_en: null, label_es: null })),
  ...LIGNES.map((l): Zone => ({ id: `k-${l.code}-${l.slug}`, parent_id: `d-${l.code}`, level: "komin", slug: l.slug, label_kr: l.kr, label_fr: l.fr, label_en: null, label_es: null })),
];

test("reconnaissance : chaque commune des 140 est retrouvée par son nom français ET par son nom kreyòl", () => {
  assert.equal(ZONES.filter((z) => z.level === "komin").length, 140);
  const ratees: string[] = [];
  for (const z of ZONES.filter((x) => x.level === "komin")) {
    for (const nom of [z.label_fr, z.label_kr]) {
      const trouvee = zoneDepuisTexte(ZONES, nom);
      if (trouvee?.id !== z.id) ratees.push(`${nom} → ${trouvee?.id ?? "null"} (attendu ${z.id})`);
    }
  }
  assert.deepEqual(ratees, [], `communes mal reconnues :\n${ratees.join("\n")}`);
});

test("reconnaissance : les grandes villes de la diaspora, dans une phrase, dans les deux langues", () => {
  const id = (t: string) => zoneDepuisTexte(ZONES, t)?.id ?? null;
  assert.equal(id("Je suis à Pétion-Ville"), "k-HT-OU-petion-ville");
  assert.equal(id("m ap viv Petyonvil"), "k-HT-OU-petion-ville");
  assert.equal(id("Pòtoprens"), "k-HT-OU-port-au-prince");
  assert.equal(id("livraison à Delmas"), "k-HT-OU-delmas");
  assert.equal(id("nan Kafou"), "k-HT-OU-carrefour");
  assert.equal(id("Les Cayes"), "k-HT-SD-les-cayes");
  assert.equal(id("Jakmèl"), "k-HT-SE-jacmel");
  assert.equal(id("Gonayiv"), "k-HT-AR-gonaives");
});

test("reconnaissance : connus-négatifs — un lieu qui n'existe pas, et un département seul restent ce qu'ils sont", () => {
  assert.equal(zoneDepuisTexte(ZONES, "Montréal"), null);
  assert.equal(zoneDepuisTexte(ZONES, "Miami"), null);
  assert.equal(zoneDepuisTexte(ZONES, "Ouest")?.id, "d-HT-OU", "un département nommé seul est reconnu comme département");
});
