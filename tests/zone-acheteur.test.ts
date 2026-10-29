import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COOKIE_ZONE, ZONE_JOURS, optionsCookieZone, paramsCatalogue, texteLieu, zoneMemorisee } from "../lib/zone-acheteur";
import { zoneDepuisTexte } from "../lib/proximite";
import { POLITIQUE } from "../lib/policy-privacy";
import { DICT, LANGS } from "../lib/i18n";
import { CONFIDENTIALITE_VERSION } from "../lib/legal-acceptance";
import type { Zone } from "../lib/zones";

/**
 * La zone MÉMORISÉE de l'acheteur (docs/77 §11) : cookie `zabelie_zone`, choix du
 * porteur le 2026-10-29 (« Cookie + politique v4 »). Les tests prouvent trois
 * choses : le cookie ne désigne jamais qu'une zone OUVERTE, il est déclaré dans
 * la politique avec sa vraie durée, et il n'est JAMAIS appliqué d'office.
 */

// Un chiffre hexadécimal « a » dans chaque identifiant : sans lettre, la version en MAJUSCULES serait identique et le test de casse ne vérifierait rien.
const U = (n: number) => `00000000-0000-4000-8000-0000000a${String(n).padStart(4, "0")}`;
const Z = (id: string, level: Zone["level"], parent: string | null, kr: string, fr: string): Zone => ({
  id, parent_id: parent, level, slug: fr.toLowerCase().replace(/[^a-z]+/g, "-"), label_kr: kr, label_fr: fr, label_en: null, label_es: null,
});
// Deux communes qui ont chacune un quartier « Centre-ville » : le cas où le seul nom est AMBIGU.
const ZONES: Zone[] = [
  Z(U(1), "depatman", null, "Nò", "Nord"),
  Z(U(2), "depatman", null, "Lwès", "Ouest"),
  Z(U(10), "komin", U(1), "Okap", "Cap-Haïtien"),
  Z(U(11), "komin", U(2), "Pòtoprens", "Port-au-Prince"),
  Z(U(20), "katye", U(10), "Sant vil", "Centre-ville"),
  Z(U(21), "katye", U(11), "Sant vil", "Centre-ville"),
  Z(U(22), "katye", U(10), "Karenaj", "Carénage"),
];
const parId = (id: string) => ZONES.find((z) => z.id === id)!;

// ───────────────────────── zoneMemorisee ──────────────────────────────────────

test("zoneMemorisee : une zone ouverte, par son identifiant — majuscules comprises", () => {
  assert.equal(zoneMemorisee(ZONES, U(10))?.id, U(10));
  assert.equal(zoneMemorisee(ZONES, U(22))?.label_fr, "Carénage");
  assert.notEqual(U(10).toUpperCase(), U(10), "instrument : la majuscule doit changer quelque chose");
  assert.equal(zoneMemorisee(ZONES, U(10).toUpperCase())?.id, U(10));
});

test("zoneMemorisee : connus-négatifs — absente, illisible, forgée, inconnue, zone FERMÉE", () => {
  assert.equal(zoneMemorisee(ZONES, undefined), null);
  assert.equal(zoneMemorisee(ZONES, ""), null);
  assert.equal(zoneMemorisee(ZONES, 42), null);
  assert.equal(zoneMemorisee(ZONES, "Okap"), null, "un nom n'est pas un identifiant");
  assert.equal(zoneMemorisee(ZONES, "'; drop table zabelie_zones; --"), null);
  assert.equal(zoneMemorisee(ZONES, U(999)), null, "identifiant bien formé mais inconnu");
  // La liste ne porte que les zones OUVERTES (RLS) : une zone fermée depuis la pose du cookie en est absente.
  const sansOkap = ZONES.filter((z) => z.id !== U(10));
  assert.equal(zoneMemorisee(sansOkap, U(10)), null);
});

// ───────────────────────── texteLieu ──────────────────────────────────────────

test("texteLieu : le quartier est suivi de sa commune, la commune et le département tout seuls", () => {
  assert.equal(texteLieu(ZONES, parId(U(22)), "fr"), "Carénage, Cap-Haïtien");
  assert.equal(texteLieu(ZONES, parId(U(22)), "ht"), "Karenaj, Okap");
  assert.equal(texteLieu(ZONES, parId(U(10)), "fr"), "Cap-Haïtien");
  assert.equal(texteLieu(ZONES, parId(U(1)), "ht"), "Nord", "« Nò » (2 lettres) n'est pas reconnu par le moteur : repli sur le français");
  assert.equal(texteLieu(ZONES, parId(U(2)), "ht"), "Lwès", "un nom de 3 lettres ou plus reste dans sa langue");
  assert.equal(texteLieu(ZONES, { ...parId(U(1)), id: U(777) }, "fr"), "", "zone hors de la liste : rien");
});

test("texteLieu : le moteur de reconnaissance retrouve EXACTEMENT la zone mémorisée, homonymes compris", () => {
  for (const lang of LANGS) {
    for (const zone of ZONES) {
      const texte = texteLieu(ZONES, zone, lang);
      assert.equal(zoneDepuisTexte(ZONES, texte)?.id, zone.id, `${lang} : « ${texte} » → ${zoneDepuisTexte(ZONES, texte)?.id}, attendu ${zone.id}`);
    }
  }
});

test("texteLieu : le seul nom d'un quartier homonyme est AMBIGU — c'est pourquoi la commune le suit", () => {
  assert.equal(zoneDepuisTexte(ZONES, "Centre-ville"), null, "instrument : sans la commune, le moteur refuse de deviner");
  assert.equal(zoneDepuisTexte(ZONES, texteLieu(ZONES, parId(U(21)), "fr"))?.id, U(21));
});

// ───────────────────────── paramsCatalogue ────────────────────────────────────

test("paramsCatalogue : le format du filtre du catalogue, au niveau de la zone", () => {
  assert.deepEqual(Object.fromEntries(new URLSearchParams(paramsCatalogue(ZONES, parId(U(22))))), { zd: U(1), zk: U(10), zq: U(22) });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(paramsCatalogue(ZONES, parId(U(10))))), { zd: U(1), zk: U(10) });
  assert.deepEqual(Object.fromEntries(new URLSearchParams(paramsCatalogue(ZONES, parId(U(1))))), { zd: U(1) });
  assert.equal(paramsCatalogue(ZONES, { ...parId(U(1)), id: U(777), parent_id: null }), "", "hors liste : pas de lien");
});

// ───────────────────────── le cookie ──────────────────────────────────────────

test("cookie : nom, durée et attributs — HttpOnly, SameSite=Lax, Secure en production, 180 jours", () => {
  assert.equal(COOKIE_ZONE, "zabelie_zone");
  assert.equal(ZONE_JOURS, 180);
  assert.deepEqual(optionsCookieZone(true), { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 180 * 86400 });
  assert.equal(optionsCookieZone(false).secure, false);
  assert.equal(optionsCookieZone(true, true).maxAge, 0, "effacer = durée nulle, mêmes attributs");
});

test("cookie : la durée écrite dans la politique est celle du code, dans les quatre langues", () => {
  for (const lang of LANGS) {
    const lignes = POLITIQUE[lang].sections.flatMap((s) => s.blocs.flatMap((b) => ("p" in b ? [b.p] : b.ul)));
    const ligne = lignes.find((l) => l.startsWith(`${COOKIE_ZONE} :`) || l.startsWith(`${COOKIE_ZONE}:`));
    assert.ok(ligne, `${lang} : la politique ne décrit pas ${COOKIE_ZONE}`);
    assert.ok(ligne.includes(`**${ZONE_JOURS}`), `${lang} : la durée de ${ZONE_JOURS} jours n'est pas écrite en gras`);
  }
});

test("politique : le cookie n'est pas classé « nécessaire » — c'est une préférence que l'utilisateur demande", () => {
  const fr = POLITIQUE.fr.sections.find((s) => s.ancre === "traceurs")!.blocs;
  const iZone = fr.findIndex((b) => "ul" in b && b.ul.some((l) => l.startsWith(COOKIE_ZONE)));
  assert.ok(iZone > 0);
  const intro = fr[iZone - 1];
  assert.ok("p" in intro && /Une préférence que vous demandez/.test(intro.p) && /n'est posée que si vous cliquez/.test(intro.p));
  const necessaire = fr.findIndex((b) => "p" in b && /Nécessaires au fonctionnement/.test(b.p));
  const liste = fr[necessaire + 1];
  assert.ok("ul" in liste && !liste.ul.some((l) => l.includes(COOKIE_ZONE)), "le cookie ne doit pas figurer parmi les nécessaires");
  for (const lang of LANGS) {
    const doc = POLITIQUE[lang].sections.find((s) => s.ancre === "traceurs")!.blocs;
    assert.match(String((doc[0] as { p: string }).p), /quatre|kat|four|cuatro/i, `${lang} : « quatre catégories » attendu`);
  }
});

test("politique : le reçu a changé de version avec le texte (confidentialite-v4)", () => {
  assert.equal(CONFIDENTIALITE_VERSION, "confidentialite-v4");
});

// ───────────────────────── la route ───────────────────────────────────────────

const SANS_COMMENTAIRES = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const ROUTE = SANS_COMMENTAIRES(readFileSync("app/api/zone/route.ts", "utf8"));

test("route : l'origine est contrôlée avant tout, aux deux verbes", () => {
  assert.equal((ROUTE.match(/if \(!memeOrigine\(req\)\) return erreurTraduite\("api\.access\.denied", 403/g) ?? []).length, 2);
});

test("route : le cookie ne reçoit QUE l'identifiant d'une zone ouverte validée, jamais le corps reçu", () => {
  assert.match(ROUTE, /const zone = zoneMemorisee\(await getZonesActives\(\), zoneId\);\s*if \(!zone\) return erreurTraduite\("api\.params\.invalid", 422, \{ code: "zone_inconnue" \}\);/);
  assert.match(ROUTE, /reponse\.cookies\.set\(COOKIE_ZONE, zone\.id, optionsCookieZone\(production\(\)\)\)/);
  assert.doesNotMatch(ROUTE, /cookies\.set\(COOKIE_ZONE, (?:zoneId|body)/);
});

test("route : l'oubli efface avec les MÊMES attributs, durée nulle", () => {
  assert.match(ROUTE, /reponse\.cookies\.set\(COOKIE_ZONE, "", optionsCookieZone\(production\(\), true\)\)/);
});

test("route : aucune écriture en base, aucun compte, aucune donnée personnelle", () => {
  assert.doesNotMatch(ROUTE, /createAdminClient|createClient|supabase|\.insert\(|\.update\(|\.from\(/);
});

test("lecteur serveur : lit le cookie, ne touche jamais la base", () => {
  const src = SANS_COMMENTAIRES(readFileSync("lib/zone-acheteur-serveur.ts", "utf8"));
  assert.match(src, /zoneMemorisee\(zones, \(await cookies\(\)\)\.get\(COOKIE_ZONE\)\?\.value\)/);
  assert.doesNotMatch(src, /supabase|createClient|\.from\(/);
});

// ───────────────────────── le composant ───────────────────────────────────────

const COMPOSANT = readFileSync("components/ma-zone.tsx", "utf8");

test("composant : client, libellés en props (jamais t()), le cookie n'est jamais lu côté client", () => {
  assert.match(COMPOSANT, /^"use client";/);
  assert.doesNotMatch(SANS_COMMENTAIRES(COMPOSANT), /from "@\/lib\/i18n"|document\.cookie/);
});

test("composant : la zone visée est la plus profonde choisie, et rien ne part sans zone", () => {
  assert.match(COMPOSANT, /const cible = zq \|\| zk \|\| zd;/);
  assert.match(COMPOSANT, /onClick=\{\(\) => void appeler\("POST"\)\} disabled=\{!cible \|\| busy\}/);
  assert.match(COMPOSANT, /body: methode === "POST" \? JSON\.stringify\(\{ zoneId: cible \}\) : undefined/);
});

test("composant : l'écran se rafraîchit après l'acte, et une erreur est dite", () => {
  assert.match(COMPOSANT, /if \(!res\.ok\) \{ setErreur\(true\); return; \}[\s\S]{0,120}router\.refresh\(\)/);
  assert.match(COMPOSANT, /\{erreur \? <p role="alert"/);
});

test("libellés : maZone.* existe dans les quatre langues, avec {zone}, et dit la durée et le nom du cookie", () => {
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    for (const cle of ["titre", "aide", "actuelle", "memoriser", "encours", "oublier", "filtrer", "erreur"]) {
      assert.ok(d[`maZone.${cle}`]?.trim().length > 3, `${lang} : maZone.${cle} vide`);
    }
    assert.ok(d["maZone.actuelle"].includes("{zone}"), `${lang} : maZone.actuelle sans {zone}`);
    assert.ok(d["maZone.aide"].includes(COOKIE_ZONE) && d["maZone.aide"].includes(String(ZONE_JOURS)), `${lang} : l'aide ne dit pas ce qui est gardé et combien de temps`);
  }
});

test("libellés : l'action « Mémoriser » et la politique parlent des mêmes mots, dans les quatre langues", () => {
  for (const lang of LANGS) {
    const d = DICT[lang] as Record<string, string>;
    const lignes = POLITIQUE[lang].sections.flatMap((s) => s.blocs.flatMap((b) => ("ul" in b ? b.ul : [])));
    const ligne = lignes.find((l) => l.startsWith(COOKIE_ZONE)) ?? "";
    assert.ok(ligne.includes(d["maZone.memoriser"]), `${lang} : la politique ne cite pas le bouton « ${d["maZone.memoriser"]} »`);
    assert.ok(ligne.includes(d["maZone.oublier"]), `${lang} : la politique ne cite pas le bouton « ${d["maZone.oublier"]} »`);
  }
});

// ───────────────────────── l'intégration ──────────────────────────────────────

const ASSISTANT = readFileSync("app/assistant/page.tsx", "utf8");
const CATALOGUE = readFileSync("app/catalogue/page.tsx", "utf8");
const UI_ASSISTANT = readFileSync("components/shopping-assistant.tsx", "utf8");

test("assistant : la localité est préremplie par la zone mémorisée, et change de zone = repart de zéro", () => {
  assert.match(ASSISTANT, /const maZone = zones\.length \? await lireZoneAcheteur\(zones\) : null;/);
  assert.match(ASSISTANT, /<ShoppingAssistant key=\{maZone\?\.id \?\? "aucune"\} defaultLocation=\{maZone \? texteLieu\(zones, maZone, lang\) : ""\}/);
  assert.match(UI_ASSISTANT, /useState<ShoppingIntent>\(\{ \.\.\.EMPTY, location: defaultLocation \}\)/);
  assert.match(UI_ASSISTANT, /setIntent\(\{ \.\.\.EMPTY, location: defaultLocation \}\)/);
});

test("catalogue : la zone mémorisée est PROPOSÉE, jamais appliquée d'office", () => {
  // Le filtre actif ne dépend que de l'URL : un cookie ne peut pas faire varier ce que voit un robot ni un lien partagé.
  assert.match(CATALOGUE, /const zoneId = zqValide \|\| zkValide \|\| zd \|\| undefined;/);
  const calcul = CATALOGUE.slice(CATALOGUE.indexOf("const zkValide"), CATALOGUE.indexOf("const zoneId"));
  assert.doesNotMatch(calcul, /maZone/);
  assert.match(CATALOGUE, /hrefCatalogue=\{maZone && maZone\.id !== zoneId \? `\/catalogue\?\$\{paramsCatalogue\(zones, maZone\)\}` : undefined\}/);
  assert.match(CATALOGUE, /\{universe !== "numerique" && depatmans\.length > 0 \? \(\s*<div className="mt-4">\s*<MaZone/);
});

test("le cookie n'est lu que par les deux pages qui s'en servent", () => {
  const lecteurs = ["app", "components", "lib"].flatMap((d) => grep(d, /lireZoneAcheteur\(/)).filter((f) => !f.endsWith("zone-acheteur-serveur.ts"));
  assert.deepEqual(lecteurs.sort(), ["app/assistant/page.tsx", "app/catalogue/page.tsx"]);
});

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
function grep(dir: string, re: RegExp, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== "node_modules") grep(p, re, out); }
    else if (/\.tsx?$/.test(n) && re.test(readFileSync(p, "utf8"))) out.push(p);
  }
  return out;
}

// ───────────────────────── la migration 0160 ──────────────────────────────────

const MIG = readFileSync("supabase/migrations/0160_zabelie_confidentialite_v4.sql", "utf8");

test("0160 : CHAQUE fonction accepte v1, v3 et v4 (la fenêtre de déploiement), et rien d'autre", () => {
  const corps = MIG.split(/create (?:or replace )?function /).slice(1).map((b) => b.slice(0, b.indexOf("$$;")));
  assert.equal(corps.length, 2);
  for (const [i, f] of corps.entries()) {
    assert.match(f, /not in \('confidentialite-v1', 'confidentialite-v3', 'confidentialite-v4'\)/, `fonction ${i + 1}`);
    assert.doesNotMatch(f, /confidentialite-v2|confidentialite-v5/, `fonction ${i + 1} : une version inconnue`);
  }
});

test("0160 : la sonde finale exige les TROIS versions dans les DEUX fonctions", () => {
  assert.match(MIG, /like '%''confidentialite-v1''%'\s+and p\.prosrc like '%''confidentialite-v3''%'\s+and p\.prosrc like '%''confidentialite-v4''%'\) <> 2/);
});

test("0160 : le garde de rejeu d'abord, aucune suppression, aucun droit élargi", () => {
  assert.match(MIG, /^select zabelie_migration_garde\('0160_zabelie_confidentialite_v4\.sql'\);/);
  const sql = MIG.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(drop|delete|truncate)\b/i);
  assert.doesNotMatch(sql, /grant execute on function public\.zabelie_handle_new_user/);
  assert.match(sql, /revoke all on function public\.zabelie_accept_account_legal\(text,text,boolean,boolean\) from public, anon, authenticated;\s*grant execute on function public\.zabelie_accept_account_legal\(text,text,boolean,boolean\) to authenticated;/);
});

test("0160 : l'ordre obligatoire (migration AVANT le code) est écrit dans la migration ET dans le code", () => {
  assert.match(MIG, /ORDRE OBLIGATOIRE : appliquer CETTE migration AVANT de fusionner/);
  assert.match(readFileSync("lib/legal-acceptance.ts", "utf8"), /`0160` doit être APPLIQUÉE avant que cette ligne ne[\s*]+soit[\s*]+fusionnée/);
});

test("e2e : les faux Supabase portent la version EN VIGUEUR (v4)", () => {
  for (const f of ["e2e/fixtures/stub-supabase.mjs", "e2e/fixtures/stub-creation.mjs"]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /confidentialite-v4/, f);
    assert.doesNotMatch(src, /confidentialite-v3/, f);
  }
});
