import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commandesPour100Vues, estVisiteHumaine, jourHaiti, totalVues } from "../lib/boutik-visites-calcul";
import { DICT, LANGS } from "../lib/i18n";

/**
 * VISITES DES VITRINES (docs/75 §5.A, PR-Z2 ; V-24 A4). Ce qui est gardé : seul
 * un vrai navigateur compte ; le comptage part après la réponse et ne casse
 * jamais la vitrine ; la base n'apprend rien sur le visiteur ; seul le service
 * écrit ; le vendeur lit ses chiffres par la RLS, et la section se tait si la
 * mesure n'existe pas encore.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const h = (o: Record<string, string>) => new Headers(o);
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

test("VV1 — un vrai navigateur compte, y compris une navigation interne", () => {
  for (const ua of [CHROME_ANDROID,
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0"]) {
    assert.equal(estVisiteHumaine(h({ "user-agent": ua })), true, ua);
  }
  assert.equal(estVisiteHumaine(h({ "user-agent": CHROME_ANDROID, rsc: "1" })), true, "navigation interne réelle");
});

test("VV2 — robots, aperçus de liens, navigateurs sans écran et préchargements ne comptent pas", () => {
  for (const ua of ["", "Mozilla", "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "WhatsApp/2.24.21.80 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "curl/8.7.1", "python-requests/2.32.3", "node-fetch/1.0", "Mozilla/5.0 (compatible; Discordbot/2.0)"]) {
    assert.equal(estVisiteHumaine(h({ "user-agent": ua })), false, ua || "(vide)");
  }
  const prechargements: Record<string, string>[] = [{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }];
  for (const entete of prechargements) {
    assert.equal(estVisiteHumaine(h({ "user-agent": CHROME_ANDROID, ...entete })), false, JSON.stringify(entete));
  }
});

test("VV3 — jour civil d'Haïti, totaux revérifiés, rapport borné", () => {
  assert.equal(jourHaiti(new Date("2026-10-27T03:00:00Z")), "2026-10-26", "23 h à Port-au-Prince : encore la veille");
  assert.equal(jourHaiti(new Date("2026-10-27T12:00:00Z"), -29), "2026-09-28");
  assert.equal(totalVues([{ jour: "2026-10-26", vues: 40 }, { jour: "2026-09-28", vues: 60 }, { jour: "2026-09-27", vues: 999 },
    { jour: "2026-10-01", vues: -5 }, { jour: "2026-10-02", vues: 1.5 }], "2026-09-28"), 100);
  assert.equal(commandesPour100Vues(1, 100), 1);
  assert.equal(commandesPour100Vues(1, 3), 33.3);
  assert.equal(commandesPour100Vues(0, 50), 0);
  assert.equal(commandesPour100Vues(3, 0), null, "pas de vue : pas de rapport inventé");
  assert.equal(commandesPour100Vues(-1, 10), null);
});

test("VV4 — câblage : comptage après la réponse, jamais bloquant, sur les trois adresses de la vitrine", () => {
  const vue = lire("components/boutique-vue.tsx");
  assert.match(vue, /compterVisite\(creator\.id, await headers\(\)\);/);
  const ecriture = lire("lib/boutik-visites.ts");
  assert.match(ecriture, /if \(!vendeurId \|\| !estVisiteHumaine\(entetes\)\) return;/);
  assert.match(ecriture, /after\(async \(\) => \{\s*try \{\s*await createAdminClient\(\)\.rpc\("zabelie_boutik_visite", \{ p_seller: vendeurId \}\);\s*\} catch/);
  for (const page of ["app/boutik/[slug]/page.tsx", "app/createur/[id]/page.tsx"]) assert.match(lire(page), /<BoutiqueVue/, page);
});

test("VV5 — lecture vendeur : RLS de session, mêmes ventes réelles que « Mes clients », section muette sans mesure", () => {
  const page = lire("app/tableau-de-bord/boutique/page.tsx");
  assert.match(page, /await \(await createClient\(\)\)\s*\.from\("zabelie_boutik_visites"\)/);
  assert.doesNotMatch(page, /admin\s*\.from\("zabelie_boutik_visites"\)/);
  assert.match(page, /if \(!visErr\) \{/);
  assert.match(page, /\{mesure && \(/);
  assert.match(page, /\.eq\("zabelie_payment_is_live", true\)/);
  assert.match(page, /estVenteReelle\(l, user\.id\)/);
});

test("VV6 — la migration : rien sur le visiteur, écriture réservée au service, sonde à jour", () => {
  const sql = lire("supabase/migrations/0155_zabelie_boutik_visites.sql");
  const table = /create table zabelie_boutik_visites \(([\s\S]*?)\n\);/.exec(sql)?.[1] ?? "";
  const colonnes = [...table.matchAll(/^\s+([a-z_]+)\s+(?:uuid|date|integer)/gm)].map((m) => m[1]);
  assert.deepEqual(colonnes, ["seller_id", "jour", "vues"], "aucune colonne sur le visiteur");
  assert.match(sql, /alter table zabelie_boutik_visites enable row level security;/);
  assert.match(sql, /revoke all on zabelie_boutik_visites from public, anon, authenticated;/);
  assert.match(sql, /grant select on zabelie_boutik_visites to authenticated;/);
  assert.match(sql, /security definer\s+set search_path = public/);
  assert.match(sql, /revoke all on function zabelie_boutik_visite\(uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function zabelie_boutik_visite\(uuid\) to service_role;/);
  assert.match(sql, /\('zabelie_boutik_visite\(uuid\)', '/);
  assert.match(sql, /jour < v_jour - 400/);
});

test("VV7 — textes en quatre langues", () => {
  const cles = ["vendeur.visites.titre", "vendeur.visites.vues", "vendeur.visites.commandes", "vendeur.visites.taux", "vendeur.visites.aide"] as const;
  for (const lang of LANGS) for (const k of cles) assert.ok(DICT[lang][k]?.trim(), `${lang} ${k}`);
  for (const k of cles) assert.notEqual(DICT.ht[k], DICT.fr[k], `${k} : le kreyòl recopie le français`);
});
