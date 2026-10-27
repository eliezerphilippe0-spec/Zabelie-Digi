import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lireSignaux } from "../lib/vendeur-signaux";
import { DICT, LANGS } from "../lib/i18n";

/**
 * SIGNAUX DE DEMANDE (docs/75 §5.C, PR-Z4 ; V-24 A7). Ce qui est gardé : la
 * base ne rend que des totaux (0156) et l'application REFUSE ce qui ne devrait
 * pas sortir — un nombre exact de paniers sous 3, un terme cherché par moins de
 * 5 sessions, un champ inattendu. Une réponse douteuse fait taire la section.
 */

const lire = (f: string) => readFileSync(f, "utf8");
const valide = {
  fenetre_jours: 30,
  abonnes: 2,
  paniers: [{ titre: "Panno solè", paniers: 4, moins_de_3: false }, { titre: "Batri", paniers: null, moins_de_3: true }],
  recherches: [{ terme: "konvètisè", sessions: 5, mon_rayon: true }],
};

test("VS1 — une réponse conforme est lue telle quelle", () => {
  assert.deepEqual(lireSignaux(valide), valide);
  assert.deepEqual(lireSignaux({ ...valide, paniers: [], recherches: [] })?.abonnes, 2);
});

test("VS2 — fail-closed : ce qui ne devrait pas sortir fait taire la section", () => {
  const refus: [string, unknown][] = [
    ["2 paniers exacts", { ...valide, paniers: [{ titre: "x", paniers: 2, moins_de_3: false }] }],
    ["moins de 3 avec un nombre", { ...valide, paniers: [{ titre: "x", paniers: 2, moins_de_3: true }] }],
    ["≥ 3 sans nombre", { ...valide, paniers: [{ titre: "x", paniers: null, moins_de_3: false }] }],
    ["4 sessions", { ...valide, recherches: [{ terme: "x", sessions: 4, mon_rayon: false }] }],
    ["identifiant d'acheteur", { ...valide, paniers: [{ titre: "x", paniers: 4, moins_de_3: false, buyer_id: "u" }] }],
    ["champ en plus", { ...valide, acheteurs: [] }],
    ["fenêtre inconnue", { ...valide, fenetre_jours: 7 }],
    ["abonnés négatifs", { ...valide, abonnes: -1 }],
    ["onze termes", { ...valide, recherches: Array.from({ length: 11 }, (_, i) => ({ terme: `t${i}`, sessions: 5, mon_rayon: false })) }],
    ["null", null],
    ["texte", "erreur"],
  ];
  for (const [nom, brut] of refus) assert.equal(lireSignaux(brut), null, nom);
});

test("VS3 — la page : lecture par la session, section muette sans réponse conforme", () => {
  const page = lire("app/tableau-de-bord/clients/page.tsx");
  assert.match(page, /await \(await createClient\(\)\)\.rpc\("zabelie_vendeur_signaux"\)/);
  assert.doesNotMatch(page, /createAdminClient\(\)\s*\.rpc\("zabelie_vendeur_signaux"\)/);
  assert.match(page, /const signaux = signauxErr \? null : lireSignaux\(brut\);/);
  assert.match(page, /\{signaux && \(/);
  assert.match(page, /p\.moins_de_3 \|\| p\.paniers === null\s*\? t\(lang, "vendeur\.signaux\.paniers\.peu"\)/);
});

test("VS4 — la migration : totaux seulement, seuils, appel par la session, sonde à jour", () => {
  const sql = lire("supabase/migrations/0156_zabelie_vendeur_signaux.sql");
  assert.match(sql, /security definer\s+set search_path = public, pg_temp/);
  assert.match(sql, /v_moi\s+uuid := auth\.uid\(\);/);
  assert.match(sql, /raise exception 'ZB156 : session requise' using errcode = '42501';/);
  assert.match(sql, /'paniers', case when x\.n >= 3 then x\.n end,\s*'moins_de_3', x\.n < 3/);
  assert.match(sql, /c\.buyer_id <> v_moi/);
  assert.match(sql, /greatest\(5, coalesce\(min_sessions, 5\)\)/);
  assert.match(sql, /m\.term !~ '\[0-9\]\{6,\}'/);
  assert.match(sql, /position\('@' in m\.term\) = 0/);
  assert.match(sql, /revoke all on function zabelie_vendeur_signaux\(\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function zabelie_vendeur_signaux\(\) to authenticated, service_role;/);
  assert.match(sql, /\('zabelie_vendeur_signaux\(\)', '/);
  for (const fuite of ["buyer_id',", "session_hash',", "cart_id',", "user_id',"]) assert.equal(sql.includes(`'${fuite}`), false, fuite);
});

test("VS5 — textes en quatre langues", () => {
  const cles = ["vendeur.signaux.titre", "vendeur.signaux.intro", "vendeur.signaux.abonnes", "vendeur.signaux.paniers",
    "vendeur.signaux.paniers.peu", "vendeur.signaux.paniers.vide", "vendeur.signaux.recherches", "vendeur.signaux.rayon",
    "vendeur.signaux.recherches.vide"] as const;
  for (const lang of LANGS) {
    for (const k of cles) assert.ok(DICT[lang][k]?.trim(), `${lang} ${k}`);
    for (const k of ["vendeur.signaux.paniers.n", "vendeur.signaux.recherches.n"] as const) assert.ok(DICT[lang][k].includes("{n}"), `${lang} ${k}`);
  }
  for (const k of cles) assert.notEqual(DICT.ht[k], DICT.fr[k], `${k} : le kreyòl recopie le français`);
});
