import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lienCatalogueZone, lienPartageWhatsApp } from "../lib/zone-partage";
import { parseCatalogueSearch } from "../lib/catalogue-query";
import { DICT, LANGS, t } from "../lib/i18n";
import type { Zone } from "../lib/zones";

const sansCommentairesTs = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const lire = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

const zone = (id: string, parent_id: string | null, level: Zone["level"], fr: string): Zone =>
  ({ id, parent_id, level, slug: id, label_kr: fr, label_fr: fr, label_en: null, label_es: null }) as Zone;

const OU = "b0000000-0000-4000-8000-00000000000b";
const DELMAS = "d0000000-0000-4000-8000-0000000000d2";
const D33 = "d0000000-0000-4000-8000-0000000000e1";
const ZONES: Zone[] = [zone(OU, null, "depatman", "Ouest"), zone(DELMAS, OU, "komin", "Delmas"), zone(D33, DELMAS, "katye", "Delmas 33")];

// ───────────── le lien ─────────────

test("lienCatalogueZone : département, commune ou quartier → l'adresse absolue du catalogue filtré", () => {
  assert.equal(lienCatalogueZone("https://zabelie.example", ZONES, ZONES[0]), `https://zabelie.example/catalogue?zd=${OU}`);
  assert.equal(lienCatalogueZone("https://zabelie.example", ZONES, ZONES[1]), `https://zabelie.example/catalogue?zd=${OU}&zk=${DELMAS}`);
  assert.equal(lienCatalogueZone("https://zabelie.example", ZONES, ZONES[2]), `https://zabelie.example/catalogue?zd=${OU}&zk=${DELMAS}&zq=${D33}`);
});

test("lienCatalogueZone : les barres finales de la base sont retirées, une zone hors liste n'a pas de lien", () => {
  assert.equal(lienCatalogueZone("https://zabelie.example///", ZONES, ZONES[1]), `https://zabelie.example/catalogue?zd=${OU}&zk=${DELMAS}`);
  const orpheline = zone("zzzzzzzz-0000-4000-8000-000000000000", null, "komin", "Fantôme");
  assert.equal(lienCatalogueZone("https://zabelie.example", ZONES, orpheline), null, "pas de lien plutôt qu'un lien qui filtrerait à contresens");
});

test("lienCatalogueZone : AUCUN paramètre de suivi — seulement les trois identifiants de zone", () => {
  for (const z of ZONES) {
    const lien = lienCatalogueZone("https://zabelie.example", ZONES, z)!;
    for (const cle of new URL(lien).searchParams.keys()) assert.ok(["zd", "zk", "zq"].includes(cle), `paramètre inattendu : ${cle}`);
  }
});

test("lienCatalogueZone : la page relit EXACTEMENT la zone partagée (aller-retour par l'analyseur du catalogue)", () => {
  for (const [z, attendu] of [[ZONES[0], { zd: OU }], [ZONES[1], { zd: OU, zk: DELMAS }], [ZONES[2], { zd: OU, zk: DELMAS, zq: D33 }]] as const) {
    const lien = new URL(lienCatalogueZone("https://zabelie.example", ZONES, z)!);
    const lu = parseCatalogueSearch(Object.fromEntries(lien.searchParams));
    assert.equal(lu.zd, attendu.zd);
    assert.equal(lu.zk, "zk" in attendu ? attendu.zk : undefined);
    assert.equal(lu.zq, "zq" in attendu ? attendu.zq : undefined);
  }
});

test("lienPartageWhatsApp : le message est encodé en entier et ne reçoit rien d'autre", () => {
  const texte = "Produits de Delmas & Tabarre sur Zabelie : https://x.example/catalogue?zd=1&zk=2 #zone";
  const lien = lienPartageWhatsApp(texte);
  assert.ok(lien.startsWith("https://wa.me/?text="));
  assert.equal(new URL(lien).searchParams.get("text"), texte, "& et # du message ne coupent pas le texte");
  assert.deepEqual([...new URL(lien).searchParams.keys()], ["text"]);
});

// ───────────── les libellés ─────────────

test("le message porte la zone et le lien dans les quatre langues ; le libellé du bouton existe", () => {
  for (const lang of LANGS) {
    const d = DICT[lang];
    assert.match(d["zshare.text"], /\{zone\}/, lang);
    assert.match(d["zshare.text"], /\{url\}/, lang);
    assert.ok(d["zshare.cta"].length > 12, lang);
    const rendu = t(lang, "zshare.text", { zone: "Delmas 33, Delmas", url: "https://z.example/catalogue?zd=1" });
    assert.ok(rendu.includes("Delmas 33, Delmas") && rendu.includes("https://z.example/catalogue?zd=1"), lang);
    assert.ok(!/\{(zone|url)\}/.test(rendu), `variable non remplacée en ${lang}`);
  }
});

// ───────────── la page : ce qui COMMANDE ─────────────

const PAGE = sansCommentairesTs(lire("app/catalogue/page.tsx"));

test("catalogue : le lien n'existe que pour une zone SEULE avec des offres, construit sur la zone du FILTRE", () => {
  assert.match(PAGE, /const lienZone = zoneSeule && zoneActive && total > 0 \? lienCatalogueZone\(siteUrl\(\), zones, zoneActive\) : null;/);
  assert.match(PAGE, /\{lienZone && zoneActive \? \(\s*<a\s+href=\{lienPartageWhatsApp\(t\(lang, "zshare\.text", \{ zone: texteLieu\(zones, zoneActive, lang\), url: lienZone \}\)\)\}/);
});

test("catalogue : le lien s'ouvre à part, sans référent, et ne dépend pas du cookie de zone", () => {
  const bloc = PAGE.slice(PAGE.indexOf("{lienZone && zoneActive ? ("), PAGE.indexOf("{t(lang, \"zshare.cta\")}"));
  assert.ok(bloc.length > 100, "bloc du lien introuvable");
  assert.match(bloc, /target="_blank"\s+rel="noopener noreferrer"/);
  assert.doesNotMatch(bloc, /maZone|lireZoneAcheteur|cookie/i, "la zone partagée ne vient jamais du cookie");
  assert.doesNotMatch(PAGE.slice(PAGE.indexOf("const lienZone"), PAGE.indexOf("const lienZone") + 200), /maZone/);
});

test("le module du lien ne stocke ni ne lit rien : pas de cookie, pas de stockage, pas de réseau, pas de base", () => {
  const src = sansCommentairesTs(lire("lib/zone-partage.ts"));
  assert.doesNotMatch(src, /cookies|localStorage|sessionStorage|fetch\(|supabase|document\.|window\./);
  assert.doesNotMatch(src, /utm_|ref=|track/i);
});
