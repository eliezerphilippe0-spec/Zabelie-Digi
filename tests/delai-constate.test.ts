import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { delaiAffichable, lireDelaiConstate, uniteDelai } from "../lib/delai-constate";
import { CLE_SANS_ZONE, grouperParZone } from "../lib/zone-ventes";
import { DICT, LANGS } from "../lib/i18n";
import { loadRoute } from "./helpers/route-harness";

const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const sansCommentairesSql = (s: string) => s.replace(/--.*$/gm, "");
const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// ───────────── lireDelaiConstate : la forme de la réponse de la base ─────────────

test("lireDelaiConstate : une ligne valide, médiane présente ou NULL sous le seuil", () => {
  assert.deepEqual(json(lireDelaiConstate([{ nb: 7, mediane_heures: 30, seuil: 5 }])), { nb: 7, medianeHeures: 30, seuil: 5 });
  assert.deepEqual(json(lireDelaiConstate([{ nb: 2, mediane_heures: null, seuil: 5 }])), { nb: 2, medianeHeures: null, seuil: 5 });
  assert.deepEqual(json(lireDelaiConstate({ nb: 0, mediane_heures: null, seuil: 5 })), { nb: 0, medianeHeures: null, seuil: 5 });
});

test("lireDelaiConstate : toute forme inattendue rend null — on n'affiche pas un chiffre dont on ignore l'origine", () => {
  for (const mauvais of [
    null, undefined, "30", 30, [], [null], [{}],
    [{ nb: -1, mediane_heures: null, seuil: 5 }],
    [{ nb: 1.5, mediane_heures: null, seuil: 5 }],
    [{ nb: "7", mediane_heures: 30, seuil: 5 }],
    [{ nb: 7, mediane_heures: 0, seuil: 5 }],          // zéro heure : la base garantit ≥ 1
    [{ nb: 7, mediane_heures: 30.5, seuil: 5 }],
    [{ nb: 7, mediane_heures: "30", seuil: 5 }],
    [{ nb: 7, mediane_heures: 30, seuil: 0 }],
    [{ nb: 7, mediane_heures: 30 }],                    // seuil absent
  ]) {
    assert.equal(lireDelaiConstate(mauvais), null, JSON.stringify(mauvais));
  }
});

// ───────────── delaiAffichable : ce qui est MONTRÉ aux acheteurs ─────────────

test("delaiAffichable : la médiane seulement quand la base l'a rendue ET que l'échantillon atteint le seuil", () => {
  assert.equal(delaiAffichable(null), null);
  assert.equal(delaiAffichable({ nb: 2, medianeHeures: null, seuil: 5 }), null, "sous le seuil : rien");
  assert.equal(delaiAffichable({ nb: 5, medianeHeures: 30, seuil: 5 }), 30, "au seuil : affiché");
  assert.equal(delaiAffichable({ nb: 4, medianeHeures: 30, seuil: 5 }), null, "médiane avec un échantillon sous le seuil = incohérence : rien");
});

test("uniteDelai : en heures jusqu'à 48 h exclu, en jours (arrondis) au-delà", () => {
  assert.deepEqual(uniteDelai(1), { cle: "zr.unit.hours", n: 1 });
  assert.deepEqual(uniteDelai(47), { cle: "zr.unit.hours", n: 47 });
  assert.deepEqual(uniteDelai(48), { cle: "zr.unit.days", n: 2 });
  assert.deepEqual(uniteDelai(71), { cle: "zr.unit.days", n: 3 });
});

// ───────────── delaiConstateVendeur : fail-closed, service-role, identité ─────────────

function chargerLecteur(rpc: (nom: string, args: unknown) => Promise<{ data: unknown; error: { message: string } | null }>, configuree = true) {
  const appels: { nom: string; args: unknown }[] = [];
  const avertissements: string[] = [];
  const mod = loadRoute("lib/delai-constate.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: (nom: string, args: unknown) => { appels.push({ nom, args }); return rpc(nom, args); } }) },
    "@/lib/products": { isSupabaseConfigured: () => configuree },
    // Les fonctions pures sont celles du vrai module : on ne les remplace pas.
  }, {}, { console: { warn: (m: string) => avertissements.push(m), log() {}, error() {} } });
  return { delaiConstateVendeur: mod.delaiConstateVendeur as unknown as (id: unknown) => Promise<unknown>, appels, avertissements };
}

test("delaiConstateVendeur : appelle la RPC avec l'identifiant du vendeur, rend la ligne lue", async () => {
  const { delaiConstateVendeur, appels } = chargerLecteur(async () => ({ data: [{ nb: 6, mediane_heures: 26, seuil: 5 }], error: null }));
  assert.deepEqual(json(await delaiConstateVendeur("v-1")), { nb: 6, medianeHeures: 26, seuil: 5 });
  assert.deepEqual(json(appels), [{ nom: "zabelie_delai_constate", args: { p_seller: "v-1" } }]);
});

test("delaiConstateVendeur : erreur de base, exception ou réponse bancale → null ET une trace (l'absence doit être un signal)", async () => {
  for (const rpc of [
    async () => ({ data: null, error: { message: "function does not exist" } }),
    async () => { throw new Error("réseau"); },
    async () => ({ data: [{ nb: "x" }], error: null }),
  ]) {
    const { delaiConstateVendeur, avertissements } = chargerLecteur(rpc);
    assert.equal(await delaiConstateVendeur("v-1"), null);
    assert.equal(avertissements.length, 1, "un échec silencieux se lirait comme « pas assez de commandes »");
    assert.match(avertissements[0], /^\[delai\]/);
  }
});

test("delaiConstateVendeur : sans identifiant ou sans base configurée, aucun appel", async () => {
  for (const [id, configuree] of [[null, true], [undefined, true], ["", true], ["v-1", false]] as const) {
    const { delaiConstateVendeur, appels } = chargerLecteur(async () => ({ data: [], error: null }), configuree);
    assert.equal(await delaiConstateVendeur(id), null);
    assert.equal(appels.length, 0);
  }
});

// ───────────── grouperParZone : les tournées du vendeur ─────────────

const v = (id: string) => ({ order_id: id });

test("grouperParZone : un groupe par zone, tri alphabétique, sans-zone en dernier, ordre d'entrée conservé", () => {
  const zones = new Map([
    ["a", "Ouest › Pétion-Ville"], ["b", "Ouest › Delmas › Delmas 33"], ["c", "Ouest › Pétion-Ville"],
    ["d", "Ouest › Delmas"],
  ]);
  const { groupes, afficherTitres } = grouperParZone([v("a"), v("x"), v("b"), v("c"), v("d")], zones);
  assert.equal(afficherTitres, true);
  assert.deepEqual(groupes.map((g) => g.libelle), ["Ouest › Delmas", "Ouest › Delmas › Delmas 33", "Ouest › Pétion-Ville", null]);
  assert.deepEqual(groupes[2].items.map((i) => i.order_id), ["a", "c"], "le plus ancien d'abord, comme dans la liste d'origine");
  assert.equal(groupes[3].cle, CLE_SANS_ZONE);
  assert.deepEqual(groupes[3].items.map((i) => i.order_id), ["x"]);
});

test("grouperParZone : aucune commande perdue ni dupliquée", () => {
  const items = ["a", "b", "c", "d", "e", "f"].map(v);
  const zones = new Map([["a", "Z1"], ["b", "Z2"], ["c", "Z1"], ["e", "Z3"]]);
  const { groupes } = grouperParZone(items, zones);
  const sortis = groupes.flatMap((g) => g.items.map((i) => i.order_id)).sort();
  assert.deepEqual(sortis, ["a", "b", "c", "d", "e", "f"]);
});

test("grouperParZone : un seul groupe (une zone, ou aucune) → pas de titres, la liste d'avant", () => {
  assert.equal(grouperParZone([v("a"), v("b")], new Map([["a", "Z1"], ["b", "Z1"]])).afficherTitres, false);
  assert.equal(grouperParZone([v("a"), v("b")], new Map()).afficherTitres, false);
  assert.equal(grouperParZone([], new Map()).afficherTitres, false);
  assert.equal(grouperParZone([v("a"), v("b")], new Map([["a", "Z1"]])).afficherTitres, true, "une zone + des commandes sans zone = deux groupes");
});

test("grouperParZone : le tri suit la langue (accents inclus), pas l'ordre des codes", () => {
  const zones = new Map([["a", "Étang"], ["b", "Zèbre"], ["c", "Ancien"]]);
  const { groupes } = grouperParZone([v("a"), v("b"), v("c")], zones, "fr");
  assert.deepEqual(groupes.map((g) => g.libelle), ["Ancien", "Étang", "Zèbre"]);
});

// ───────────── les écrans : ce qui COMMANDE ─────────────

test("fiche produit : le délai constaté ne se charge que pour un physique, et n'est montré que si la base a rendu une médiane", () => {
  const src = sansCommentairesTs(lire("app/produit/[slug]/page.tsx"));
  assert.match(src, /pickByKind\(product\.kind, \{ file: false, service: false, physical: true \}\) && isSupabaseConfigured\(\)\s*\?\s*await delaiConstateVendeur\(product\.creatorId\)\s*:\s*null/);
  assert.match(src, /const delaiMontre = delaiAffichable\(delaiConstate\);/);
  assert.match(src, /const delaiTexte = delaiMontre !== null\s*\?/);
  assert.match(src, /\{delaiTexte !== null && delaiConstate && \([\s\S]{0,200}"product\.measured\.delay"/);
});

test("fiche produit : la ligne dit d'où vient le chiffre (mesuré, pas un engagement) dans les quatre langues", () => {
  for (const lang of LANGS) {
    const d = DICT[lang];
    assert.match(d["product.measured.delay"], /\{delay\}/, lang);
    assert.match(d["product.measured.delay"], /\{n\}/, lang);
    assert.ok(d["product.measured.note"].length > 20, lang);
    assert.match(d["sales.measured.shown"], /\{delay\}[\s\S]*\{n\}|\{n\}[\s\S]*\{delay\}/, lang);
    assert.match(d["sales.measured.pending"], /\{n\}[\s\S]*\{seuil\}/, lang);
    assert.match(d["sales.zone.group.count"], /\{n\}/, lang);
    assert.match(d["sales.zone.group.count.one"], /\{n\}/, lang);
  }
});

test("Mes ventes : l'identité du délai vient de la SESSION, la liste est rangée par zone, les titres suivent la décision de grouperParZone", () => {
  const src = sansCommentairesTs(lire("app/mes-ventes/page.tsx"));
  assert.match(src, /const delai = await delaiConstateVendeur\(user\.id\);/);
  assert.doesNotMatch(src, /searchParams/);
  assert.match(src, /const \{ groupes, afficherTitres \} = grouperParZone\(ventes, zoneParCommande,/);
  assert.match(src, /\{groupes\.map\(\(g, i\) => \(/);
  assert.match(src, /\{afficherTitres && \(\s*<h2 id=\{`zone-groupe-\$\{i\}`\}/);
  assert.match(src, /\{g\.items\.map\(\(v\) => \(/);
  // Les deux textes du bandeau vendeur : montré / pas encore, décidés par delaiAffichable.
  assert.match(src, /delaiTexte !== null\s*\?\s*t\(lang, "sales\.measured\.shown"/);
  assert.match(src, /: t\(lang, "sales\.measured\.pending", \{ n: String\(delai\.nb\), seuil: String\(delai\.seuil\) \}\)/);
});

test("lecteur : service-role seulement, aucune donnée journalisée", () => {
  const src = sansCommentairesTs(lire("lib/delai-constate.ts"));
  assert.match(src, /createAdminClient\(\)\.rpc\("zabelie_delai_constate", \{ p_seller: sellerId \}\)/);
  assert.doesNotMatch(src, /createClient\b/);
  for (const m of src.matchAll(/console\.(\w+)\(([^)]*)\)/g)) {
    assert.doesNotMatch(m[2], /\bdata\b|sellerId|lu\b/, `journalise une donnée : ${m[0]}`);
  }
});

// ───────────── la migration : ni argent, ni écriture hors config ─────────────

/* La sonde de présence est recopiée en ENTIER (chaque migration qui ajoute un `.rpc()` la redéfinit) :
 * ses libellés citent « INSERT UPDATE DELETE », « truncate »… sans rien écrire. On la retire avant de
 * chercher des écritures, et on vérifie qu'on n'a retiré QUE la sonde (une borne qui avale la fonction
 * du délai rendrait les assertions suivantes vertes à vide). */
const SQL_BRUT = sansCommentairesSql(lire("supabase/migrations/0165_zabelie_delai_constate.sql"));
const DEBUT_SONDE = SQL_BRUT.indexOf("create or replace function zabelie_objets_requis()");
const FIN_SONDE = SQL_BRUT.indexOf("\n$$;", DEBUT_SONDE);
assert.ok(DEBUT_SONDE > 0 && FIN_SONDE > DEBUT_SONDE, "bornes de la sonde introuvables");
const SQL = SQL_BRUT.slice(0, DEBUT_SONDE) + SQL_BRUT.slice(FIN_SONDE + 4);
assert.match(SQL, /create function zabelie_delai_constate\(p_seller uuid\)/, "la fonction du délai doit rester dans le texte inspecté");
assert.match(SQL, /0165 OK — delai constate pose/, "les post-conditions doivent rester dans le texte inspecté");

test("0165 : aucune écriture sauf les deux clés de config ; rien sur l'argent", () => {
  assert.doesNotMatch(SQL, /\b(update|delete|truncate|drop)\b/i);
  const inserts = [...SQL.matchAll(/\binsert\s+into\s+(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual(inserts, ["zabelie_fulfillment_limits"]);
  for (const t of ["escrow_entries", "wallets", "wallet_transactions", "payments", "orders", "zabelie_fulfillment "]) {
    assert.doesNotMatch(SQL, new RegExp(`\\b(insert\\s+into|update)\\s+${t.trim()}\\b`, "i"), t);
  }
});

test("0165 : le seuil et la fenêtre viennent de la config et COMMANDENT le calcul", () => {
  assert.match(SQL, /select coalesce\(max\(value\), 5\) into v_min\s+from zabelie_fulfillment_limits where key = 'delay_min_samples'/);
  assert.match(SQL, /select coalesce\(max\(value\), 180\) into v_days\s+from zabelie_fulfillment_limits where key = 'delay_window_days'/);
  assert.match(SQL, /f\.received_at >= now\(\) - make_interval\(days => v_days\)/);
  assert.match(SQL, /case when count\(\*\) >= v_min\s+then greatest\(round\(percentile_cont\(0\.5\) within group \(order by heures\)\)::integer, 1\)/);
});

test("0165 : les réceptions automatiques sont exclues, et la fonction est en lecture seule, retirée aux rôles client", () => {
  assert.match(SQL, /and not f\.auto_received/);
  assert.match(SQL, /language plpgsql\s+stable\s+security definer/);
  assert.match(SQL, /revoke all on function zabelie_delai_constate\(uuid\) from public, anon, authenticated;/);
  assert.match(SQL, /grant execute on function zabelie_delai_constate\(uuid\) to service_role;/);
});
