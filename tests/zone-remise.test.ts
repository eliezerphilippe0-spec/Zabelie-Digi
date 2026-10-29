import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  niveauRemiseValide,
  parseZoneRemise,
  reserveZoneRemise,
  zoneCouverte,
  zoneEffective,
  type ZoneRemiseNoeud,
} from "../lib/zone-remise";
import { zonesRecouvrantes } from "../lib/zones";
import { loadRoute } from "./helpers/route-harness";

/* Un petit arbre : deux départements, deux communes dans le premier (l'une avec
 * deux quartiers), une commune dans le second.
 *
 *   OU ─ Delmas ─ Delmas 33
 *      │        └ Delmas 65
 *      └ Tabarre
 *   ND ─ Cap
 */
const Z: ZoneRemiseNoeud[] = [
  { id: "ou", parent_id: null, level: "depatman" },
  { id: "delmas", parent_id: "ou", level: "komin" },
  { id: "d33", parent_id: "delmas", level: "katye" },
  { id: "d65", parent_id: "delmas", level: "katye" },
  { id: "tabarre", parent_id: "ou", level: "komin" },
  { id: "nd", parent_id: null, level: "depatman" },
  { id: "cap", parent_id: "nd", level: "komin" },
];

test("parseZoneRemise : un identifiant bien formé (normalisé en minuscules), ou rien", () => {
  const id = "5B1D6C0E-3A54-4F6E-9D2A-0C7E3A9B8F10";
  assert.equal(parseZoneRemise(id), id.toLowerCase());
  assert.equal(parseZoneRemise(id.toLowerCase()), id.toLowerCase());
  for (const mauvais of [undefined, null, 12, {}, [id], "", "Delmas", `${id} `, ` ${id}`, `${id}x`, id.slice(1), id.replaceAll("-", "")]) {
    assert.equal(parseZoneRemise(mauvais), null, JSON.stringify(mauvais));
  }
});

test("niveauRemiseValide : commune ou quartier, jamais le département seul", () => {
  assert.equal(niveauRemiseValide("komin"), true);
  assert.equal(niveauRemiseValide("katye"), true);
  assert.equal(niveauRemiseValide("depatman"), false);
  assert.equal(niveauRemiseValide(""), false);
});

test("zoneCouverte : la zone, un ancêtre ou un descendant déclaré recouvre — un quartier frère non", () => {
  assert.equal(zoneCouverte(Z, ["delmas"], "delmas"), true, "même zone");
  assert.equal(zoneCouverte(Z, ["ou"], "d33"), true, "le vendeur dessert tout le département");
  assert.equal(zoneCouverte(Z, ["delmas"], "d33"), true, "toute la commune");
  assert.equal(zoneCouverte(Z, ["d33"], "delmas"), true, "il dessert un quartier de la commune choisie");
  assert.equal(zoneCouverte(Z, ["d33"], "d65"), false, "un quartier frère ne recouvre pas");
  assert.equal(zoneCouverte(Z, ["tabarre"], "delmas"), false, "une commune sœur non plus");
  assert.equal(zoneCouverte(Z, ["nd"], "delmas"), false, "un autre département");
  assert.equal(zoneCouverte(Z, [], "delmas"), false, "rien déclaré : pas de couverture");
});

test("zoneCouverte est EXACTEMENT zonesRecouvrantes de lib/zones, pour toutes les paires", () => {
  // Deux implémentations du même arbre : celle-ci doit rester alignée sur l'autre.
  for (const dest of Z) {
    const recouvrantes = new Set(zonesRecouvrantes(Z, dest.id));
    for (const declaree of Z) {
      assert.equal(
        zoneCouverte(Z, [declaree.id], dest.id),
        recouvrantes.has(declaree.id),
        `déclarée ${declaree.id} → destination ${dest.id}`,
      );
    }
  }
});

test("reserveZoneRemise : seulement quand le vendeur A déclaré des zones et qu'aucune ne recouvre", () => {
  assert.equal(reserveZoneRemise(Z, ["tabarre"], "d33"), true, "il livre ailleurs : réserve");
  assert.equal(reserveZoneRemise(Z, ["ou"], "d33"), false, "couvert : pas de réserve");
  assert.equal(reserveZoneRemise(Z, [], "d33"), false, "RIEN déclaré = on ne sait pas : jamais de réserve inventée");
  assert.equal(reserveZoneRemise(Z, ["tabarre"], null), false, "pas de destination : rien à dire");
});

test("zoneEffective : la plus profonde choisie, mais jamais un département seul", () => {
  assert.equal(zoneEffective(Z, "ou", "", ""), null, "département seul");
  assert.equal(zoneEffective(Z, "", "", ""), null);
  assert.equal(zoneEffective(Z, "ou", "delmas", ""), "delmas");
  assert.equal(zoneEffective(Z, "ou", "delmas", "d33"), "d33");
  assert.equal(zoneEffective(Z, "ou", "inconnue", ""), null, "identifiant inconnu : rien, pas de repli sur le parent");
});

test("un cycle dans les données termine : aucune boucle infinie", () => {
  const cycle: ZoneRemiseNoeud[] = [
    { id: "a", parent_id: "b", level: "komin" },
    { id: "b", parent_id: "a", level: "komin" },
  ];
  assert.equal(zoneCouverte(cycle, ["x"], "a"), false);
});

/* ── Le lecteur serveur des libellés (zonesDesCommandes) ─────────────────────── */

type Ligne = { order_id: string; zone_id: string };
function lecteur(options: { lignes?: Ligne[]; erreur?: { code: string; message: string }; zonesActives?: Record<string, unknown>[] }) {
  const requetes: string[] = [];
  const base = {
    from(table: string) {
      requetes.push(table);
      const chaine = { select: () => chaine, in: async () => ({ data: options.lignes ?? [], error: options.erreur ?? null }) };
      return chaine;
    },
  };
  const warns: unknown[][] = [];
  const mod = loadRoute("lib/zone-remise-serveur.ts", {
    "@/lib/supabase/server": { createClient: async () => base },
    "@/lib/product-media": { isMissingTable: (e: { code?: string } | null) => e?.code === "42P01" || e?.code === "PGRST205" },
    "@/lib/zones": {
      getZonesActives: async () => options.zonesActives ?? [],
      libelleZone: (z: { label_fr: string }) => z.label_fr,
      cheminZone: (zones: { id: string; parent_id: string | null }[], id: string) => {
        const res: unknown[] = [];
        for (let c = zones.find((z) => z.id === id); c; c = c.parent_id ? zones.find((z) => z.id === c!.parent_id) : undefined) res.unshift(c);
        return res;
      },
    },
  }, {}, { console: { warn: (...a: unknown[]) => warns.push(a), error: () => {} } });
  return { mod, requetes, warns, base };
}
const ZONES_ACTIVES = [
  { id: "ou", parent_id: null, level: "depatman", label_fr: "Ouest" },
  { id: "delmas", parent_id: "ou", level: "komin", label_fr: "Delmas" },
  { id: "d33", parent_id: "delmas", level: "katye", label_fr: "Delmas 33" },
];

test("zonesDesCommandes : le chemin « Département › Commune › Quartier » par commande", async () => {
  const l = lecteur({ lignes: [{ order_id: "o1", zone_id: "d33" }, { order_id: "o2", zone_id: "delmas" }], zonesActives: ZONES_ACTIVES });
  const m = await (l.mod.zonesDesCommandes as unknown as (...a: unknown[]) => Promise<Map<string, string>>)(l.base, ["o1", "o2"], "fr");
  assert.deepEqual(JSON.parse(JSON.stringify([...m.entries()])), [["o1", "Ouest › Delmas › Delmas 33"], ["o2", "Ouest › Delmas"]]);
});

test("zonesDesCommandes : aucune commande → aucune requête ; table absente → carte vide sans bruit ; autre erreur → journalisée", async () => {
  const vide = lecteur({});
  assert.equal((await (vide.mod.zonesDesCommandes as unknown as (...a: unknown[]) => Promise<Map<string, string>>)(vide.base, [], "fr")).size, 0);
  assert.deepEqual(vide.requetes, [], "aucune lecture pour une liste vide");

  const absente = lecteur({ erreur: { code: "42P01", message: "relation does not exist" } });
  assert.equal((await (absente.mod.zonesDesCommandes as unknown as (...a: unknown[]) => Promise<Map<string, string>>)(absente.base, ["o1"], "fr")).size, 0);
  assert.equal(absente.warns.length, 0, "table absente = code déployé avant la migration, pas une anomalie");

  const panne = lecteur({ erreur: { code: "08006", message: "connection lost" } });
  assert.equal((await (panne.mod.zonesDesCommandes as unknown as (...a: unknown[]) => Promise<Map<string, string>>)(panne.base, ["o1"], "fr")).size, 0);
  assert.equal(panne.warns.length, 1, "une vraie panne se journalise : le silence se lirait « aucune zone »");
});

test("zonesDesCommandes : une zone fermée depuis la commande n'est pas affichée, jamais un chemin inventé", async () => {
  const l = lecteur({ lignes: [{ order_id: "o1", zone_id: "fermee" }], zonesActives: ZONES_ACTIVES });
  const m = await (l.mod.zonesDesCommandes as unknown as (...a: unknown[]) => Promise<Map<string, string>>)(l.base, ["o1"], "fr");
  assert.equal(m.size, 0);
});

/* ── Les structures qui COMMANDENT, pas les libellés ─────────────────────────── */

const lire = (f: string) => readFileSync(f, "utf8");

test("le bouton d'achat n'envoie la zone que lorsque le sélecteur existe, et elle part avec le corps de l'intention", () => {
  const src = lire("components/buy-button.tsx");
  assert.match(src, /deliveryZoneId:\s*zoneRemise\s*\?\s*deliveryZoneId\s*\?\?\s*undefined\s*:\s*undefined/);
  // Le corps (`body`) est ce que l'identifiant d'intention sérialise : une zone changée est une intention changée.
  assert.match(src, /const body = \{[\s\S]{0,1800}deliveryZoneId:[\s\S]{0,200}\};\s*const intent = JSON\.stringify\(body\)/);
  assert.match(src, /<ZoneRemise[\s>]/);
});

test("la fiche produit ne charge la zone de remise que pour un objet physique", () => {
  const src = lire("app/produit/[slug]/page.tsx");
  assert.match(src, /const zoneRemise = pickByKind\(product\.kind, \{ file: false, service: false, physical: true \}\)\s*&&\s*isSupabaseConfigured\(\)\s*\?\s*await chargerZoneRemise\(/);
});

test("le composant client ne lit ni la langue ni t() : tous les libellés arrivent en props", () => {
  const src = lire("components/zone-remise.tsx");
  assert.doesNotMatch(src, /from "@\/lib\/i18n(-server)?"/);
  assert.doesNotMatch(src, /\bt\(/);
  assert.match(src, /^"use client";/);
});

test("le garde de la base est la source de vérité : la route ne revérifie que la FORME de l'identifiant", () => {
  const src = lire("app/api/checkout/route.ts");
  assert.match(src, /const deliveryZoneId = parseZoneRemise\(deliveryZoneInput\);\s*if \(deliveryZoneId && isTrackedStockKind\(product\.kind\)\)/);
  // Aucun `return` dans le bloc d'écriture : l'échec ne peut pas devenir un refus de paiement.
  const bloc = src.slice(src.indexOf("const deliveryZoneId = parseZoneRemise"), src.indexOf("if (recipient) {"));
  assert.doesNotMatch(bloc, /\breturn\b/, "l'écriture de la zone ne refuse jamais un paiement");
});
